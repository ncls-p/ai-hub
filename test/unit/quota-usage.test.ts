import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── DB mock ────────────────────────────────────────────────────────────

type SelectChain = {
	from: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
};

vi.mock("@/server/infrastructure/db", () => {
	const selectChain: SelectChain = {
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockResolvedValue([{ total: 0 }]),
	};
	return {
		db: {
			select: vi.fn().mockReturnValue(selectChain),
		},
		_selectChain: selectChain,
	};
});

declare module "@/server/infrastructure/db" {
	export const _selectChain: SelectChain;
}

import * as dbModule from "@/server/infrastructure/db";
import {
	assertWorkspaceWithinTokenQuota,
	getWorkspaceMonthlyTokenUsage,
} from "@/modules/usage/quota";

beforeEach(() => {
	vi.clearAllMocks();
	dbModule._selectChain.from.mockReturnThis();
	dbModule._selectChain.where.mockResolvedValue([{ total: 0 }]);
	delete process.env.WORKSPACE_MONTHLY_TOKEN_LIMIT;
});

afterEach(() => {
	delete process.env.WORKSPACE_MONTHLY_TOKEN_LIMIT;
});

describe("getWorkspaceMonthlyTokenUsage", () => {
	it("returns 0 when no usage events exist", async () => {
		dbModule._selectChain.where.mockResolvedValueOnce([{ total: 0 }]);

		const usage = await getWorkspaceMonthlyTokenUsage("ws-1");

		expect(usage).toBe(0);
		expect(dbModule.db.select).toHaveBeenCalledOnce();
	});

	it("sums token counts from usage events", async () => {
		dbModule._selectChain.where.mockResolvedValueOnce([{ total: 42500 }]);

		const usage = await getWorkspaceMonthlyTokenUsage("ws-1");

		expect(usage).toBe(42500);
	});

	it("returns 0 when result set is empty", async () => {
		dbModule._selectChain.where.mockResolvedValueOnce([]);

		const usage = await getWorkspaceMonthlyTokenUsage("ws-1");

		expect(usage).toBe(0);
	});

	it("handles null total from coalesce", async () => {
		dbModule._selectChain.where.mockResolvedValueOnce([{ total: null }]);

		const usage = await getWorkspaceMonthlyTokenUsage("ws-1");

		expect(usage).toBe(0);
	});
});

describe("assertWorkspaceWithinTokenQuota", () => {
	it("allows when no limit is configured", async () => {
		const result = await assertWorkspaceWithinTokenQuota("ws-1");

		expect(result).toEqual({ allowed: true });
		expect(dbModule.db.select).not.toHaveBeenCalled();
	});

	it("allows when usage is below the limit", async () => {
		process.env.WORKSPACE_MONTHLY_TOKEN_LIMIT = "1000000";
		dbModule._selectChain.where.mockResolvedValueOnce([{ total: 500000 }]);

		const result = await assertWorkspaceWithinTokenQuota("ws-1");

		expect(result).toMatchObject({
			allowed: true,
			used: 500000,
			limit: 1000000,
		});
	});

	it("denies when usage meets the limit", async () => {
		process.env.WORKSPACE_MONTHLY_TOKEN_LIMIT = "1000000";
		dbModule._selectChain.where.mockResolvedValueOnce([{ total: 1000000 }]);

		const result = await assertWorkspaceWithinTokenQuota("ws-1");

		expect(result).toMatchObject({
			allowed: false,
			used: 1000000,
			limit: 1000000,
		});
		expect((result as { message: string }).message).toContain(
			"Monthly token limit reached",
		);
	});

	it("denies when usage exceeds the limit", async () => {
		process.env.WORKSPACE_MONTHLY_TOKEN_LIMIT = "500000";
		dbModule._selectChain.where.mockResolvedValueOnce([{ total: 600000 }]);

		const result = await assertWorkspaceWithinTokenQuota("ws-1");

		expect(result).toMatchObject({ allowed: false });
	});

	it("includes used and limit values in the denial message", async () => {
		process.env.WORKSPACE_MONTHLY_TOKEN_LIMIT = "100000";
		dbModule._selectChain.where.mockResolvedValueOnce([{ total: 150000 }]);

		const result = (await assertWorkspaceWithinTokenQuota("ws-1")) as {
			allowed: false;
			message: string;
		};

		expect(result.message).toContain("150,000");
		expect(result.message).toContain("100,000");
	});
});
