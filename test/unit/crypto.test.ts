import { beforeAll, describe, expect, it } from "vitest";

let generateRandomHex: (bytes: number) => string;
let hashWithSalt: (value: string) => Promise<{ hash: string; salt: string }>;
let encryptValue: (plaintext: string) => Promise<string>;
let decryptValue: (encryptedJson: string) => Promise<string>;

// crypto.ts imports env.ts which validates at module load time.
// Set all required env vars before any imports.
beforeAll(async () => {
	process.env.APP_ENCRYPTION_KEY =
		"0000000000000000000000000000000000000000000000000000000000000000";
	process.env.APP_ENCRYPTION_KEY_ID = "default";
	process.env.BETTER_AUTH_SECRET = "test-secret-min-32-chars-long";
	process.env.BETTER_AUTH_URL = "http://localhost:3000";
	process.env.BETTER_AUTH_TRUSTED_ORIGINS = "http://localhost:3000";
	process.env.DATABASE_URL = "postgres://localhost/test";
	process.env.OBJECT_STORAGE_BUCKET = "test";
	process.env.OBJECT_STORAGE_ACCESS_KEY_ID = "test";
	process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY = "test";

	({ generateRandomHex, hashWithSalt, encryptValue, decryptValue } =
		await import("@/lib/crypto"));
});

describe("crypto utilities", () => {
	it("generates random hex of the correct length", () => {
		const hex = generateRandomHex(16);
		expect(hex).toHaveLength(32);
		expect(hex).toMatch(/^([0-9a-f]{2})+$/);
	});

	it("generates distinct values on each call", () => {
		const a = generateRandomHex(16);
		const b = generateRandomHex(16);
		expect(a).not.toBe(b);
	});

	it("hashes with salt producing correct lengths", async () => {
		const result = await hashWithSalt("test-password");
		expect(result.hash).toHaveLength(64);
		expect(result.salt).toHaveLength(64);
	});

	it("produces different hash/salt pairs for the same value", async () => {
		const a = await hashWithSalt("same");
		const b = await hashWithSalt("same");
		expect(a.hash).not.toBe(b.hash);
		expect(a.salt).not.toBe(b.salt);
	});

	it("encrypts a string to a JSON payload", async () => {
		const encrypted = await encryptValue("hello world");
		const parsed = JSON.parse(encrypted);
		expect(parsed).toHaveProperty("ct");
		expect(parsed).toHaveProperty("iv");
		expect(parsed.kid).toBe("default");
	});

	it("produces different ciphertexts for the same plaintext", async () => {
		const a = await encryptValue("same plaintext");
		const b = await encryptValue("same plaintext");
		expect(JSON.parse(a).ct).not.toBe(JSON.parse(b).ct);
	});

	it("decrypts to the original plaintext", async () => {
		const plaintext = "secret message";
		const encrypted = await encryptValue(plaintext);
		const decrypted = await decryptValue(encrypted);
		expect(decrypted).toBe(plaintext);
	});

	it("round-trips empty string", async () => {
		const encrypted = await encryptValue("");
		expect(await decryptValue(encrypted)).toBe("");
	});

	it("round-trips unicode content", async () => {
		const plaintext = "café 🎉 日本語";
		const encrypted = await encryptValue(plaintext);
		expect(await decryptValue(encrypted)).toBe(plaintext);
	});

	it("throws on key ID mismatch", async () => {
		const encrypted = JSON.stringify({
			ct: "abc",
			iv: "def",
			kid: "wrong-key-id",
		});
		await expect(decryptValue(encrypted)).rejects.toThrow(
			"Encryption key ID mismatch",
		);
	});
});
