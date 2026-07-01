import {
	createHmac,
	createPrivateKey,
	createSign,
	randomUUID,
} from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/lib/env";
import {
	getCodeWorkspaceFilesForPublish,
	isTextWorkspacePath,
	normalizeWorkspacePath,
} from "@/modules/code-workspace/storage";
import { db } from "@/server/infrastructure/db";
import {
	githubPublishEvents,
	userGithubConnections,
	userGithubRepositories,
} from "@/server/infrastructure/db/schema";

type GitHubPublishMode = "pull_request" | "direct_push";

export type GitHubRepositorySummary = {
	id: string;
	connectionId: string;
	owner: string;
	name: string;
	fullName: string;
	private: boolean;
	defaultBranch: string;
	permissions: Record<string, unknown> | null;
	access: "admin" | "maintain" | "write" | "triage" | "read" | "unknown";
	relationship: "account" | "collaborator";
};

export type GitHubConnectionSummary = {
	id: string;
	installationId: string;
	accountLogin: string;
	accountType: string | null;
	repositorySelection: string | null;
	settingsUrl: string | null;
	lastSyncedAt: string | null;
};

export type GitHubPublishResult = {
	kind: "github_publish_result";
	mode: GitHubPublishMode;
	repository: string;
	targetBranch: string;
	sourceBranch: string | null;
	commitSha: string;
	pullRequestUrl: string | null;
	files: Array<{ path: string; size: number }>;
	message: string;
};

const githubApiBaseUrl = "https://api.github.com";
const githubStateMaxAgeMs = 10 * 60 * 1000;
const githubRepositorySyncPageSize = 100;
const githubRepositorySyncMaxPages = 30;
const maxCommitFiles = 500;
const maxCommitBytes = 50 * 1024 * 1024;
const blockedPublishPathPatterns = [
	/(^|\/)\.env(?:\.|$)/i,
	/(^|\/)\.github\/workflows\//i,
	/(^|\/)id_rsa$/i,
	/\.(?:pem|key|p12|pfx)$/i,
];
const secretPatterns = [
	/GH[PSU]_[A-Za-z0-9_]{20,}/,
	/github_pat_[A-Za-z0-9_]{20,}/,
	/sk-[A-Za-z0-9]{20,}/,
	/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
	/(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"']{16,}["']/i,
];

function githubPublishLog(
	stage: string,
	metadata: Record<string, unknown>,
	level: "info" | "error" = "info",
) {
	console[level]("[github-publish]", { stage, ...metadata });
}

const publishInputSchema = z.object({
	workspaceId: z.uuid(),
	userId: z.uuid(),
	projectId: z.uuid(),
	repositoryId: z.uuid(),
	mode: z.enum(["pull_request", "direct_push"]),
	targetBranch: z.string().trim().min(1).max(255),
	sourceBranch: z.string().trim().min(1).max(255).optional(),
	targetDirectory: z.string().trim().max(260).optional(),
	commitMessage: z.string().trim().min(1).max(240),
	pullRequestTitle: z.string().trim().min(1).max(240).optional(),
	pullRequestBody: z.string().trim().max(4000).optional(),
	conversationId: z.uuid().optional(),
	agentId: z.uuid().optional(),
	confirmDirectPush: z.boolean().default(false),
});

export type PublishCodeWorkspaceInput = z.input<typeof publishInputSchema>;

function githubAppConfigured() {
	return Boolean(
		env.GITHUB_APP_ID && env.GITHUB_APP_SLUG && env.GITHUB_APP_PRIVATE_KEY,
	);
}

export function normalizeGitHubPrivateKey(rawValue: string) {
	let privateKey = rawValue.trim();
	privateKey = privateKey.replace(
		/^export\s+GITHUB_APP_PRIVATE_KEY\s*=\s*/i,
		"",
	);
	privateKey = privateKey.replace(/^GITHUB_APP_PRIVATE_KEY\s*=\s*/i, "");
	privateKey = privateKey.replace(/%$/, "").trim();
	const firstChar = privateKey[0];
	const lastChar = privateKey[privateKey.length - 1];
	const isQuoted =
		firstChar === lastChar && ['"', "'", "`"].includes(firstChar);
	if (isQuoted) {
		privateKey = privateKey.slice(1, -1).trim();
	}
	privateKey = privateKey
		.replace(/\\r\\n/g, "\n")
		.replace(/\\n/g, "\n")
		.replace(/\\r/g, "\n")
		.replace(/\r\n/g, "\n")
		.replace(/\r/g, "\n")
		.trim();

	if (!privateKey.includes("-----BEGIN")) {
		const compact = privateKey.replace(/\s+/g, "");
		if (/^[A-Za-z0-9+/=]+$/.test(compact)) {
			const decoded = Buffer.from(compact, "base64").toString("utf8").trim();
			if (decoded.includes("-----BEGIN")) privateKey = decoded;
		}
	}

	const pemMatch = privateKey.match(
		/-----BEGIN ([^-]+)-----\s*([A-Za-z0-9+/=\s]+)\s*-----END \1-----/,
	);
	if (pemMatch) {
		const label = pemMatch[1];
		const body = pemMatch[2].replace(/\s+/g, "");
		const wrappedBody = body.match(/.{1,64}/g)?.join("\n") ?? body;
		privateKey = `-----BEGIN ${label}-----\n${wrappedBody}\n-----END ${label}-----\n`;
	}

	return privateKey;
}

function requireGitHubAppConfig() {
	if (!githubAppConfigured()) {
		throw new Error(
			"GitHub publishing is not configured. Set GITHUB_APP_ID, GITHUB_APP_SLUG, and GITHUB_APP_PRIVATE_KEY.",
		);
	}
	try {
		return {
			appId: env.GITHUB_APP_ID!,
			appSlug: env.GITHUB_APP_SLUG!,
			privateKey: createPrivateKey(
				normalizeGitHubPrivateKey(env.GITHUB_APP_PRIVATE_KEY!),
			),
		};
	} catch {
		throw new Error(
			"Invalid GITHUB_APP_PRIVATE_KEY. Paste the full GitHub App PEM private key, using escaped \\n newlines in env managers and no literal wrapping quotes.",
		);
	}
}

function base64Url(value: Buffer | string) {
	return Buffer.from(value)
		.toString("base64")
		.replace(/=/g, "")
		.replace(/\+/g, "-")
		.replace(/\//g, "_");
}

function signGitHubAppJwt() {
	const { appId, privateKey } = requireGitHubAppConfig();
	const now = Math.floor(Date.now() / 1000);
	const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
	const payload = base64Url(
		JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }),
	);
	const unsigned = `${header}.${payload}`;
	const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey);
	return `${unsigned}.${base64Url(signature)}`;
}

async function githubRequest<T>(
	path: string,
	token: string,
	options: RequestInit = {},
): Promise<T> {
	const response = await fetch(`${githubApiBaseUrl}${path}`, {
		...options,
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${token}`,
			"X-GitHub-Api-Version": "2022-11-28",
			...(options.body ? { "Content-Type": "application/json" } : {}),
			...options.headers,
		},
	});
	const text = await response.text();
	const body = text
		? (() => {
				try {
					return JSON.parse(text) as unknown;
				} catch {
					return null;
				}
			})()
		: null;
	if (!response.ok) {
		const message =
			typeof body === "object" &&
			body !== null &&
			"message" in body &&
			typeof (body as { message?: unknown }).message === "string"
				? (body as { message: string }).message
				: response.statusText;
		githubPublishLog(
			"github-api-error",
			{
				method: options.method ?? "GET",
				path,
				status: response.status,
				message,
			},
			"error",
		);
		throw new Error(`GitHub API error (${response.status}): ${message}`);
	}
	return body as T;
}

async function getInstallationToken(installationId: string) {
	const appJwt = signGitHubAppJwt();
	const result = await githubRequest<{ token: string; expires_at: string }>(
		`/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
		appJwt,
		{ method: "POST", body: JSON.stringify({}) },
	);
	return result.token;
}

function stateSecret() {
	return env.APP_ENCRYPTION_KEY;
}

export function createGitHubState(input: {
	userId: string;
	workspaceId: string;
}) {
	const payload = base64Url(
		JSON.stringify({
			userId: input.userId,
			workspaceId: input.workspaceId,
			expiresAt: Date.now() + githubStateMaxAgeMs,
			nonce: randomUUID(),
		}),
	);
	const signature = base64Url(
		createHmac("sha256", stateSecret()).update(payload).digest(),
	);
	return `${payload}.${signature}`;
}

export function parseGitHubState(state: string) {
	const [payload, signature] = state.split(".");
	if (!payload || !signature) throw new Error("Invalid GitHub state.");
	const expected = base64Url(
		createHmac("sha256", stateSecret()).update(payload).digest(),
	);
	if (signature !== expected)
		throw new Error("Invalid GitHub state signature.");
	let parsed: { userId?: unknown; workspaceId?: unknown; expiresAt?: unknown };
	try {
		parsed = JSON.parse(
			Buffer.from(
				payload.replace(/-/g, "+").replace(/_/g, "/"),
				"base64",
			).toString("utf8"),
		);
	} catch {
		throw new Error("Failed to parse GitHub state payload.");
	}
	if (
		typeof parsed.userId !== "string" ||
		typeof parsed.workspaceId !== "string" ||
		typeof parsed.expiresAt !== "number" ||
		parsed.expiresAt < Date.now()
	) {
		throw new Error("GitHub state expired or invalid.");
	}
	return {
		userId: parsed.userId,
		workspaceId: parsed.workspaceId,
	};
}

export function createGitHubConnectUrl(input: {
	origin: string;
	workspaceId: string;
	userId: string;
}) {
	const { appSlug } = requireGitHubAppConfig();
	const state = createGitHubState({
		userId: input.userId,
		workspaceId: input.workspaceId,
	});
	let url: URL;
	try {
		url = new URL(`https://github.com/apps/${appSlug}/installations/new`);
	} catch {
		throw new Error("Failed to construct GitHub connect URL");
	}
	url.searchParams.set("state", state);
	return url.toString();
}

function normalizePermissions(value: unknown) {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: null;
}

function normalizeRepositorySelection(value: unknown) {
	return typeof value === "string" && value.trim() ? value : null;
}

function permissionEnabled(
	permissions: Record<string, unknown> | null,
	key: string,
) {
	return permissions?.[key] === true;
}

export function describeGitHubRepositoryAccess(
	permissions: Record<string, unknown> | null,
): GitHubRepositorySummary["access"] {
	if (!permissions) return "unknown";
	if (permissionEnabled(permissions, "admin")) return "admin";
	if (permissionEnabled(permissions, "maintain")) return "maintain";
	if (permissionEnabled(permissions, "push")) return "write";
	if (permissionEnabled(permissions, "triage")) return "triage";
	if (permissionEnabled(permissions, "pull")) return "read";
	return "unknown";
}

export function describeGitHubRepositoryRelationship(input: {
	accountLogin: string | null;
	owner: string;
}): GitHubRepositorySummary["relationship"] {
	return input.accountLogin?.toLowerCase() === input.owner.toLowerCase()
		? "account"
		: "collaborator";
}

export function canAttemptGitHubRepositoryPublish(
	permissions: Record<string, unknown> | null,
) {
	const access = describeGitHubRepositoryAccess(permissions);
	return (
		access === "unknown" ||
		access === "admin" ||
		access === "maintain" ||
		access === "write"
	);
}

function trustedGitHubUrl(value: unknown) {
	if (typeof value !== "string") return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && url.hostname === "github.com"
			? url.toString()
			: null;
	} catch {
		return null;
	}
}

function createGitHubInstallationSettingsUrl(input: {
	installationId: string;
	accountLogin?: string | null;
	accountType?: string | null;
	htmlUrl?: string | null;
}) {
	const htmlUrl = trustedGitHubUrl(input.htmlUrl);
	if (htmlUrl) return htmlUrl;
	const encodedInstallationId = encodeURIComponent(input.installationId);
	if (input.accountType === "Organization" && input.accountLogin) {
		return `https://github.com/organizations/${encodeURIComponent(input.accountLogin)}/settings/installations/${encodedInstallationId}`;
	}
	return `https://github.com/settings/installations/${encodedInstallationId}`;
}

type GitHubInstallationRepository = {
	id: number;
	name: string;
	full_name: string;
	private: boolean;
	default_branch: string;
	owner: { login: string };
	permissions?: unknown;
};

async function fetchInstallationRepositories(token: string) {
	const repositories: GitHubInstallationRepository[] = [];
	for (let page = 1; page <= githubRepositorySyncMaxPages; page += 1) {
		const result = await githubRequest<{
			repositories: GitHubInstallationRepository[];
		}>(
			`/installation/repositories?per_page=${githubRepositorySyncPageSize}&page=${page}`,
			token,
		);
		repositories.push(...result.repositories);
		if (result.repositories.length < githubRepositorySyncPageSize) break;
	}
	return repositories;
}

export async function syncGitHubInstallation(input: {
	userId: string;
	installationId: string;
}) {
	const appJwt = signGitHubAppJwt();
	const installation = await githubRequest<{
		id: number;
		account?: { id?: number; login?: string; type?: string } | null;
		html_url?: string | null;
		repository_selection?: string | null;
	}>(`/app/installations/${encodeURIComponent(input.installationId)}`, appJwt);
	const accountLogin = installation.account?.login ?? "GitHub";
	const accountId = installation.account?.id?.toString() ?? null;
	const accountType = installation.account?.type ?? null;
	const repositorySelection = normalizeRepositorySelection(
		installation.repository_selection,
	);
	const settingsUrl = createGitHubInstallationSettingsUrl({
		installationId: String(installation.id),
		accountLogin,
		accountType,
		htmlUrl: installation.html_url,
	});
	const syncedAt = new Date();

	const [connection] = await db
		.insert(userGithubConnections)
		.values({
			userId: input.userId,
			installationId: String(installation.id),
			accountLogin,
			accountId,
			accountType,
			repositorySelection,
			settingsUrl,
			lastSyncedAt: syncedAt,
			updatedAt: syncedAt,
		})
		.onConflictDoUpdate({
			target: [
				userGithubConnections.userId,
				userGithubConnections.installationId,
			],
			set: {
				accountLogin,
				accountId,
				accountType,
				repositorySelection,
				settingsUrl,
				lastSyncedAt: syncedAt,
				updatedAt: syncedAt,
			},
		})
		.returning();

	const installationToken = await getInstallationToken(String(installation.id));
	const repositories = await fetchInstallationRepositories(installationToken);

	await db
		.delete(userGithubRepositories)
		.where(eq(userGithubRepositories.connectionId, connection.id));
	if (repositories.length > 0) {
		await db
			.insert(userGithubRepositories)
			.values(
				repositories.map((repo) => ({
					connectionId: connection.id,
					userId: input.userId,
					githubRepositoryId: String(repo.id),
					owner: repo.owner.login,
					name: repo.name,
					fullName: repo.full_name,
					private: repo.private,
					defaultBranch: repo.default_branch,
					permissionsJson: normalizePermissions(repo.permissions),
					lastSyncedAt: syncedAt,
				})),
			)
			.onConflictDoUpdate({
				target: [
					userGithubRepositories.userId,
					userGithubRepositories.owner,
					userGithubRepositories.name,
				],
				set: {
					connectionId: sql`excluded.connection_id`,
					githubRepositoryId: sql`excluded.github_repository_id`,
					fullName: sql`excluded.full_name`,
					private: sql`excluded.private`,
					defaultBranch: sql`excluded.default_branch`,
					permissionsJson: sql`excluded.permissions_json`,
					lastSyncedAt: sql`excluded.last_synced_at`,
				},
			});
	}

	return getUserGitHubStatus({ userId: input.userId });
}

export async function syncUserGitHubInstallations(input: {
	userId: string;
	connectionId?: string;
}) {
	const query = input.connectionId
		? and(
				eq(userGithubConnections.userId, input.userId),
				eq(userGithubConnections.id, input.connectionId),
			)
		: eq(userGithubConnections.userId, input.userId);
	const connections = await db
		.select()
		.from(userGithubConnections)
		.where(query);

	for (const connection of connections) {
		await syncGitHubInstallation({
			userId: input.userId,
			installationId: connection.installationId,
		});
	}

	return getUserGitHubStatus({ userId: input.userId });
}

export async function getUserGitHubStatus(input: {
	userId: string;
	origin?: string;
	workspaceId?: string;
}) {
	const connections = await db
		.select()
		.from(userGithubConnections)
		.where(eq(userGithubConnections.userId, input.userId))
		.orderBy(desc(userGithubConnections.updatedAt));
	const repositories = await db
		.select()
		.from(userGithubRepositories)
		.where(eq(userGithubRepositories.userId, input.userId));
	const connectPath =
		githubAppConfigured() && input.workspaceId
			? `/api/workspace/github/connect?workspaceId=${encodeURIComponent(input.workspaceId)}`
			: null;
	const connectionsById = new Map(
		connections.map((connection) => [connection.id, connection]),
	);
	return {
		configured: githubAppConfigured(),
		connectPath,
		connectUrl:
			connectPath && input.origin
				? new URL(connectPath, input.origin).toString()
				: connectPath,
		connections: connections.map(
			(connection): GitHubConnectionSummary => ({
				id: connection.id,
				installationId: connection.installationId,
				accountLogin: connection.accountLogin,
				accountType: connection.accountType,
				repositorySelection: connection.repositorySelection,
				settingsUrl: connection.settingsUrl,
				lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
			}),
		),
		repositories: repositories
			.map((repo): GitHubRepositorySummary => {
				const permissions = normalizePermissions(repo.permissionsJson);
				const connection = connectionsById.get(repo.connectionId);
				return {
					id: repo.id,
					connectionId: repo.connectionId,
					owner: repo.owner,
					name: repo.name,
					fullName: repo.fullName,
					private: repo.private,
					defaultBranch: repo.defaultBranch,
					permissions,
					access: describeGitHubRepositoryAccess(permissions),
					relationship: describeGitHubRepositoryRelationship({
						accountLogin: connection?.accountLogin ?? null,
						owner: repo.owner,
					}),
				};
			})
			.sort((a, b) => a.fullName.localeCompare(b.fullName)),
	};
}

async function getUserRepository(input: {
	userId: string;
	repositoryId: string;
}) {
	const [repo] = await db
		.select()
		.from(userGithubRepositories)
		.where(
			and(
				eq(userGithubRepositories.userId, input.userId),
				eq(userGithubRepositories.id, input.repositoryId),
			),
		)
		.limit(1);
	if (!repo) throw new Error("GitHub repository not found for this user.");
	const [connection] = await db
		.select()
		.from(userGithubConnections)
		.where(
			and(
				eq(userGithubConnections.userId, input.userId),
				eq(userGithubConnections.id, repo.connectionId),
			),
		)
		.limit(1);
	if (!connection) throw new Error("GitHub connection not found.");
	return { repo, connection };
}

function assertSafeBranchName(branch: string) {
	if (
		branch.startsWith("/") ||
		branch.endsWith("/") ||
		branch.includes("..") ||
		branch.includes("@{") ||
		/[\\\s~^:?*[]/.test(branch)
	) {
		throw new Error("Invalid Git branch name.");
	}
	return branch;
}

function encodeRefPath(branch: string) {
	return assertSafeBranchName(branch)
		.split("/")
		.map(encodeURIComponent)
		.join("/");
}

function normalizeTargetDirectory(value: string | undefined) {
	if (!value?.trim()) return "";
	const normalized = normalizeWorkspacePath(value);
	return normalized.replace(/\/+$/g, "");
}

function prefixedPath(directory: string, filePath: string) {
	return directory ? `${directory}/${filePath}` : filePath;
}

function assertPublishPathAllowed(filePath: string) {
	if (blockedPublishPathPatterns.some((pattern) => pattern.test(filePath))) {
		throw new Error(`Publishing this path is blocked for safety: ${filePath}`);
	}
}

function scanTextForSecrets(filePath: string, bytes: Uint8Array) {
	if (!isTextWorkspacePath(filePath)) return;
	const text = Buffer.from(bytes).toString("utf8");
	if (secretPatterns.some((pattern) => pattern.test(text))) {
		throw new Error(
			`Potential secret detected in ${filePath}. Remove secrets before publishing to GitHub.`,
		);
	}
}

export async function listGitHubBranches(input: {
	userId: string;
	repositoryId: string;
}) {
	const { repo, connection } = await getUserRepository(input);
	const token = await getInstallationToken(connection.installationId);
	const branches = await githubRequest<
		Array<{ name: string; protected?: boolean; commit?: { sha?: string } }>
	>(
		`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/branches?per_page=100`,
		token,
	);
	return branches.map((branch) => ({
		name: branch.name,
		protected: Boolean(branch.protected),
		sha: branch.commit?.sha ?? null,
	}));
}

async function getGitRef(input: {
	token: string;
	owner: string;
	repo: string;
	branch: string;
}) {
	return githubRequest<{ object: { sha: string; type: string } }>(
		`/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/git/ref/heads/${encodeRefPath(input.branch)}`,
		input.token,
	);
}

async function gitRefExists(input: {
	token: string;
	owner: string;
	repo: string;
	branch: string;
}) {
	try {
		await getGitRef(input);
		return true;
	} catch (error) {
		if (
			error instanceof Error &&
			/GitHub API error \(404\)/.test(error.message)
		) {
			return false;
		}
		throw error;
	}
}

function isEmptyGitRepositoryError(error: unknown) {
	return (
		error instanceof Error &&
		/GitHub API error \(409\): Git Repository is empty/i.test(error.message)
	);
}

async function createGitRef(input: {
	token: string;
	owner: string;
	repo: string;
	branch: string;
	sha: string;
}) {
	return githubRequest(
		`/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/git/refs`,
		input.token,
		{
			method: "POST",
			body: JSON.stringify({
				ref: `refs/heads/${assertSafeBranchName(input.branch)}`,
				sha: input.sha,
			}),
		},
	);
}

function encodeRepositoryContentPath(filePath: string) {
	return filePath.split("/").map(encodeURIComponent).join("/");
}

async function createRepositoryFile(input: {
	token: string;
	owner: string;
	repo: string;
	branch: string;
	path: string;
	bytes: Uint8Array;
	message: string;
}) {
	return githubRequest<{ commit: { sha: string; tree?: { sha?: string } } }>(
		`/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/contents/${encodeRepositoryContentPath(input.path)}`,
		input.token,
		{
			method: "PUT",
			body: JSON.stringify({
				branch: input.branch,
				message: input.message,
				content: Buffer.from(input.bytes).toString("base64"),
			}),
		},
	);
}

async function getCommitTreeSha(input: {
	token: string;
	owner: string;
	repo: string;
	commitSha: string;
}) {
	const commit = await githubRequest<{ tree: { sha: string } }>(
		`/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/git/commits/${encodeURIComponent(input.commitSha)}`,
		input.token,
	);
	return commit.tree.sha;
}

function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getCommitTreeShaWithRetry(input: {
	token: string;
	owner: string;
	repo: string;
	commitSha: string;
	logContext: Record<string, unknown>;
}) {
	let lastError: unknown;
	for (let attempt = 1; attempt <= 5; attempt += 1) {
		try {
			return await getCommitTreeSha(input);
		} catch (error) {
			lastError = error;
			if (!isEmptyGitRepositoryError(error) || attempt === 5) break;
			githubPublishLog("commit-tree-retry", {
				...input.logContext,
				commitSha: input.commitSha,
				attempt,
			});
			await wait(500 * attempt);
		}
	}
	throw lastError;
}

async function initializeEmptyRepository(input: {
	token: string;
	owner: string;
	repo: string;
	branch: string;
	path: string;
	bytes: Uint8Array;
	logContext: Record<string, unknown>;
}) {
	githubPublishLog("empty-repository-initialize-start", {
		...input.logContext,
		initialPath: input.path,
	});
	const created = await createRepositoryFile({
		token: input.token,
		owner: input.owner,
		repo: input.repo,
		branch: input.branch,
		path: input.path,
		bytes: input.bytes,
		message: "Initialize repository for AI Hub publishing",
	});
	const commitSha = created.commit.sha;
	const treeSha =
		created.commit.tree?.sha ||
		(await getCommitTreeShaWithRetry({
			token: input.token,
			owner: input.owner,
			repo: input.repo,
			commitSha,
			logContext: input.logContext,
		}));
	githubPublishLog("empty-repository-initialize-success", {
		...input.logContext,
		initialPath: input.path,
		commitSha,
	});
	return { commitSha, treeSha };
}

async function publishEmptyRepositoryDirectPush(input: {
	token: string;
	owner: string;
	repo: string;
	branch: string;
	files: Array<{ path: string; bytes: Uint8Array; size: number }>;
	commitMessage: string;
	logContext: Record<string, unknown>;
}) {
	let commitSha = "";
	const publishedFiles: Array<{ path: string; size: number }> = [];
	for (const [index, file] of input.files.entries()) {
		githubPublishLog("empty-repository-file-create-start", {
			...input.logContext,
			path: file.path,
			index: index + 1,
			total: input.files.length,
		});
		const created = await createRepositoryFile({
			token: input.token,
			owner: input.owner,
			repo: input.repo,
			branch: input.branch,
			path: file.path,
			bytes: file.bytes,
			message: input.commitMessage,
		});
		commitSha = created.commit.sha;
		publishedFiles.push({ path: file.path, size: file.size });
		githubPublishLog("empty-repository-file-create-success", {
			...input.logContext,
			path: file.path,
			index: index + 1,
			total: input.files.length,
			commitSha,
		});
	}
	return { commitSha, files: publishedFiles };
}

export async function publishCodeWorkspaceToGitHub(
	input: PublishCodeWorkspaceInput,
): Promise<GitHubPublishResult> {
	const parsed = publishInputSchema.parse(input);
	if (parsed.mode === "direct_push" && !parsed.confirmDirectPush) {
		throw new Error("Direct push requires explicit user confirmation.");
	}
	const targetBranch = assertSafeBranchName(parsed.targetBranch);
	const targetDirectory = normalizeTargetDirectory(parsed.targetDirectory);
	const { repo, connection } = await getUserRepository({
		userId: parsed.userId,
		repositoryId: parsed.repositoryId,
	});
	if (
		!canAttemptGitHubRepositoryPublish(
			normalizePermissions(repo.permissionsJson),
		)
	) {
		throw new Error(
			"GitHub repository write access is required before publishing.",
		);
	}
	const workspace = await getCodeWorkspaceFilesForPublish({
		projectId: parsed.projectId,
		workspaceId: parsed.workspaceId,
		userId: parsed.userId,
	});
	if (workspace.files.length > maxCommitFiles) {
		throw new Error(`Too many files to publish. Maximum is ${maxCommitFiles}.`);
	}
	const totalBytes = workspace.files.reduce(
		(total, file) => total + file.bytes.byteLength,
		0,
	);
	if (totalBytes > maxCommitBytes) {
		throw new Error(
			"Code workspace is too large to publish. Maximum is 50 MB.",
		);
	}
	for (const file of workspace.files) {
		const publishPath = prefixedPath(targetDirectory, file.path);
		assertPublishPathAllowed(publishPath);
		scanTextForSecrets(publishPath, file.bytes);
	}

	const token = await getInstallationToken(connection.installationId);
	let sourceBranch =
		parsed.mode === "pull_request"
			? parsed.sourceBranch?.trim() ||
				`ai-hub/${workspace.metadata.id.slice(0, 8)}-${Date.now().toString(36)}`
			: targetBranch;
	sourceBranch = assertSafeBranchName(sourceBranch);
	let eventId: string | null = null;
	const logContext = {
		workspaceId: parsed.workspaceId,
		userId: parsed.userId,
		codeWorkspaceId: workspace.metadata.id,
		repository: repo.fullName,
		mode: parsed.mode,
		targetBranch,
		sourceBranch,
		targetDirectory: targetDirectory || null,
		fileCount: workspace.files.length,
		totalBytes,
	};
	githubPublishLog("start", logContext);

	try {
		let baseCommitSha: string | null = null;
		let baseTreeSha: string | null = null;
		try {
			githubPublishLog("target-ref-load-start", logContext);
			const targetRef = await getGitRef({
				token,
				owner: repo.owner,
				repo: repo.name,
				branch: targetBranch,
			});
			baseCommitSha = targetRef.object.sha;
			baseTreeSha = await getCommitTreeSha({
				token,
				owner: repo.owner,
				repo: repo.name,
				commitSha: baseCommitSha,
			});
			githubPublishLog("target-ref-load-success", {
				...logContext,
				baseCommitSha,
			});
		} catch (error) {
			if (!isEmptyGitRepositoryError(error)) throw error;
			githubPublishLog("empty-repository-detected", logContext);
			const firstFile = workspace.files[0];
			if (!firstFile) {
				throw new Error("No files available to publish.");
			}
			if (parsed.mode === "direct_push") {
				const published = await publishEmptyRepositoryDirectPush({
					token,
					owner: repo.owner,
					repo: repo.name,
					branch: targetBranch,
					files: workspace.files.map((file) => ({
						path: prefixedPath(targetDirectory, file.path),
						bytes: file.bytes,
						size: file.size,
					})),
					commitMessage: parsed.commitMessage,
					logContext,
				});
				githubPublishLog("audit-log-write-start", logContext);
				const [event] = await db
					.insert(githubPublishEvents)
					.values({
						workspaceId: parsed.workspaceId,
						userId: parsed.userId,
						connectionId: connection.id,
						repositoryId: repo.id,
						codeWorkspaceId: workspace.metadata.id,
						conversationId: parsed.conversationId,
						agentId: parsed.agentId,
						mode: parsed.mode,
						targetBranch,
						sourceBranch,
						commitSha: published.commitSha,
						pullRequestUrl: null,
						status: "success",
						metadataJson: {
							targetDirectory,
							files: published.files.map((file) => file.path),
						},
					})
					.returning({ id: githubPublishEvents.id });
				eventId = event.id;
				githubPublishLog("success", {
					...logContext,
					commitSha: published.commitSha,
					eventId,
				});
				return {
					kind: "github_publish_result",
					mode: parsed.mode,
					repository: repo.fullName,
					targetBranch,
					sourceBranch: null,
					commitSha: published.commitSha,
					pullRequestUrl: null,
					files: published.files,
					message: `Changes pushed to ${repo.fullName}:${targetBranch}.`,
				};
			}
			const initialPath =
				parsed.mode === "pull_request"
					? "README.md"
					: prefixedPath(targetDirectory, firstFile.path);
			const initialBytes =
				parsed.mode === "pull_request"
					? Buffer.from(
							"# AI Hub publishing\n\nInitialized to enable publishing from AI Hub.\n",
						)
					: firstFile.bytes;
			const emptyBase = await initializeEmptyRepository({
				token,
				owner: repo.owner,
				repo: repo.name,
				branch: targetBranch,
				path: initialPath,
				bytes: initialBytes,
				logContext,
			});
			baseCommitSha = emptyBase.commitSha;
			baseTreeSha = emptyBase.treeSha;
		}

		if (parsed.mode === "pull_request") {
			if (!baseCommitSha) {
				throw new Error("Cannot create a pull request without a base branch.");
			}
			githubPublishLog("source-branch-check-start", logContext);
			if (
				await gitRefExists({
					token,
					owner: repo.owner,
					repo: repo.name,
					branch: sourceBranch,
				})
			) {
				throw new Error(`Source branch already exists: ${sourceBranch}`);
			}
			githubPublishLog("source-branch-create-start", logContext);
			await createGitRef({
				token,
				owner: repo.owner,
				repo: repo.name,
				branch: sourceBranch,
				sha: baseCommitSha,
			});
			githubPublishLog("source-branch-create-success", logContext);
		}

		githubPublishLog("blobs-create-start", logContext);
		const treeItems = await Promise.all(
			workspace.files.map(async (file) => {
				const blob = await githubRequest<{ sha: string }>(
					`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/blobs`,
					token,
					{
						method: "POST",
						body: JSON.stringify({
							content: Buffer.from(file.bytes).toString("base64"),
							encoding: "base64",
						}),
					},
				);
				return {
					path: prefixedPath(targetDirectory, file.path),
					mode: "100644",
					type: "blob",
					sha: blob.sha,
				};
			}),
		);
		githubPublishLog("blobs-create-success", logContext);
		githubPublishLog("tree-create-start", logContext);
		const tree = await githubRequest<{ sha: string }>(
			`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/trees`,
			token,
			{
				method: "POST",
				body: JSON.stringify({
					...(baseTreeSha ? { base_tree: baseTreeSha } : {}),
					tree: treeItems,
				}),
			},
		);
		githubPublishLog("tree-create-success", {
			...logContext,
			treeSha: tree.sha,
		});
		githubPublishLog("commit-create-start", logContext);
		const commit = await githubRequest<{ sha: string; html_url?: string }>(
			`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/commits`,
			token,
			{
				method: "POST",
				body: JSON.stringify({
					message: parsed.commitMessage,
					tree: tree.sha,
					parents: baseCommitSha ? [baseCommitSha] : [],
				}),
			},
		);
		githubPublishLog("commit-create-success", {
			...logContext,
			commitSha: commit.sha,
		});
		if (baseCommitSha) {
			githubPublishLog("ref-update-start", logContext);
			await githubRequest(
				`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/refs/heads/${encodeRefPath(sourceBranch)}`,
				token,
				{
					method: "PATCH",
					body: JSON.stringify({ sha: commit.sha, force: false }),
				},
			);
			githubPublishLog("ref-update-success", logContext);
		} else {
			githubPublishLog("ref-create-start", logContext);
			await createGitRef({
				token,
				owner: repo.owner,
				repo: repo.name,
				branch: sourceBranch,
				sha: commit.sha,
			});
			githubPublishLog("ref-create-success", logContext);
		}

		let pullRequestUrl: string | null = null;
		if (parsed.mode === "pull_request") {
			githubPublishLog("pull-request-create-start", logContext);
			const pr = await githubRequest<{ html_url: string }>(
				`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/pulls`,
				token,
				{
					method: "POST",
					body: JSON.stringify({
						title: parsed.pullRequestTitle || parsed.commitMessage,
						head: sourceBranch,
						base: targetBranch,
						body:
							parsed.pullRequestBody ||
							`Created by AI Hub from code workspace ${workspace.metadata.id}.`,
					}),
				},
			);
			pullRequestUrl = pr.html_url;
			githubPublishLog("pull-request-create-success", {
				...logContext,
				pullRequestUrl,
			});
		}

		githubPublishLog("audit-log-write-start", logContext);
		const [event] = await db
			.insert(githubPublishEvents)
			.values({
				workspaceId: parsed.workspaceId,
				userId: parsed.userId,
				connectionId: connection.id,
				repositoryId: repo.id,
				codeWorkspaceId: workspace.metadata.id,
				conversationId: parsed.conversationId,
				agentId: parsed.agentId,
				mode: parsed.mode,
				targetBranch,
				sourceBranch,
				commitSha: commit.sha,
				pullRequestUrl,
				status: "success",
				metadataJson: {
					targetDirectory,
					files: workspace.files.map((file) => file.path),
				},
			})
			.returning({ id: githubPublishEvents.id });
		eventId = event.id;
		githubPublishLog("success", {
			...logContext,
			commitSha: commit.sha,
			pullRequestUrl,
			eventId,
		});

		return {
			kind: "github_publish_result",
			mode: parsed.mode,
			repository: repo.fullName,
			targetBranch,
			sourceBranch: parsed.mode === "pull_request" ? sourceBranch : null,
			commitSha: commit.sha,
			pullRequestUrl,
			files: workspace.files.map((file) => ({
				path: prefixedPath(targetDirectory, file.path),
				size: file.size,
			})),
			message:
				parsed.mode === "pull_request"
					? `Pull request created for ${repo.fullName}.`
					: `Changes pushed to ${repo.fullName}:${targetBranch}.`,
		};
	} catch (error) {
		githubPublishLog(
			"failure",
			{
				...logContext,
				error: error instanceof Error ? error.message : String(error),
			},
			"error",
		);
		if (!eventId) {
			githubPublishLog("audit-log-failure-write-start", logContext);
			await db.insert(githubPublishEvents).values({
				workspaceId: parsed.workspaceId,
				userId: parsed.userId,
				connectionId: connection.id,
				repositoryId: repo.id,
				codeWorkspaceId: parsed.projectId,
				conversationId: parsed.conversationId,
				agentId: parsed.agentId,
				mode: parsed.mode,
				targetBranch,
				sourceBranch,
				status: "failed",
				metadataJson: {
					error: error instanceof Error ? error.message : String(error),
					targetDirectory,
				},
			});
			githubPublishLog("audit-log-failure-write-success", logContext);
		}
		throw error;
	}
}
