import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

const knowledgeBindingPutSchema = z.object({
	workspaceId: z.uuid(),
	knowledgeBaseIds: z.array(z.uuid()),
});

describe("knowledge bindings", () => {
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

	it("validates knowledge binding update payloads", () => {
		const workspaceId = crypto.randomUUID();
		const knowledgeBaseId = crypto.randomUUID();

		expect(
			knowledgeBindingPutSchema.safeParse({
				workspaceId,
				knowledgeBaseIds: [knowledgeBaseId],
			}).success,
		).toBe(true);

		expect(
			knowledgeBindingPutSchema.safeParse({
				workspaceId,
				knowledgeBaseIds: ["not-a-uuid"],
			}).success,
		).toBe(false);
	});

	it("cloneKnowledgeBindings no-ops without a source version", async () => {
		const { cloneKnowledgeBindings } = await import(
			"@/modules/knowledge/use-cases"
		);
		await expect(
			cloneKnowledgeBindings(null, crypto.randomUUID()),
		).resolves.toBeUndefined();
	});
});
