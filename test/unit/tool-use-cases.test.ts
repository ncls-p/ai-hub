import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────

vi.mock("@/lib/crypto", () => ({
	encryptValue: vi.fn().mockResolvedValue('{"ct":"enc","iv":"iv","kid":"default"}'),
}));

vi.mock("@/server/domain/services/authorization", () => ({
	authorization: {
		requirePermission: vi.fn().mockResolvedValue({ granted: true }),
	},
}));

type SelectChain = {
	from: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
};

type InsertChain = {
	values: ReturnType<typeof vi.fn>;
	returning: ReturnType<typeof vi.fn>;
	onConflictDoNothing: ReturnType<typeof vi.fn>;
};

type DeleteChain = {
	where: ReturnType<typeof vi.fn>;
};

vi.mock("@/server/infrastructure/db", () => {
	const sc: SelectChain = {
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		limit: vi.fn().mockResolvedValue([]),
	};
	const ic: InsertChain = {
		values: vi.fn().mockReturnThis(),
		returning: vi.fn().mockResolvedValue([]),
		onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
	};
	const dc: DeleteChain = {
		where: vi.fn().mockResolvedValue(undefined),
	};
	return {
		db: {
			select: vi.fn().mockReturnValue(sc),
			insert: vi.fn().mockReturnValue(ic),
			delete: vi.fn().mockReturnValue(dc),
		},
		_sc: sc,
		_ic: ic,
		_dc: dc,
	};
});

declare module "@/server/infrastructure/db" {
	export const _sc: SelectChain;
	export const _ic: InsertChain;
	export const _dc: DeleteChain;
}

import * as dbModule from "@/server/infrastructure/db";
import { authorization } from "@/server/domain/services/authorization";
import {
	canExecuteRestrictedTool,
	cloneToolBindings,
	getAgentVersionToolContext,
	getCustomBindingContext,
	getMcpBindingContext,
	getToolBindingsForVersion,
	insertToolBindingsForVersion,
	logToolInvocation,
	replaceToolBindingsForVersion,
	toolBindingInputSchema,
} from "@/modules/tool/use-cases";

function reset() {
	dbModule._sc.from.mockReset().mockReturnThis();
	dbModule._sc.where.mockReset().mockReturnThis();
	dbModule._sc.limit.mockReset().mockResolvedValue([]);
	dbModule._ic.values.mockReset().mockReturnThis();
	dbModule._ic.returning.mockReset().mockResolvedValue([]);
	dbModule._ic.onConflictDoNothing.mockReset().mockResolvedValue(undefined);
	dbModule._dc.where.mockReset().mockResolvedValue(undefined);
}

beforeEach(() => {
	vi.clearAllMocks();
	reset();
});

describe("toolBindingInputSchema", () => {
	it("validates builtin source", () => {
		expect(
			toolBindingInputSchema.safeParse({
				toolSource: "builtin",
				toolId: crypto.randomUUID(),
			}).success,
		).toBe(true);
	});

	it("validates mcp source with serverId", () => {
		expect(
			toolBindingInputSchema.safeParse({
				toolSource: "mcp",
				toolId: crypto.randomUUID(),
				mcpServerId: crypto.randomUUID(),
			}).success,
		).toBe(true);
	});

	it("rejects mcp source without serverId", () => {
		expect(
			toolBindingInputSchema.safeParse({
				toolSource: "mcp",
				toolId: crypto.randomUUID(),
			}).success,
		).toBe(false);
	});

	it("validates custom source", () => {
		expect(
			toolBindingInputSchema.safeParse({
				toolSource: "custom",
				toolId: crypto.randomUUID(),
			}).success,
		).toBe(true);
	});

	it("rejects invalid toolSource", () => {
		expect(
			toolBindingInputSchema.safeParse({
				toolSource: "unknown",
				toolId: crypto.randomUUID(),
			}).success,
		).toBe(false);
	});
});

describe("getToolBindingsForVersion", () => {
	it("queries bindings for a version", async () => {
		const mockBindings = [
			{ toolSource: "builtin", toolId: "tool-1", agentVersionId: "v1" },
		];
		dbModule._sc.where.mockResolvedValueOnce(mockBindings);

		const result = await getToolBindingsForVersion("v1");
		expect(result).toEqual(mockBindings);
	});

	it("returns empty array when no bindings", async () => {
		dbModule._sc.where.mockResolvedValueOnce([]);

		const result = await getToolBindingsForVersion("v1");
		expect(result).toEqual([]);
	});
});

describe("insertToolBindingsForVersion", () => {
	it("is a no-op for empty bindings array", async () => {
		await insertToolBindingsForVersion("v1", []);

		expect(dbModule.db.insert).not.toHaveBeenCalled();
		expect(dbModule.db.select).not.toHaveBeenCalled();
	});

	it("throws when custom tool not found", async () => {
		dbModule._sc.limit.mockResolvedValueOnce([]);

		await expect(
			insertToolBindingsForVersion("v1", [
				{ toolSource: "custom", toolId: crypto.randomUUID() },
			]),
		).rejects.toThrow("Custom tool not found");
	});

	it("throws when mcp tool not found", async () => {
		dbModule._sc.limit.mockResolvedValueOnce([]);

		await expect(
			insertToolBindingsForVersion("v1", [
				{
					toolSource: "mcp",
					toolId: crypto.randomUUID(),
					mcpServerId: crypto.randomUUID(),
				},
			]),
		).rejects.toThrow("MCP tool not found");
	});

	it("throws when builtin tool not found", async () => {
		await expect(
			insertToolBindingsForVersion("v1", [
				{ toolSource: "builtin", toolId: "nonexistent-tool-id" },
			]),
		).rejects.toThrow("Tool not found");
	});

	it("inserts builtin tool binding", async () => {
		// Use a real builtin tool ID from the catalog
		const CALCULATOR_ID = "00000000-0000-4000-8000-000000000001";
		await insertToolBindingsForVersion("v1", [
			{ toolSource: "builtin", toolId: CALCULATOR_ID },
		]);

		expect(dbModule.db.insert).toHaveBeenCalled();
		expect(dbModule._ic.onConflictDoNothing).toHaveBeenCalled();
	});
});

describe("replaceToolBindingsForVersion", () => {
	it("deletes existing bindings then inserts new ones", async () => {
		const CALCULATOR_ID = "00000000-0000-4000-8000-000000000001";
		await replaceToolBindingsForVersion("v1", [
			{ toolSource: "builtin", toolId: CALCULATOR_ID },
		]);

		expect(dbModule.db.delete).toHaveBeenCalled();
		expect(dbModule.db.insert).toHaveBeenCalled();
	});

	it("deletes existing bindings with empty new bindings", async () => {
		await replaceToolBindingsForVersion("v1", []);

		expect(dbModule.db.delete).toHaveBeenCalled();
		expect(dbModule.db.insert).not.toHaveBeenCalled();
	});
});

describe("cloneToolBindings", () => {
	it("is a no-op when fromAgentVersionId is null", async () => {
		await cloneToolBindings(null, "v2");

		expect(dbModule.db.select).not.toHaveBeenCalled();
	});

	it("skips mcp bindings where tool not found", async () => {
		// Get existing bindings: one mcp
		dbModule._sc.where.mockResolvedValueOnce([
			{ toolSource: "mcp", toolId: "mcp-tool-1", requireApproval: false },
		]);
		// Tool lookup returns empty
		dbModule._sc.limit.mockResolvedValueOnce([]);

		await cloneToolBindings("v1", "v2");

		// No bindings inserted because the mcp tool lookup failed
		expect(dbModule.db.insert).not.toHaveBeenCalled();
	});

	it("clones builtin bindings", async () => {
		const CALCULATOR_ID = "00000000-0000-4000-8000-000000000001";
		dbModule._sc.where.mockResolvedValueOnce([
			{ toolSource: "builtin", toolId: CALCULATOR_ID, requireApproval: false },
		]);

		await cloneToolBindings("v1", "v2");

		expect(dbModule.db.insert).toHaveBeenCalled();
	});
});

describe("logToolInvocation", () => {
	it("inserts a tool invocation with encrypted input", async () => {
		const invocationRow = {
			id: "inv-1",
			workspaceId: "ws-1",
			toolName: "calculator",
			status: "success",
		};
		dbModule._ic.returning.mockResolvedValueOnce([invocationRow]);

		const result = await logToolInvocation({
			workspaceId: "ws-1",
			toolSource: "builtin",
			toolId: "tool-1",
			toolName: "calculator",
			input: { expression: "1+1" },
			output: { result: 2 },
			status: "success",
			latencyMs: 10,
		});

		expect(result).toEqual(invocationRow);
		expect(dbModule.db.insert).toHaveBeenCalled();
	});

	it("handles missing optional fields", async () => {
		dbModule._ic.returning.mockResolvedValueOnce([{ id: "inv-2", status: "failed" }]);

		const result = await logToolInvocation({
			workspaceId: "ws-1",
			toolSource: "builtin",
			toolId: "tool-1",
			toolName: "web_search",
			input: {},
			status: "failed",
			errorMessage: "Search error",
		});

		expect(result.status).toBe("failed");
	});
});

describe("canExecuteRestrictedTool", () => {
	it("returns true when permission is granted", async () => {
		vi.mocked(authorization.requirePermission).mockResolvedValueOnce({
			granted: true,
		});

		const result = await canExecuteRestrictedTool("user-1", "ws-1");
		expect(result).toBe(true);
	});

	it("returns false when permission is denied", async () => {
		vi.mocked(authorization.requirePermission).mockResolvedValueOnce({
			granted: false,
			reason: "Missing permission",
		});

		const result = await canExecuteRestrictedTool("user-1", "ws-1");
		expect(result).toBe(false);
	});
});

describe("getAgentVersionToolContext", () => {
	it("throws when agent version not found", async () => {
		dbModule._sc.limit.mockResolvedValueOnce([]);

		await expect(getAgentVersionToolContext("v-nonexistent")).rejects.toThrow(
			"Agent version not found",
		);
	});

	it("returns version and bindings", async () => {
		// Q1: db.select({agentId}).from(agentVersions).where().limit(1) — .limit() terminal
		// Q2: db.select().from(agentToolBindings).where(and(...))        — .where() terminal
		// Q1's .where() must return chain so .limit() can be called
		dbModule._sc.where
			.mockReturnValueOnce(dbModule._sc)  // Q1: keep chain for limit
			.mockResolvedValueOnce([{ toolSource: "builtin", toolId: "tool-1" }]);  // Q2
		dbModule._sc.limit.mockResolvedValueOnce([{ agentId: "agent-1" }]);

		const result = await getAgentVersionToolContext("v1");
		expect(result.version.agentId).toBe("agent-1");
		expect(result.bindings).toHaveLength(1);
	});
});

describe("getCustomBindingContext", () => {
	it("returns null when binding not found", async () => {
		dbModule._sc.limit.mockResolvedValueOnce([]);

		const result = await getCustomBindingContext("v1", "tool-1", "user-1", "ws-1");
		expect(result).toBeNull();
	});

	it("returns null when tool not found", async () => {
		dbModule._sc.limit
			.mockResolvedValueOnce([{ toolSource: "custom", toolId: "tool-1" }])
			.mockResolvedValueOnce([]);

		const result = await getCustomBindingContext("v1", "tool-1", "user-1", "ws-1");
		expect(result).toBeNull();
	});

	it("returns binding and tool when both found", async () => {
		const binding = { toolSource: "custom", toolId: "tool-1" };
		const tool = { id: "tool-1", name: "My Tool" };
		dbModule._sc.limit
			.mockResolvedValueOnce([binding])
			.mockResolvedValueOnce([tool]);

		const result = await getCustomBindingContext("v1", "tool-1", "user-1", "ws-1");
		expect(result).not.toBeNull();
		expect(result?.binding).toEqual(binding);
		expect(result?.tool).toEqual(tool);
	});
});

describe("getMcpBindingContext", () => {
	it("returns null when binding not found", async () => {
		dbModule._sc.limit.mockResolvedValueOnce([]);

		const result = await getMcpBindingContext("v1", "tool-1");
		expect(result).toBeNull();
	});

	it("returns null when tool not found", async () => {
		dbModule._sc.limit
			.mockResolvedValueOnce([{ toolSource: "mcp", toolId: "tool-1" }])
			.mockResolvedValueOnce([]);

		const result = await getMcpBindingContext("v1", "tool-1");
		expect(result).toBeNull();
	});

	it("returns null when server not found", async () => {
		dbModule._sc.limit
			.mockResolvedValueOnce([{ toolSource: "mcp", toolId: "tool-1" }])
			.mockResolvedValueOnce([{ id: "tool-1", mcpServerId: "srv-1" }])
			.mockResolvedValueOnce([]);

		const result = await getMcpBindingContext("v1", "tool-1");
		expect(result).toBeNull();
	});

	it("returns binding, tool and server when all found", async () => {
		const binding = { toolSource: "mcp", toolId: "tool-1" };
		const tool = { id: "tool-1", mcpServerId: "srv-1" };
		const server = { id: "srv-1", name: "My Server" };
		dbModule._sc.limit
			.mockResolvedValueOnce([binding])
			.mockResolvedValueOnce([tool])
			.mockResolvedValueOnce([server]);

		const result = await getMcpBindingContext("v1", "tool-1");
		expect(result?.server).toEqual(server);
	});
});
