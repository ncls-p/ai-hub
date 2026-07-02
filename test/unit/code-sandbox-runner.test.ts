import { spawn, type ChildProcessByStdio } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

type SandboxResponse = {
	ok?: boolean;
	error?: string;
	stdout?: string;
	stderr?: string;
	exitCode?: number | null;
	timedOut?: boolean;
	files?: Array<{
		path: string;
		textPreview?: string;
		modified?: boolean;
		size?: number;
	}>;
};

let child: ChildProcessByStdio<null, Readable, Readable>;
let runRoot: string;
let socketDir: string;
let socketPath: string;
let stderr = "";

function waitForSocket() {
	return new Promise<void>((resolve, reject) => {
		const deadline = Date.now() + 5000;
		const timer = setInterval(() => {
			if (existsSync(socketPath)) {
				clearInterval(timer);
				resolve();
				return;
			}
			if (Date.now() > deadline) {
				clearInterval(timer);
				reject(new Error(`sandbox-runner did not start: ${stderr}`));
			}
		}, 50);
	});
}

function requestRun(payload: unknown) {
	return new Promise<{ status: number | undefined; body: SandboxResponse }>(
		(resolve, reject) => {
			const body = JSON.stringify(payload);
			const request = http.request(
				{
					socketPath,
					path: "/run",
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"Content-Length": Buffer.byteLength(body),
					},
				},
				(response) => {
					let responseBody = "";
					response.on("data", (chunk: Buffer) => {
						responseBody += chunk.toString("utf8");
					});
					response.on("end", () => {
						resolve({
							status: response.statusCode,
							body: JSON.parse(responseBody) as SandboxResponse,
						});
					});
				},
			);
			request.on("error", reject);
			request.end(body);
		},
	);
}

describe("sandbox-runner", () => {
	beforeAll(async () => {
		runRoot = mkdtempSync(path.join(os.tmpdir(), "ai-hub-sandbox-runs-"));
		socketDir = mkdtempSync(path.join(os.tmpdir(), "ai-hub-sandbox-socket-"));
		socketPath = path.join(socketDir, "sandbox.sock");
		child = spawn(process.execPath, ["scripts/sandbox-runner.mjs"], {
			cwd: process.cwd(),
			env: {
				...process.env,
				SANDBOX_RUNNER_SOCKET: socketPath,
				SANDBOX_RUN_ROOT: runRoot,
				SANDBOX_RUN_UID: String(process.getuid?.() ?? 1000),
				SANDBOX_RUN_GID: String(process.getgid?.() ?? 1000),
			},
			stdio: ["ignore", "pipe", "pipe"],
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString("utf8");
		});
		await waitForSocket();
	}, 10_000);

	afterAll(() => {
		child?.kill("SIGTERM");
		rmSync(runRoot, { recursive: true, force: true });
		rmSync(socketDir, { recursive: true, force: true });
	});

	it("runs Node.js code, returns stdout, and previews generated files", async () => {
		const result = await requestRun({
			language: "node",
			code: [
				'const fs = require("node:fs");',
				'console.log([1, 2, 3].map((value) => value * value).join(","));',
				'fs.writeFileSync("result.txt", "squares=1,4,9");',
			].join("\n"),
		});

		expect(result.status).toBe(200);
		expect(result.body.ok).toBe(true);
		expect(result.body.stdout?.trim()).toBe("1,4,9");
		expect(result.body.files).toContainEqual(
			expect.objectContaining({
				path: "result.txt",
				textPreview: "squares=1,4,9",
				modified: true,
			}),
		);
		expect(readdirSync(runRoot)).toEqual([]);
	});

	it("runs Bash commands with binary input files", async () => {
		const result = await requestRun({
			language: "bash",
			code: [
				"wc -c < data/input.bin",
				"printf 'bash-ok' > output.txt",
			].join("\n"),
			files: [
				{
					path: "data/input.bin",
					contentBase64: Buffer.from([0, 1, 2, 3]).toString("base64"),
				},
			],
		});

		expect(result.status).toBe(200);
		expect(result.body.ok).toBe(true);
		expect(result.body.stdout?.trim()).toBe("4");
		expect(result.body.files).toContainEqual(
			expect.objectContaining({
				path: "output.txt",
				textPreview: "bash-ok",
				modified: true,
			}),
		);
		expect(readdirSync(runRoot)).toEqual([]);
	});

	it("rejects unsafe input file paths", async () => {
		const result = await requestRun({
			language: "node",
			code: "console.log('nope')",
			files: [{ path: "../outside.txt", content: "secret" }],
		});

		expect(result.status).toBe(400);
		expect(result.body.ok).toBe(false);
		expect(result.body.error).toMatch(/Path traversal/i);
	});

	it("kills slow executions after the requested timeout", async () => {
		const result = await requestRun({
			language: "node",
			timeoutMs: 250,
			code: "while (true) {}",
		});

		expect(result.status).toBe(200);
		expect(result.body.ok).toBe(false);
		expect(result.body.timedOut).toBe(true);
		expect(result.body.exitCode).toBeNull();
		expect(readdirSync(runRoot)).toEqual([]);
	});
});
