#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
	access,
	chmod,
	chown,
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const socketPath =
	process.env.SANDBOX_RUNNER_SOCKET ?? "/run/sandbox/sandbox.sock";
const runRoot = process.env.SANDBOX_RUN_ROOT ?? "/sandbox-runs";
const sandboxUid = Number(process.env.SANDBOX_RUN_UID ?? "10001");
const sandboxGid = Number(process.env.SANDBOX_RUN_GID ?? "10001");
const socketGid = Number(process.env.SANDBOX_SOCKET_GID ?? "1001");
const canSwitchUser =
	typeof process.getuid === "function" && process.getuid() === 0;
const maxRequestBytes = Number(
	process.env.SANDBOX_MAX_REQUEST_BYTES ?? 8_000_000,
);
const maxCodeChars = Number(process.env.SANDBOX_MAX_CODE_CHARS ?? 100_000);
const maxInputFileChars = Number(
	process.env.SANDBOX_MAX_INPUT_FILE_CHARS ?? 200_000,
);
const maxInputFileBytes = Number(
	process.env.SANDBOX_MAX_INPUT_FILE_BYTES ?? 1_500_000,
);
const maxInputTotalBytes = Number(
	process.env.SANDBOX_MAX_INPUT_TOTAL_BYTES ?? 5_000_000,
);
const maxInputFiles = Number(process.env.SANDBOX_MAX_INPUT_FILES ?? 40);
const maxStdoutBytes = Number(process.env.SANDBOX_MAX_STDOUT_BYTES ?? 64_000);
const maxStderrBytes = Number(process.env.SANDBOX_MAX_STDERR_BYTES ?? 64_000);
const maxFilePreviewBytes = Number(
	process.env.SANDBOX_MAX_FILE_PREVIEW_BYTES ?? 16_000,
);
const maxCollectedFiles = Number(process.env.SANDBOX_MAX_COLLECTED_FILES ?? 30);
const maxCollectedFileBytes = Number(
	process.env.SANDBOX_MAX_COLLECTED_FILE_BYTES ?? 1_000_000,
);
const maxDownloadFileBytes = Number(
	process.env.SANDBOX_MAX_DOWNLOAD_FILE_BYTES ?? 1_000_000,
);
const maxDownloadTotalBytes = Number(
	process.env.SANDBOX_MAX_DOWNLOAD_TOTAL_BYTES ?? 5_000_000,
);
const defaultTimeoutMs = Number(
	process.env.SANDBOX_DEFAULT_TIMEOUT_MS ?? 15_000,
);
const maxTimeoutMs = Number(process.env.SANDBOX_MAX_TIMEOUT_MS ?? 120_000);
const maxProcesses = Number(process.env.SANDBOX_MAX_PROCESSES ?? 256);
const maxOutputFileSizeBytes = Number(
	process.env.SANDBOX_MAX_OUTPUT_FILE_SIZE_BYTES ?? 10_000_000,
);
const maxCpuSeconds = Number(process.env.SANDBOX_MAX_CPU_SECONDS ?? 120);
const canUsePrlimit = process.platform === "linux";

function log(level, message, data = {}) {
	const payload = {
		ts: new Date().toISOString(),
		lvl: level,
		msg: message,
		...data,
	};
	const line = `${JSON.stringify(payload)}\n`;
	if (level === "error" || level === "warn") {
		process.stderr.write(line);
		return;
	}
	process.stdout.write(line);
}

const textExtensions = new Set([
	".c",
	".conf",
	".cpp",
	".cs",
	".css",
	".csv",
	".go",
	".html",
	".java",
	".js",
	".json",
	".jsx",
	".log",
	".md",
	".mjs",
	".py",
	".rb",
	".rs",
	".sh",
	".sql",
	".svg",
	".toml",
	".ts",
	".tsx",
	".txt",
	".xml",
	".yaml",
	".yml",
]);

function jsonResponse(response, statusCode, payload) {
	const body = JSON.stringify(payload);
	response.writeHead(statusCode, {
		"Content-Type": "application/json; charset=utf-8",
		"Content-Length": Buffer.byteLength(body),
		"X-Content-Type-Options": "nosniff",
	});
	response.end(body);
}

function clampTimeout(value) {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return defaultTimeoutMs;
	}
	return Math.max(250, Math.min(maxTimeoutMs, Math.floor(value)));
}

function safeRelativePath(rawPath) {
	if (typeof rawPath !== "string") {
		throw new Error("File path must be a string.");
	}
	const trimmed = rawPath.trim().replace(/\\/g, "/");
	if (!trimmed || trimmed.includes("\0")) throw new Error("Invalid file path.");
	if (trimmed.startsWith("/") || /^[a-zA-Z]:\//.test(trimmed)) {
		throw new Error("Absolute file paths are not allowed.");
	}
	const normalized = path.posix.normalize(trimmed).replace(/^\.\//, "");
	if (
		!normalized ||
		normalized === "." ||
		normalized === ".." ||
		normalized.startsWith("../") ||
		normalized.includes("/../")
	) {
		throw new Error("Path traversal is not allowed.");
	}
	if (normalized.length > 260 || normalized.split("/").length > 16) {
		throw new Error("File path is too long or too deep.");
	}
	const [firstSegment] = normalized.split("/");
	if (
		normalized === "main.py" ||
		normalized === "main.mjs" ||
		normalized === "main.sh" ||
		normalized === "package.json" ||
		normalized === ".stdin" ||
		firstSegment === "node_modules" ||
		firstSegment === "home" ||
		firstSegment === "tmp"
	) {
		throw new Error("Reserved sandbox file path.");
	}
	return normalized;
}

function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bytesFromBase64(value, filePath) {
	const normalized = value.replace(/\s/g, "");
	if (
		normalized.length % 4 !== 0 ||
		!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
	) {
		throw new Error(`Input file is not valid base64: ${filePath}`);
	}
	return Buffer.from(normalized, "base64");
}

function validateRunPayload(payload) {
	if (!isPlainObject(payload))
		throw new Error("Request body must be an object.");
	const language = payload.language;
	if (language !== "python" && language !== "node" && language !== "bash") {
		throw new Error("language must be 'python', 'node', or 'bash'.");
	}
	if (typeof payload.code !== "string" || !payload.code.trim()) {
		throw new Error("code is required.");
	}
	if (payload.code.length > maxCodeChars) {
		throw new Error(
			`code is too large. Maximum is ${maxCodeChars} characters.`,
		);
	}
	const stdin =
		typeof payload.stdin === "string" ? payload.stdin.slice(0, 100_000) : "";
	const files = Array.isArray(payload.files) ? payload.files : [];
	if (files.length > maxInputFiles) {
		throw new Error(`Too many input files. Maximum is ${maxInputFiles}.`);
	}
	let totalInputBytes = 0;
	const normalizedFiles = files.map((file) => {
		if (!isPlainObject(file)) throw new Error("Each file must be an object.");
		const filePath = safeRelativePath(file.path);
		const hasBase64 = typeof file.contentBase64 === "string";
		const textContent = typeof file.content === "string" ? file.content : "";
		if (!hasBase64 && textContent.length > maxInputFileChars) {
			throw new Error(`Input text file is too large: ${filePath}`);
		}
		const bytes = hasBase64
			? bytesFromBase64(file.contentBase64, filePath)
			: Buffer.from(textContent, "utf8");
		if (bytes.byteLength > maxInputFileBytes) {
			throw new Error(`Input file is too large: ${filePath}`);
		}
		totalInputBytes += bytes.byteLength;
		if (totalInputBytes > maxInputTotalBytes) {
			throw new Error(
				`Input files are too large. Maximum total is ${maxInputTotalBytes} bytes.`,
			);
		}
		return { path: filePath, bytes };
	});
	return {
		language,
		code: payload.code,
		stdin,
		files: normalizedFiles,
		timeoutMs: clampTimeout(payload.timeoutMs),
	};
}

async function readJsonBody(request) {
	const chunks = [];
	let totalBytes = 0;
	for await (const chunk of request) {
		totalBytes += chunk.byteLength;
		if (totalBytes > maxRequestBytes) {
			throw new Error(
				`Request body is too large. Maximum is ${maxRequestBytes} bytes.`,
			);
		}
		chunks.push(chunk);
	}
	const raw = Buffer.concat(chunks).toString("utf8");
	return validateRunPayload(JSON.parse(raw || "{}"));
}

function hashBytes(value) {
	return createHash("sha256").update(value).digest("hex");
}

async function writeInputFiles(workdir, files) {
	const hashes = new Map();
	for (const file of files) {
		const target = path.resolve(workdir, file.path);
		if (!target.startsWith(`${workdir}${path.sep}`)) {
			throw new Error("Path traversal is not allowed.");
		}
		await mkdir(path.dirname(target), { recursive: true });
		await writeFile(target, file.bytes);
		if (canSwitchUser) {
			await chown(target, sandboxUid, sandboxGid).catch(() => undefined);
		}
		hashes.set(file.path, hashBytes(file.bytes));
	}
	return hashes;
}

async function chownRecursive(target) {
	if (!canSwitchUser) return;
	const stats = await lstat(target).catch(() => null);
	if (!stats) return;
	await chown(target, sandboxUid, sandboxGid).catch(() => undefined);
	if (!stats.isDirectory()) return;
	const entries = await readdir(target, { withFileTypes: true });
	await Promise.all(
		entries.map((entry) => chownRecursive(path.join(target, entry.name))),
	);
}

function appendLimited(current, chunk, limit) {
	if (current.buffer.length >= limit) return { ...current, truncated: true };
	const remaining = limit - current.buffer.length;
	const nextChunk =
		chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
	return {
		buffer: Buffer.concat([current.buffer, nextChunk]),
		truncated: current.truncated || chunk.byteLength > remaining,
	};
}

function commandForLanguage(language) {
	if (language === "python") {
		return {
			command: "python3",
			args: ["-I", "main.py"],
			entryFile: "main.py",
		};
	}
	if (language === "bash") {
		return {
			command: "bash",
			args: ["--noprofile", "--norc", "-e", "-u", "-o", "pipefail", "main.sh"],
			entryFile: "main.sh",
		};
	}
	return {
		command: process.execPath,
		args: ["--no-warnings", "main.mjs"],
		entryFile: "main.mjs",
	};
}

function executionCommandForLanguage(language) {
	const base = commandForLanguage(language);
	const limitArgs = [];
	if (canSwitchUser && maxProcesses > 0) {
		limitArgs.push(`--nproc=${Math.floor(maxProcesses)}`);
	}
	if (maxOutputFileSizeBytes > 0) {
		limitArgs.push(`--fsize=${Math.floor(maxOutputFileSizeBytes)}`);
	}
	if (maxCpuSeconds > 0) limitArgs.push(`--cpu=${Math.floor(maxCpuSeconds)}`);
	if (!canUsePrlimit || limitArgs.length === 0) return base;
	return {
		...base,
		command: "prlimit",
		args: [...limitArgs, "--", base.command, ...base.args],
	};
}

function nodePrelude() {
	return [
		"import { createRequire } from 'node:module';",
		"import { fileURLToPath } from 'node:url';",
		"import path from 'node:path';",
		"const require = createRequire(import.meta.url);",
		"const __filename = fileURLToPath(import.meta.url);",
		"const __dirname = path.dirname(__filename);",
		"globalThis.require = require;",
		"globalThis.__filename = __filename;",
		"globalThis.__dirname = __dirname;",
		"",
	].join("\n");
}

async function prepareRun(input) {
	await mkdir(runRoot, { recursive: true });
	if (canSwitchUser) {
		await chown(runRoot, sandboxUid, sandboxGid).catch(() => undefined);
		await chmod(runRoot, 0o700).catch(() => undefined);
	}
	const runId = randomUUID();
	const workdir = await mkdtemp(path.join(runRoot, `run-${runId}-`));
	await chmod(workdir, 0o700);
	const inputHashes = await writeInputFiles(workdir, input.files);
	const { entryFile } = commandForLanguage(input.language);
	const source =
		input.language === "node"
			? `${nodePrelude()}\n${input.code}\n`
			: input.language === "bash"
				? `set -euo pipefail\n${input.code}\n`
				: `${input.code}\n`;
	await writeFile(path.join(workdir, entryFile), source, "utf8");
	if (input.language === "node") {
		await writeFile(
			path.join(workdir, "package.json"),
			'{"type":"module"}\n',
			"utf8",
		);
		await symlink(
			"/opt/sandbox/node_modules",
			path.join(workdir, "node_modules"),
		).catch(() => undefined);
	}
	await mkdir(path.join(workdir, "tmp"), { recursive: true });
	await mkdir(path.join(workdir, "home"), { recursive: true });
	await chownRecursive(workdir);
	return { runId, workdir, inputHashes };
}

function executeProcess(input, workdir) {
	const { command, args } = executionCommandForLanguage(input.language);
	const startedAt = Date.now();
	return new Promise((resolve) => {
		let stdout = { buffer: Buffer.alloc(0), truncated: false };
		let stderr = { buffer: Buffer.alloc(0), truncated: false };
		let timedOut = false;
		let settled = false;
		const child = spawn(command, args, {
			cwd: workdir,
			detached: true,
			...(canSwitchUser ? { uid: sandboxUid, gid: sandboxGid } : {}),
			stdio: ["pipe", "pipe", "pipe"],
			env: {
				PATH: "/usr/local/bin:/usr/bin:/bin",
				HOME: path.join(workdir, "home"),
				TMPDIR: path.join(workdir, "tmp"),
				MPLCONFIGDIR: path.join(workdir, "tmp", "matplotlib"),
				XDG_CACHE_HOME: path.join(workdir, "tmp", "cache"),
				PYTHONDONTWRITEBYTECODE: "1",
				PYTHONUNBUFFERED: "1",
				OPENBLAS_NUM_THREADS: "1",
				OMP_NUM_THREADS: "1",
				MKL_NUM_THREADS: "1",
				NUMEXPR_NUM_THREADS: "1",
				NODE_PATH: "/opt/sandbox/node_modules",
				npm_config_cache: path.join(workdir, "tmp", "npm"),
			},
		});

		child.stdout.on("data", (chunk) => {
			stdout = appendLimited(stdout, chunk, maxStdoutBytes);
		});
		child.stderr.on("data", (chunk) => {
			stderr = appendLimited(stderr, chunk, maxStderrBytes);
		});
		child.stdin.end(input.stdin);

		const timer = setTimeout(() => {
			timedOut = true;
			if (child.pid) {
				try {
					process.kill(-child.pid, "SIGKILL");
				} catch {
					child.kill("SIGKILL");
				}
			}
		}, input.timeoutMs);

		function finish(exitCode, signal) {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({
				exitCode: timedOut ? null : exitCode,
				signal: signal ?? null,
				timedOut,
				durationMs: Date.now() - startedAt,
				stdout: stdout.buffer.toString("utf8"),
				stderr: stderr.buffer.toString("utf8"),
				truncated: stdout.truncated || stderr.truncated,
			});
		}

		child.on("error", (error) => {
			stderr = appendLimited(
				stderr,
				Buffer.from(error.message),
				maxStderrBytes,
			);
			finish(127, null);
		});
		child.on("close", finish);
	});
}

function mimeTypeForPath(filePath) {
	const extension = path.extname(filePath).toLowerCase();
	if (extension === ".json") return "application/json";
	if (extension === ".csv") return "text/csv";
	if (extension === ".html" || extension === ".htm") return "text/html";
	if (extension === ".svg") return "image/svg+xml";
	if (extension === ".png") return "image/png";
	if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
	if (extension === ".webp") return "image/webp";
	if (extension === ".pdf") return "application/pdf";
	if (textExtensions.has(extension)) return "text/plain";
	return "application/octet-stream";
}

function isProbablyText(bytes, filePath) {
	if (textExtensions.has(path.extname(filePath).toLowerCase())) return true;
	if (bytes.includes(0)) return false;
	return bytes
		.subarray(0, Math.min(bytes.length, 4096))
		.every((byte) => byte === 9 || byte === 10 || byte === 13 || byte >= 32);
}

async function collectFiles(root, inputHashes) {
	const collected = [];
	let embeddedBytes = 0;
	async function walk(directory, prefix = "") {
		if (collected.length >= maxCollectedFiles) return;
		const entries = await readdir(directory, { withFileTypes: true }).catch(
			() => [],
		);
		for (const entry of entries) {
			if (collected.length >= maxCollectedFiles) return;
			if (
				entry.name === "node_modules" ||
				entry.name === "home" ||
				entry.name === "tmp"
			) {
				continue;
			}
			if (
				entry.name === "main.py" ||
				entry.name === "main.mjs" ||
				entry.name === "main.sh" ||
				entry.name === "package.json"
			) {
				continue;
			}
			const absolutePath = path.join(directory, entry.name);
			const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				await walk(absolutePath, relativePath);
				continue;
			}
			if (!entry.isFile()) continue;
			const stats = await lstat(absolutePath);
			if (stats.size > maxCollectedFileBytes) {
				collected.push({
					path: relativePath,
					size: stats.size,
					mimeType: mimeTypeForPath(relativePath),
					skipped: "too_large",
					fromInput: inputHashes.has(relativePath),
					modified: true,
				});
				continue;
			}
			const bytes = await readFile(absolutePath);
			const hash = createHash("sha256").update(bytes).digest("hex");
			const originalHash = inputHashes.get(relativePath);
			const file = {
				path: relativePath,
				size: stats.size,
				mimeType: mimeTypeForPath(relativePath),
				hash,
				fromInput: inputHashes.has(relativePath),
				modified: originalHash ? originalHash !== hash : true,
			};
			if (isProbablyText(bytes, relativePath)) {
				const previewBytes = bytes.subarray(0, maxFilePreviewBytes);
				file.textPreview = previewBytes.toString("utf8");
				file.truncated = bytes.byteLength > maxFilePreviewBytes;
			}
			if (bytes.byteLength > maxDownloadFileBytes) {
				file.contentOmitted = "too_large";
			} else if (embeddedBytes + bytes.byteLength > maxDownloadTotalBytes) {
				file.contentOmitted = "total_limit";
			} else {
				file.contentBase64 = bytes.toString("base64");
				embeddedBytes += bytes.byteLength;
			}
			collected.push(file);
		}
	}
	await walk(root);
	return collected;
}

async function runSandbox(input) {
	const prepared = await prepareRun(input);
	try {
		const execution = await executeProcess(input, prepared.workdir);
		const files = await collectFiles(prepared.workdir, prepared.inputHashes);
		return {
			ok: execution.exitCode === 0 && !execution.timedOut,
			language: input.language,
			...execution,
			files,
		};
	} finally {
		await rm(prepared.workdir, { recursive: true, force: true }).catch(
			() => undefined,
		);
	}
}

async function start() {
	await mkdir(path.dirname(socketPath), { recursive: true });
	try {
		await access(socketPath, fsConstants.F_OK);
		await rm(socketPath, { force: true });
	} catch {
		// no stale socket
	}

	const server = createServer(async (request, response) => {
		if (request.method === "GET" && request.url === "/health") {
			jsonResponse(response, 200, { status: "ok" });
			return;
		}
		if (request.method !== "POST" || request.url !== "/run") {
			jsonResponse(response, 404, { error: "Not found" });
			return;
		}
		const executionId =
			request.headers["x-sandbox-execution-id"]?.toString() ?? randomUUID();
		const startedAt = Date.now();
		try {
			const input = await readJsonBody(request);
			log("info", "sandbox-runner execution started", {
				executionId,
				language: input.language,
				fileCount: input.files.length,
				timeoutMs: input.timeoutMs,
			});
			const result = await runSandbox(input);
			log("info", "sandbox-runner execution completed", {
				executionId,
				language: result.language,
				ok: result.ok,
				exitCode: result.exitCode,
				signal: result.signal,
				timedOut: result.timedOut,
				durationMs: result.durationMs,
				wallDurationMs: Date.now() - startedAt,
				stdoutBytes: Buffer.byteLength(result.stdout),
				stderrBytes: Buffer.byteLength(result.stderr),
				fileCount: result.files.length,
				truncated: result.truncated,
			});
			jsonResponse(response, 200, result);
		} catch (error) {
			log("warn", "sandbox-runner execution rejected", {
				executionId,
				durationMs: Date.now() - startedAt,
				error: error instanceof Error ? error.message : String(error),
			});
			jsonResponse(response, 400, {
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	});

	server.listen(socketPath, async () => {
		if (canSwitchUser) {
			await chown(socketPath, 0, socketGid).catch(() => undefined);
			await chmod(socketPath, 0o660).catch(() => undefined);
		} else {
			await chmod(socketPath, 0o600).catch(() => undefined);
		}
		log("info", "sandbox-runner listening", { socketPath, runRoot });
	});

	for (const signal of ["SIGINT", "SIGTERM"]) {
		process.on(signal, () => {
			server.close(() => {
				rm(socketPath, { force: true }).finally(() => process.exit(0));
			});
		});
	}
}

start().catch((error) => {
	log("error", "sandbox-runner failed to start", {
		error: error instanceof Error ? error.message : String(error),
		stack: error instanceof Error ? error.stack : undefined,
	});
	process.exit(1);
});
