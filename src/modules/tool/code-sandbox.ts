import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";

import { env } from "@/lib/env";
import { logger, logHandledWarning } from "@/lib/logger";
import { isPathTraversal } from "@/lib/path-utils";
import {
	createChatAttachment,
	getChatAttachmentBytes,
	getChatAttachmentExtractedText,
	isChatFileAttachment,
	type ChatAttachment,
} from "@/modules/chat/attachments";

type CodeSandboxLanguage = "python" | "node" | "bash";

type CodeSandboxInputFile = {
	path: string;
	content?: string;
	contentBase64?: string;
};

type CodeSandboxAttachmentReference = {
	id: string;
	path?: string;
	includeExtractedText?: boolean;
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
	attachments?: CodeSandboxAttachmentReference[];
	timeoutMs?: number;
};

type CodeSandboxExecutionContext = {
	workspaceId: string;
	userId: string;
};

type PreparedSandboxRunnerInput = Omit<CodeSandboxRequest, "files"> & {
	language: CodeSandboxLanguage;
	files: Array<{ path: string; bytes: Buffer }>;
};

type NormalizeSandboxResponseOptions = {
	responseTruncated: boolean;
};

const requestTimeoutBufferMs = 30_000;
const maxResponseBytes = 8_000_000;
const defaultSocketPath = "/run/sandbox/sandbox.sock";
const localDevSocketPath = path.resolve(
	/*turbopackIgnore: true*/ process.cwd(),
	".data/sandbox-runner/sandbox.sock",
);
const maxSandboxAttachmentTextChars = 200_000;
const maxSandboxInputFiles = 40;
const maxSandboxInputFileBytes = 1_500_000;
const maxSandboxInputTotalBytes = 5_000_000;
const maxSandboxCodeChars = 100_000;
const defaultSandboxTimeoutMs = 15_000;
const maxSandboxTimeoutMs = 120_000;

function normalizeLanguage(input: CodeSandboxRequest) {
	if (
		input.language === "python" ||
		input.language === "node" ||
		input.language === "bash"
	) {
		return input.language;
	}
	throw new Error("language must be 'python', 'node', or 'bash'.");
}

function languageFromPayload(
	payload: Partial<CodeSandboxResult>,
	input: PreparedSandboxRunnerInput,
) {
	if (
		payload.language === "python" ||
		payload.language === "node" ||
		payload.language === "bash"
	) {
		return payload.language;
	}
	return input.language;
}

function clampTimeoutMs(value: unknown) {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return defaultSandboxTimeoutMs;
	}
	return Math.max(250, Math.min(maxSandboxTimeoutMs, Math.floor(value)));
}

function requestTimeoutMs(input: PreparedSandboxRunnerInput) {
	return clampTimeoutMs(input.timeoutMs) + requestTimeoutBufferMs;
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
	input: PreparedSandboxRunnerInput,
	options: NormalizeSandboxResponseOptions,
): CodeSandboxResult {
	return {
		kind: "code_sandbox_result",
		ok: payload.ok === true,
		language: languageFromPayload(payload, input),
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

function failedSandboxResult(
	input: CodeSandboxRequest,
	message: string,
): CodeSandboxResult {
	return {
		kind: "code_sandbox_result",
		ok: false,
		language:
			input.language === "python" ||
			input.language === "node" ||
			input.language === "bash"
				? input.language
				: "python",
		exitCode: null,
		signal: null,
		timedOut: false,
		durationMs: 0,
		stdout: "",
		stderr: message,
		truncated: false,
		files: [],
		error: message,
	};
}

function absoluteSocketPath(socketPath: string) {
	return path.isAbsolute(socketPath)
		? socketPath
		: path.resolve(/*turbopackIgnore: true*/ process.cwd(), socketPath);
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

function safeRelativePath(rawPath: string) {
	if (typeof rawPath !== "string") {
		throw new Error("File path must be a string.");
	}
	const trimmed = rawPath.trim().replace(/\\/g, "/");
	if (!trimmed || trimmed.includes("\0")) throw new Error("Invalid file path.");
	if (trimmed.startsWith("/") || /^[a-zA-Z]:\//.test(trimmed)) {
		throw new Error("Absolute file paths are not allowed.");
	}
	const normalized = path.posix.normalize(trimmed).replace(/^\.\//, "");
	if (isPathTraversal(normalized)) {
		throw new Error("Path traversal is not allowed.");
	}
	if (normalized.length > 260 || normalized.split("/").length > 16) {
		throw new Error("File path is too long or too deep.");
	}
	const [firstSegment] = normalized.split("/");
	const reservedSandboxFile = [
		"main.py",
		"main.mjs",
		"main.sh",
		"package.json",
		".stdin",
	].includes(normalized);
	const reservedSandboxDirectory = ["node_modules", "home", "tmp"].includes(
		firstSegment ?? "",
	);
	if (reservedSandboxFile || reservedSandboxDirectory) {
		throw new Error("Reserved sandbox file path.");
	}
	return normalized;
}

function bytesFromBase64(value: string, filePath: string) {
	const normalized = value.replace(/\s/g, "");
	if (
		normalized.length % 4 !== 0 ||
		!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
	) {
		throw new Error(`Input file is not valid base64: ${filePath}`);
	}
	return Buffer.from(normalized, "base64");
}

function normalizeInputFiles(input: CodeSandboxRequest) {
	const files = Array.isArray(input.files) ? input.files : [];
	if (files.length > maxSandboxInputFiles) {
		throw new Error(
			`Too many input files. Maximum is ${maxSandboxInputFiles}.`,
		);
	}

	let totalInputBytes = 0;
	return files.map((file) => {
		const filePath = safeRelativePath(file.path);
		const hasBase64 = typeof file.contentBase64 === "string";
		const textContent = typeof file.content === "string" ? file.content : "";
		const bytes = hasBase64
			? bytesFromBase64(file.contentBase64 ?? "", filePath)
			: Buffer.from(textContent, "utf8");
		if (bytes.byteLength > maxSandboxInputFileBytes) {
			throw new Error(`Input file is too large: ${filePath}`);
		}
		totalInputBytes += bytes.byteLength;
		if (totalInputBytes > maxSandboxInputTotalBytes) {
			throw new Error(
				`Input files are too large. Maximum total is ${maxSandboxInputTotalBytes} bytes.`,
			);
		}
		return { path: filePath, bytes };
	});
}

function sanitizeAttachmentFileName(fileName: string) {
	const baseName = path.basename(fileName.replace(/\\/g, "/")).trim();
	const safeName = baseName
		.replace(/[^a-zA-Z0-9._ -]/g, "_")
		.replace(/\s+/g, " ")
		.replace(/^\.+/, "")
		.slice(0, 120)
		.trim();
	return safeName || "attachment.bin";
}

function defaultAttachmentPath(attachment: ChatAttachment) {
	return `attachments/${sanitizeAttachmentFileName(attachment.fileName)}`;
}

function extractedTextPath(filePath: string) {
	const parsed = path.posix.parse(filePath.replace(/\\/g, "/"));
	const baseName = `${parsed.name || "attachment"}.extracted.txt`;
	return path.posix.join(parsed.dir, baseName).slice(0, 260);
}

function uniqueSandboxPath(filePath: string, usedPaths: Set<string>) {
	const normalized = safeRelativePath(filePath);
	if (!usedPaths.has(normalized)) {
		usedPaths.add(normalized);
		return normalized;
	}
	const parsed = path.posix.parse(normalized);
	for (let index = 2; index < 100; index += 1) {
		const candidate = path.posix.join(
			parsed.dir,
			`${parsed.name}-${index}${parsed.ext}`,
		);
		if (!usedPaths.has(candidate)) {
			usedPaths.add(candidate);
			return candidate;
		}
	}
	throw new Error(`Too many sandbox files named ${normalized}.`);
}

function truncateSandboxInputText(text: string) {
	if (text.length <= maxSandboxAttachmentTextChars) return text;
	return `${text.slice(0, maxSandboxAttachmentTextChars)}\n\n[Truncated before sandbox execution: ${text.length - maxSandboxAttachmentTextChars} additional characters omitted.]`;
}

async function prepareSandboxRunnerRequest(
	input: CodeSandboxRequest,
	context?: CodeSandboxExecutionContext,
): Promise<PreparedSandboxRunnerInput> {
	const language = normalizeLanguage(input);
	if (typeof input.code !== "string" || !input.code.trim()) {
		throw new Error("code is required.");
	}
	if (input.code.length > maxSandboxCodeChars) {
		throw new Error(
			`code is too large. Maximum is ${maxSandboxCodeChars} characters.`,
		);
	}

	const files = normalizeInputFiles(input);
	const attachmentReferences = input.attachments ?? [];
	if (attachmentReferences.length === 0) {
		return { ...input, language, files, attachments: [] };
	}
	if (!context) {
		throw new Error("Sandbox attachment access requires a workspace context.");
	}

	const usedPaths = new Set(files.map((file) => file.path));
	for (const reference of attachmentReferences) {
		const { metadata, bytes } = await getChatAttachmentBytes({
			attachmentId: reference.id,
			workspaceId: context.workspaceId,
			userId: context.userId,
		});
		const requestedPath = reference.path?.trim();
		const filePath = uniqueSandboxPath(
			requestedPath || defaultAttachmentPath(metadata),
			usedPaths,
		);
		if (bytes.byteLength > maxSandboxInputFileBytes) {
			throw new Error(`Input file is too large: ${filePath}`);
		}
		files.push({ path: filePath, bytes: Buffer.from(bytes) });

		if (
			reference.includeExtractedText === false ||
			!isChatFileAttachment(metadata)
		) {
			continue;
		}
		const { text } = await getChatAttachmentExtractedText({
			attachmentId: reference.id,
			workspaceId: context.workspaceId,
			userId: context.userId,
		});
		if (!text.trim()) continue;
		files.push({
			path: uniqueSandboxPath(extractedTextPath(filePath), usedPaths),
			bytes: Buffer.from(truncateSandboxInputText(text), "utf8"),
		});
	}

	const totalBytes = files.reduce(
		(total, file) => total + file.bytes.byteLength,
		0,
	);
	if (totalBytes > maxSandboxInputTotalBytes) {
		throw new Error(
			`Input files are too large. Maximum total is ${maxSandboxInputTotalBytes} bytes.`,
		);
	}

	return { ...input, language, files, attachments: [] };
}

function serializeSandboxRunnerRequest(input: PreparedSandboxRunnerInput) {
	return JSON.stringify({
		language: input.language,
		code: input.code,
		stdin: typeof input.stdin === "string" ? input.stdin : undefined,
		timeoutMs: clampTimeoutMs(input.timeoutMs),
		files: input.files.map((file) => ({
			path: file.path,
			contentBase64: file.bytes.toString("base64"),
		})),
	});
}

function parseJsonResponse(body: string) {
	try {
		return JSON.parse(body) as Partial<CodeSandboxResult>;
	} catch {
		return null;
	}
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

async function runSandboxRunner(
	input: PreparedSandboxRunnerInput,
	executionId: string,
): Promise<CodeSandboxResult> {
	const body = serializeSandboxRunnerRequest(input);
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
					"X-Sandbox-Execution-Id": executionId,
				},
				timeout: requestTimeoutMs(input),
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
					resolve(
						normalizeSandboxResponse(payload, input, { responseTruncated }),
					);
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

export async function executeCodeSandbox(
	input: CodeSandboxRequest,
	context?: CodeSandboxExecutionContext,
): Promise<CodeSandboxResult> {
	const executionId = crypto.randomUUID();
	const startedAt = Date.now();
	let runnerInput: PreparedSandboxRunnerInput;
	try {
		runnerInput = await prepareSandboxRunnerRequest(input, context);
	} catch (error) {
		logHandledWarning("Code sandbox input preparation failed", {
			executionId,
			language: input.language,
			workspaceId: context?.workspaceId,
			userId: context?.userId,
			fileCount: input.files?.length ?? 0,
			attachmentCount: input.attachments?.length ?? 0,
			durationMs: Date.now() - startedAt,
			error: error instanceof Error ? error.message : String(error),
		});
		return failedSandboxResult(
			input,
			error instanceof Error
				? error.message
				: "Failed to prepare sandbox inputs.",
		);
	}

	logger.info("Code sandbox execution started", {
		executionId,
		language: runnerInput.language,
		workspaceId: context?.workspaceId,
		userId: context?.userId,
		fileCount: runnerInput.files.length,
		timeoutMs: clampTimeoutMs(runnerInput.timeoutMs),
	});
	const result = await runSandboxRunner(runnerInput, executionId);
	const persisted = await persistSandboxFiles(result, context);
	logger.info("Code sandbox execution completed", {
		executionId,
		language: persisted.language,
		workspaceId: context?.workspaceId,
		userId: context?.userId,
		ok: persisted.ok,
		exitCode: persisted.exitCode,
		signal: persisted.signal,
		timedOut: persisted.timedOut,
		durationMs: persisted.durationMs,
		wallDurationMs: Date.now() - startedAt,
		stdoutBytes: Buffer.byteLength(persisted.stdout),
		stderrBytes: Buffer.byteLength(persisted.stderr),
		fileCount: persisted.files.length,
		persistedFileCount: persisted.files.filter((file) => file.attachment).length,
		runcated: persisted.truncated,
	});
	return persisted;
}
