import { beforeEach, describe, expect, it } from "vitest";

describe("RAG keyword scoring", () => {
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

	it("scores content by matching query terms", async () => {
		const { scoreContent } = await import("@/modules/knowledge/use-cases");
		expect(scoreContent("The capital of France is Paris.", "capital France")).toBe(
			2,
		);
		expect(scoreContent("Nothing relevant here.", "capital France")).toBe(0);
	});

	it("is case insensitive", async () => {
		const { scoreContent } = await import("@/modules/knowledge/use-cases");
		expect(scoreContent("PARIS is nice", "paris")).toBe(1);
	});
});
