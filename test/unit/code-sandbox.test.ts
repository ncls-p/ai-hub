import { mkdtempSync, rmSync } from "node:fs";
import http, { type Server } from "node:http";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/chat/attachments", () => ({
	createChatAttachment: vi.fn(async (input: { fileName: string }) => ({
		kind: "chat_file",
		id: `att-${input.fileName}`,
		fileName: input.fileName,
		mimeType: "text/plain",
		size: 1,
		hash: "hash",
		url: `/attachments/${input.fileName}`,
		category: "text",
		extractionStatus: "readable",
		extractedTextChars: 0,
	})),
	getChatAttachmentBytes: vi.fn(async () => ({
		metadata: {
			kind: "chat_file",
			id: "source-att",
			fileName: "Source File.txt",
			mimeType: "text/plain",
			size: 5,
			hash: "hash",
			url: "/attachments/source",
			category: "text",
			extractionStatus: "readable",
			extractedTextChars: 12,
		},
		bytes: Buffer.from("input"),
	})),
	getChatAttachmentExtractedText: vi.fn(async () => ({
		text: "extracted text",
	})),
	isChatFileAttachment: vi.fn(
		(value: { kind?: string }) => value.kind === "chat_file",
	),
}));

type ExecuteCodeSandbox =
	typeof import("@/modules/tool/code-sandbox")["executeCodeSandbox"];

type RunnerRequest = {
	language: "python" | "node" | "bash";
	code: string;
	stdin?: string;
	timeoutMs?: number;
	files?: Array<{ path: string; contentBase64?: string; content?: string }>;
};

type RunnerResponse = Record<string, unknown>;

type RunnerHandler = (request: RunnerRequest) => RunnerResponse;

let server: Server | undefined;
let socketDir: string | undefined;
let socketPath: string | undefined;
let requests: RunnerRequest[] = [];

const validEnv = {
	NODE_ENV: "test",
	BETTER_AUTH_SECRET: "test-secret",
	BETTER_AUTH_URL: "http://localhost:3000",
	BETTER_AUTH_TRUSTED_ORIGINS: "http://localhost:3000",
	DATABASE_URL: "postgres://localhost/test",
	APP_ENCRYPTION_KEY:
		"0000000000000000000000000000000000000000000000000000000000000000",
	OBJECT_STORAGE_BUCKET: "test",
	OBJECT_STORAGE_ACCESS_KEY_ID: "test",
	OBJECT_STORAGE_SECRET_ACCESS_KEY: "test",
};

function listen(server: Server, socketPath: string) {
	return new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(socketPath, () => {
			server.off("error", reject);
			resolve();
		});
	});
}

function close(server: Server) {
	return new Promise<void>((resolve) => {
		server.close(() => resolve());
	});
}

async function startFakeRunner(handler: RunnerHandler) {
	socketDir = mkdtempSync(path.join(os.tmpdir(), "ai-hub-runner-test-"));
	socketPath = path.join(socketDir, "sandbox.sock");
	requests = [];
	server = http.createServer((request, response) => {
		if (request.method === "GET" && request.url === "/health") {
			response.writeHead(200, { "Content-Type": "application/json" });
			response.end(JSON.stringify({ status: "ok" }));
			return;
		}
		if (request.method !== "POST" || request.url !== "/run") {
			response.writeHead(404, { "Content-Type": "application/json" });
			response.end(JSON.stringify({ error: "Not found" }));
			return;
		}
		const chunks: Buffer[] = [];
		request.on("data", (chunk: Buffer) => chunks.push(chunk));
		request.on("end", () => {
			const payload = JSON.parse(
				Buffer.concat(chunks).toString("utf8"),
			) as RunnerRequest;
			requests.push(payload);
			const body = JSON.stringify(handler(payload));
			response.writeHead(200, {
				"Content-Type": "application/json",
				"Content-Length": Buffer.byteLength(body),
			});
			response.end(body);
		});
	});
	await listen(server, socketPath);
	process.env.SANDBOX_RUNNER_SOCKET = socketPath;
	return socketPath;
}

async function loadSandboxModule() {
	vi.resetModules();
	Object.assign(process.env, validEnv);
	return import("@/modules/tool/code-sandbox");
}

beforeEach(() => {
	Object.assign(process.env, validEnv);
	delete process.env.SANDBOX_RUNNER_SOCKET;
	requests = [];
});

afterEach(async () => {
	if (server) await close(server);
	server = undefined;
	if (socketDir) rmSync(socketDir, { recursive: true, force: true });
	socketDir = undefined;
	socketPath = undefined;
	delete process.env.SANDBOX_RUNNER_SOCKET;
	vi.resetModules();
});

describe("code sandbox runner client", () => {
	it("runs Node.js code through the sandbox runner and returns generated files", async () => {
		await startFakeRunner(() => ({
			ok: true,
			language: "node",
			exitCode: 0,
			signal: null,
			timedOut: false,
			durationMs: 12,
			stdout: "1,4,9\n",
			stderr: "",
			truncated: false,
			files: [
				{
					path: "result.txt",
					size: 13,
					mimeType: "text/plain",
					textPreview: "squares=1,4,9",
					modified: true,
					contentBase64: Buffer.from("squares=1,4,9").toString("base64"),
				},
			],
		}));
		const { executeCodeSandbox } = await loadSandboxModule();

		const result = await (executeCodeSandbox as ExecuteCodeSandbox)({
			language: "node",
			code: [
				'const fs = require("node:fs");',
				'console.log([1, 2, 3].map((value) => value * value).join(","));',
				'fs.writeFileSync("result.txt", "squares=1,4,9");',
			].join("\n"),
			files: [{ path: "data/input.txt", content: "hello" }],
		});

		expect(result.ok).toBe(true);
		expect(result.stdout.trim()).toBe("1,4,9");
		expect(result.files).toContainEqual(
			expect.objectContaining({
				path: "result.txt",
				textPreview: "squares=1,4,9",
				modified: true,
			}),
		);
		expect(result.files[0]).not.toHaveProperty("contentBase64");
		expect(requests).toHaveLength(1);
		expect(requests[0]).toMatchObject({
			language: "node",
			timeoutMs: 15_000,
		});
		expect(requests[0]?.files?.[0]).toEqual({
			path: "data/input.txt",
			contentBase64: Buffer.from("hello").toString("base64"),
		});
	});

	it("rejects unsafe input file paths before contacting the runner", async () => {
		const { executeCodeSandbox } = await loadSandboxModule();

		const result = await (executeCodeSandbox as ExecuteCodeSandbox)({
			language: "node",
			code: "console.log('nope')",
			files: [{ path: "../outside.txt", content: "secret" }],
		});

		expect(result.ok).toBe(false);
		expect(result.error).toMatch(/Path traversal/i);
		expect(requests).toHaveLength(0);
	});

	it("returns an actionable error when the sandbox runner is unavailable", async () => {
		const missingSocketDir = mkdtempSync(
			path.join(os.tmpdir(), "ai-hub-missing-runner-"),
		);
		process.env.SANDBOX_RUNNER_SOCKET = path.join(
			missingSocketDir,
			"missing.sock",
		);
		const { executeCodeSandbox } = await loadSandboxModule();

		const result = await (executeCodeSandbox as ExecuteCodeSandbox)({
			language: "bash",
			code: "echo ok",
		});

		expect(result.ok).toBe(false);
		expect(result.stderr).toContain("Sandbox runner unavailable");
		expect(result.stderr).toContain("missing.sock");
		rmSync(missingSocketDir, { recursive: true, force: true });
	});

	it("runs Python with stdin, base64 files, attachment text, and persisted outputs", async () => {
		await startFakeRunner((request) => {
			expect(request.stdin).toBe("hello stdin");
			expect(request.timeoutMs).toBe(120_000);
			expect(request.files).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						path: "data.bin",
						contentBase64: Buffer.from("bin").toString("base64"),
					}),
					expect.objectContaining({
						path: "attachments/Source File.txt",
						contentBase64: Buffer.from("input").toString("base64"),
					}),
					expect.objectContaining({
						path: "attachments/Source File.extracted.txt",
						contentBase64: Buffer.from("extracted text").toString("base64"),
					}),
				]),
			);
			return {
				ok: true,
				language: "python",
				exitCode: 0,
				signal: null,
				timedOut: false,
				durationMs: 42,
				stdout: "py ok\n",
				stderr: "",
				truncated: false,
				files: [
					{
						path: "report.txt",
						size: 16,
						mimeType: "text/plain",
						textPreview: "generated report",
						modified: true,
						contentBase64: Buffer.from("generated report").toString(
							"base64",
						),
					},
					{
						path: "data.bin",
						size: 3,
						mimeType: "application/octet-stream",
						fromInput: true,
						modified: false,
						contentBase64: Buffer.from("bin").toString("base64"),
					},
				],
			};
		});
		const { executeCodeSandbox } = await loadSandboxModule();

		const result = await (executeCodeSandbox as ExecuteCodeSandbox)(
			{
				language: "python",
				code: "print(input())",
				stdin: "hello stdin",
				files: [
					{
						path: "data.bin",
						contentBase64: Buffer.from("bin").toString("base64"),
					},
				],
				attachments: [{ id: "source-att", includeExtractedText: true }],
				timeoutMs: 999_999,
			},
			{ workspaceId: "ws-1", userId: "user-1" },
		);

		expect(result.ok).toBe(true);
		expect(result.language).toBe("python");
		expect(result.files).toContainEqual(
			expect.objectContaining({
				path: "report.txt",
				textPreview: "generated report",
				downloadUrl: "/attachments/report.txt",
			}),
		);
		expect(result.files).toContainEqual(
			expect.objectContaining({
				path: "data.bin",
				fromInput: true,
				modified: false,
			}),
		);
	});

	it("reports execution errors, timeouts, binary previews, and oversized collected files", async () => {
		await startFakeRunner(() => ({
			ok: false,
			language: "bash",
			exitCode: null,
			signal: "SIGKILL",
			timedOut: true,
			durationMs: 250,
			stdout: "",
			stderr: "execution timed out",
			truncated: false,
			files: [
				{
					path: "big.txt",
					size: 1_000_001,
					mimeType: "text/plain",
					skipped: "too_large",
				},
				{
					path: "image.bin",
					size: 4,
					mimeType: "application/octet-stream",
					contentBase64: Buffer.from([0, 1, 2, 3]).toString("base64"),
				},
			],
		}));
		const { executeCodeSandbox } = await loadSandboxModule();

		const result = await (executeCodeSandbox as ExecuteCodeSandbox)({
			language: "bash",
			code: "sleep 999",
			timeoutMs: 10,
		});

		expect(result.ok).toBe(false);
		expect(result.timedOut).toBe(true);
		expect(result.exitCode).toBeNull();
		expect(result.files).toContainEqual(
			expect.objectContaining({ path: "big.txt", skipped: "too_large" }),
		);
		expect(result.files).toContainEqual(
			expect.objectContaining({
				path: "image.bin",
				mimeType: "application/octet-stream",
			}),
		);
		expect(result.files.find((file) => file.path === "image.bin")).not.toHaveProperty(
			"contentBase64",
		);
	});

	it("validates language, code, input file size, base64, reserved paths, and attachment context", async () => {
		const { executeCodeSandbox } = await loadSandboxModule();
		await expect(
			(executeCodeSandbox as ExecuteCodeSandbox)({
				language: "ruby" as never,
				code: "puts 1",
			}),
		).resolves.toMatchObject({
			ok: false,
			error: "language must be 'python', 'node', or 'bash'.",
		});
		await expect(
			(executeCodeSandbox as ExecuteCodeSandbox)({
				language: "node",
				code: "   ",
			}),
		).resolves.toMatchObject({ ok: false, error: "code is required." });
		await expect(
			(executeCodeSandbox as ExecuteCodeSandbox)({
				language: "node",
				code: "x",
				files: [{ path: "main.mjs", content: "reserved" }],
			}),
		).resolves.toMatchObject({
			ok: false,
			error: "Reserved sandbox file path.",
		});
		await expect(
			(executeCodeSandbox as ExecuteCodeSandbox)({
				language: "node",
				code: "x",
				files: [{ path: "data.txt", contentBase64: "not-base64" }],
			}),
		).resolves.toMatchObject({
			ok: false,
			error: expect.stringContaining("not valid base64"),
		});
		await expect(
			(executeCodeSandbox as ExecuteCodeSandbox)({
				language: "node",
				code: "x",
				files: [{ path: "huge.txt", content: "x".repeat(1_500_001) }],
			}),
		).resolves.toMatchObject({
			ok: false,
			error: expect.stringContaining("Input file is too large"),
		});
		await expect(
			(executeCodeSandbox as ExecuteCodeSandbox)({
				language: "node",
				code: "x",
				attachments: [{ id: "a" }],
			}),
		).resolves.toMatchObject({
			ok: false,
			error: "Sandbox attachment access requires a workspace context.",
		});
		expect(requests).toHaveLength(0);
	});
});
