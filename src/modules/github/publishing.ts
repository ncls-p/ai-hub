import {
	createHmac,
	createPrivateKey,
	createSign,
	randomUUID,
} from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
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

export type GitHubPublishMode = "pull_request" | "direct_push";

export type GitHubRepositorySummary = {
	id: string;
	connectionId: string;
	owner: string;
	name: string;
	fullName: string;
	private: boolean;
	defaultBranch: string;
	permissions: Record<string, unknown> | null;
};

export type GitHubConnectionSummary = {
	id: string;
	installationId: string;
	accountLogin: string;
	accountType: string | null;
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

export function getGitHubAppPublicConfig() {
	return {
		configured: githubAppConfigured(),
		appSlug: env.GITHUB_APP_SLUG ?? null,
	};
}

export function normalizeGitHubPrivateKey(rawValue: string) {
	let privateKey = rawValue.trim();
	privateKey = privateKey.replace(/^export\s+GITHUB_APP_PRIVATE_KEY\s*=\s*/i, "");
	privateKey = privateKey.replace(/^GITHUB_APP_PRIVATE_KEY\s*=\s*/i, "");
	privateKey = privateKey.replace(/%$/, "").trim();
	if (
		(privateKey.startsWith('"') && privateKey.endsWith('"')) ||
		(privateKey.startsWith("'") && privateKey.endsWith("'")) ||
		(privateKey.startsWith("`") && privateKey.endsWith("`"))
	) {
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
	const body = text ? (JSON.parse(text) as unknown) : null;
	if (!response.ok) {
		const message =
			typeof body === "object" &&
			body !== null &&
			"message" in body &&
			typeof (body as { message?: unknown }).message === "string"
				? (body as { message: string }).message
				: response.statusText;
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
	const parsed = JSON.parse(
		Buffer.from(
			payload.replace(/-/g, "+").replace(/_/g, "/"),
			"base64",
		).toString("utf8"),
	) as { userId?: unknown; workspaceId?: unknown; expiresAt?: unknown };
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
	const url = new URL(`https://github.com/apps/${appSlug}/installations/new`);
	url.searchParams.set("state", state);
	return url.toString();
}

function normalizePermissions(value: unknown) {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: null;
}

export async function syncGitHubInstallation(input: {
	userId: string;
	installationId: string;
}) {
	const appJwt = signGitHubAppJwt();
	const installation = await githubRequest<{
		id: number;
		account?: { id?: number; login?: string; type?: string } | null;
	}>(`/app/installations/${encodeURIComponent(input.installationId)}`, appJwt);
	const accountLogin = installation.account?.login ?? "GitHub";
	const accountId = installation.account?.id?.toString() ?? null;
	const accountType = installation.account?.type ?? null;

	const [connection] = await db
		.insert(userGithubConnections)
		.values({
			userId: input.userId,
			installationId: String(installation.id),
			accountLogin,
			accountId,
			accountType,
			updatedAt: new Date(),
		})
		.onConflictDoUpdate({
			target: [
				userGithubConnections.userId,
				userGithubConnections.installationId,
			],
			set: { accountLogin, accountId, accountType, updatedAt: new Date() },
		})
		.returning();

	const installationToken = await getInstallationToken(String(installation.id));
	const repos = await githubRequest<{
		repositories: Array<{
			id: number;
			name: string;
			full_name: string;
			private: boolean;
			default_branch: string;
			owner: { login: string };
			permissions?: unknown;
		}>;
	}>("/installation/repositories?per_page=100", installationToken);

	await db
		.delete(userGithubRepositories)
		.where(eq(userGithubRepositories.connectionId, connection.id));
	if (repos.repositories.length > 0) {
		await db.insert(userGithubRepositories).values(
			repos.repositories.map((repo) => ({
				connectionId: connection.id,
				userId: input.userId,
				githubRepositoryId: String(repo.id),
				owner: repo.owner.login,
				name: repo.name,
				fullName: repo.full_name,
				private: repo.private,
				defaultBranch: repo.default_branch,
				permissionsJson: normalizePermissions(repo.permissions),
				lastSyncedAt: new Date(),
			})),
		);
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
			}),
		),
		repositories: repositories.map(
			(repo): GitHubRepositorySummary => ({
				id: repo.id,
				connectionId: repo.connectionId,
				owner: repo.owner,
				name: repo.name,
				fullName: repo.fullName,
				private: repo.private,
				defaultBranch: repo.defaultBranch,
				permissions: normalizePermissions(repo.permissionsJson),
			}),
		),
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

	try {
		const targetRef = await getGitRef({
			token,
			owner: repo.owner,
			repo: repo.name,
			branch: targetBranch,
		});
		const baseCommitSha = targetRef.object.sha;
		const baseCommit = await githubRequest<{ tree: { sha: string } }>(
			`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/commits/${encodeURIComponent(baseCommitSha)}`,
			token,
		);

		if (parsed.mode === "pull_request") {
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
			await githubRequest(
				`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/refs`,
				token,
				{
					method: "POST",
					body: JSON.stringify({
						ref: `refs/heads/${sourceBranch}`,
						sha: baseCommitSha,
					}),
				},
			);
		}

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
		const tree = await githubRequest<{ sha: string }>(
			`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/trees`,
			token,
			{
				method: "POST",
				body: JSON.stringify({
					base_tree: baseCommit.tree.sha,
					tree: treeItems,
				}),
			},
		);
		const commit = await githubRequest<{ sha: string; html_url?: string }>(
			`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/commits`,
			token,
			{
				method: "POST",
				body: JSON.stringify({
					message: parsed.commitMessage,
					tree: tree.sha,
					parents: [baseCommitSha],
				}),
			},
		);
		await githubRequest(
			`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/refs/heads/${encodeRefPath(sourceBranch)}`,
			token,
			{
				method: "PATCH",
				body: JSON.stringify({ sha: commit.sha, force: false }),
			},
		);

		let pullRequestUrl: string | null = null;
		if (parsed.mode === "pull_request") {
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
		}

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
		if (!eventId) {
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
		}
		throw error;
	}
}
