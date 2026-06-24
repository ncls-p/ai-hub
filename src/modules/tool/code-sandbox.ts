import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";

import { env } from "@/lib/env";
import {
	createChatAttachment,
	type ChatAttachment,
} from "@/modules/chat/attachments";

type CodeSandboxLanguage = "python" | "node";

type CodeSandboxInputFile = {
	path: string;
	content: string;
};

type CodeSandboxOutputFile = {
	path: string;
	size: number;
	mimeType: string;
	hash?: string;
	textPreview?: string;
	truncated?: boolean;
	fromInput?: boolean;
	modified?: boolean;
	skipped?: "too_large";
	contentBase64?: string;
	contentOmitted?: "too_large" | "total_limit";
	attachment?: ChatAttachment;
	downloadUrl?: string;
	downloadError?: string;
};

export type CodeSandboxResult = {
	kind: "code_sandbox_result";
	ok: boolean;
	language: CodeSandboxLanguage;
	exitCode: number | null;
	signal: string | null;
	timedOut: boolean;
	durationMs: number;
	stdout: string;
	stderr: string;
	truncated: boolean;
	files: CodeSandboxOutputFile[];
	error?: string;
};

export type CodeSandboxRequest = {
	language: CodeSandboxLanguage;
	code: string;
	stdin?: string;
	files?: CodeSandboxInputFile[];
	timeoutMs?: number;
};

type CodeSandboxExecutionContext = {
	workspaceId: string;
	userId: string;
};

const requestTimeoutMs = 15_000;
const maxResponseBytes = 8_000_000;
const defaultSocketPath = "/run/sandbox/sandbox.sock";
const localDevSocketPath = path.resolve(
	process.cwd(),
	".data/sandbox-runner/sandbox.sock",
);

function absoluteSocketPath(socketPath: string) {
	return path.isAbsolute(socketPath)
		? socketPath
		: path.resolve(process.cwd(), socketPath);
}

function resolveSandboxRunnerSocket() {
	if (process.env.SANDBOX_RUNNER_SOCKET) {
		return absoluteSocketPath(env.SANDBOX_RUNNER_SOCKET);
	}
	if (
		env.SANDBOX_RUNNER_SOCKET === defaultSocketPath &&
		existsSync(localDevSocketPath)
	) {
		return localDevSocketPath;
	}
	return absoluteSocketPath(env.SANDBOX_RUNNER_SOCKET);
}

function sandboxUnavailableMessage(error: unknown, socketPath: string) {
	const message = error instanceof Error ? error.message : String(error);
	const localHint =
		socketPath === defaultSocketPath && !existsSync(defaultSocketPath)
			? " For local development, start the runner with `docker compose -f docker-compose.dev.yml up -d sandbox-runner` and set SANDBOX_RUNNER_SOCKET=.data/sandbox-runner/sandbox.sock."
			: "";
	return `Sandbox runner unavailable at ${socketPath}: ${message}${localHint}`;
}

function parseJsonResponse(body: string) {
	try {
		return JSON.parse(body) as Partial<CodeSandboxResult>;
	} catch {
		return null;
	}
}

type NormalizeSandboxResponseOptions = {
	responseTruncated: boolean;
};

function normalizeLanguage(
	payload: Partial<CodeSandboxResult>,
	input: CodeSandboxRequest,
) {
	if (payload.language === "python" || payload.language === "node") {
		return payload.language;
	}
	return input.language;
}

function normalizeDuration(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeStderr(payload: Partial<CodeSandboxResult>) {
	if (typeof payload.stderr === "string" && payload.stderr.length > 0) {
		return payload.stderr;
	}
	if (payload.ok === false) {
		return typeof payload.error === "string" && payload.error.length > 0
			? payload.error
			: "Sandbox runner returned an incomplete response.";
	}
	return "";
}

function normalizeSandboxResponse(
	payload: Partial<CodeSandboxResult>,
	input: CodeSandboxRequest,
	options: NormalizeSandboxResponseOptions,
): CodeSandboxResult {
	return {
		kind: "code_sandbox_result",
		ok: payload.ok === true,
		language: normalizeLanguage(payload, input),
		exitCode: typeof payload.exitCode === "number" ? payload.exitCode : null,
		signal: typeof payload.signal === "string" ? payload.signal : null,
		timedOut: payload.timedOut === true,
		durationMs: normalizeDuration(payload.durationMs),
		stdout: typeof payload.stdout === "string" ? payload.stdout : "",
		stderr: normalizeStderr(payload),
		truncated: Boolean(payload.truncated || options.responseTruncated),
		files: Array.isArray(payload.files) ? payload.files : [],
		error: typeof payload.error === "string" ? payload.error : undefined,
	};
}

function stripEmbeddedContent(file: CodeSandboxOutputFile) {
	const publicFile = { ...file };
	delete publicFile.contentBase64;
	return publicFile;
}

function sandboxOutputFileName(filePath: string) {
	const baseName = path.basename(filePath).trim();
	return baseName || "sandbox-output.bin";
}

function shouldPersistSandboxFile(file: CodeSandboxOutputFile) {
	return Boolean(
		file.contentBase64 && (!file.fromInput || file.modified !== false),
	);
}

async function persistSandboxFile(
	file: CodeSandboxOutputFile,
	context: CodeSandboxExecutionContext,
): Promise<CodeSandboxOutputFile> {
	if (!shouldPersistSandboxFile(file)) return stripEmbeddedContent(file);
	try {
		const bytes = Buffer.from(file.contentBase64 ?? "", "base64");
		const attachment = await createChatAttachment({
			workspaceId: context.workspaceId,
			userId: context.userId,
			fileName: sandboxOutputFileName(file.path),
			mimeType: file.mimeType,
			bytes,
		});
		return {
			...stripEmbeddedContent(file),
			attachment,
			downloadUrl: attachment.url,
		};
	} catch (error) {
		return {
			...stripEmbeddedContent(file),
			downloadError:
				error instanceof Error
					? error.message
					: "Failed to persist sandbox output file.",
		};
	}
}

async function persistSandboxFiles(
	result: CodeSandboxResult,
	context?: CodeSandboxExecutionContext,
): Promise<CodeSandboxResult> {
	if (!context || result.files.length === 0) {
		return {
			...result,
			files: result.files.map(stripEmbeddedContent),
		};
	}
	return {
		...result,
		files: await Promise.all(
			result.files.map((file) => persistSandboxFile(file, context)),
		),
	};
}

export async function executeCodeSandbox(
	input: CodeSandboxRequest,
	context?: CodeSandboxExecutionContext,
): Promise<CodeSandboxResult> {
	const body = JSON.stringify(input);
	const socketPath = resolveSandboxRunnerSocket();
	return new Promise((resolve) => {
		const request = http.request(
			{
				socketPath,
				path: "/run",
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(body),
				},
				timeout: requestTimeoutMs,
			},
			(response) => {
				const chunks: Buffer[] = [];
				let totalBytes = 0;
				let responseTruncated = false;

				response.on("data", (chunk: Buffer) => {
					totalBytes += chunk.byteLength;
					if (totalBytes <= maxResponseBytes) {
						chunks.push(chunk);
						return;
					}
					responseTruncated = true;
					const currentBytes = chunks.reduce(
						(total, item) => total + item.byteLength,
						0,
					);
					const remaining = Math.max(0, maxResponseBytes - currentBytes);
					if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
				});

				response.on("end", () => {
					const payload = parseJsonResponse(
						Buffer.concat(chunks).toString("utf8"),
					);
					if (!payload) {
						resolve({
							kind: "code_sandbox_result",
							ok: false,
							language: input.language,
							exitCode: null,
							signal: null,
							timedOut: false,
							durationMs: 0,
							stdout: "",
							stderr: `Sandbox runner returned an invalid response (HTTP ${response.statusCode ?? "unknown"}).`,
							truncated: responseTruncated,
							files: [],
						});
						return;
					}
					void persistSandboxFiles(
						normalizeSandboxResponse(payload, input, { responseTruncated }),
						context,
					).then(resolve);
				});
			},
		);

		request.on("timeout", () => {
			request.destroy(new Error("Sandbox runner request timed out."));
		});

		request.on("error", (error) => {
			const unavailableMessage = sandboxUnavailableMessage(error, socketPath);
			resolve({
				kind: "code_sandbox_result",
				ok: false,
				language: input.language,
				exitCode: null,
				signal: null,
				timedOut: false,
				durationMs: 0,
				stdout: "",
				stderr: unavailableMessage,
				truncated: false,
				files: [],
				error: unavailableMessage,
			});
		});

		request.end(body);
	});
}
