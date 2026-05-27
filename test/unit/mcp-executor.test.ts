import { describe, expect, it } from "vitest";
import { z } from "zod";

const mcpExecuteInputSchema = z.object({
	serverId: z.uuid(),
	toolId: z.uuid(),
	workspaceId: z.uuid(),
	toolInput: z.unknown().optional(),
});

describe("MCP executor input", () => {
	it("validates executeMcpTool payloads", () => {
		expect(
			mcpExecuteInputSchema.safeParse({
				serverId: crypto.randomUUID(),
				toolId: crypto.randomUUID(),
				workspaceId: crypto.randomUUID(),
				toolInput: { query: "test" },
			}).success,
		).toBe(true);
	});

	it("rejects invalid UUIDs", () => {
		expect(
			mcpExecuteInputSchema.safeParse({
				serverId: "bad",
				toolId: crypto.randomUUID(),
				workspaceId: crypto.randomUUID(),
			}).success,
		).toBe(false);
	});
});
