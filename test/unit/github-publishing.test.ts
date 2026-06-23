import { createPrivateKey, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import { normalizeGitHubPrivateKey } from "@/modules/github/publishing";

function privateKeyPem() {
	return generateKeyPairSync("rsa", { modulusLength: 2048 })
		.privateKey.export({ format: "pem", type: "pkcs1" })
		.toString();
}

describe("GitHub publishing", () => {
	it("normalizes escaped and quoted GitHub App private keys", () => {
		const pem = privateKeyPem();
		const escaped = `"${pem.replace(/\n/g, "\\n")}"`;
		const normalized = normalizeGitHubPrivateKey(escaped);

		expect(normalized).toContain("-----BEGIN RSA PRIVATE KEY-----");
		expect(() => createPrivateKey(normalized)).not.toThrow();
	});

	it("normalizes base64 encoded PEM private keys", () => {
		const pem = privateKeyPem();
		const normalized = normalizeGitHubPrivateKey(
			Buffer.from(pem, "utf8").toString("base64"),
		);

		expect(normalized).toContain("-----BEGIN RSA PRIVATE KEY-----");
		expect(() => createPrivateKey(normalized)).not.toThrow();
	});
});
