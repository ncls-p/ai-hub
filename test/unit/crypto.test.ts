import { describe, it, expect, beforeEach } from "vitest";

// crypto.ts imports env.ts which validates at module load time.
// Set all required env vars before any imports.
describe("crypto utilities", () => {
	beforeEach(() => {
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
	});

	it("should generate random hex", async () => {
		const { generateRandomHex } = await import("@/lib/crypto");
		const hex = generateRandomHex(16);
		expect(hex).toHaveLength(32);
		expect(hex).toMatch(/^([0-9a-f]{2})+$/);
	});

	it("should hash with salt", async () => {
		const { hashWithSalt } = await import("@/lib/crypto");
		const result = await hashWithSalt("test-password");
		expect(result.hash).toBeDefined();
		expect(result.salt).toBeDefined();
		expect(result.hash).toHaveLength(64);
		expect(result.salt).toHaveLength(64);
	});
});
