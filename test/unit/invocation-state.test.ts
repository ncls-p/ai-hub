import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── DB mock ────────────────────────────────────────────────────────────

type SelectChain = {
	from: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
};

type UpdateChain = {
	set: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
};

type DbMock = {
	select: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
};

type DbModule = {
	db: DbMock;
	_selectChain: SelectChain;
	_updateChain: UpdateChain;
};

vi.mock("@/server/infrastructure/db", () => {
	const selectChain: SelectChain = {
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		limit: vi.fn().mockResolvedValue([]),
	};
	const updateChain: UpdateChain = {
		set: vi.fn().mockReturnThis(),
		where: vi.fn().mockResolvedValue(undefined),
	};
	return {
		db: {
			select: vi.fn(),
			update: vi.fn(),
		},
		_selectChain: selectChain,
		_updateChain: updateChain,
	};
});

vi.mock("@/lib/crypto", () => ({
	decryptValue: vi.fn(),
}));

import * as _dbModule from "@/server/infrastructure/db";
const dbModule = _dbModule as unknown as DbModule;
import { decryptValue } from "@/lib/crypto";
import { waitForApproval } from "@/modules/tool/invocation-state";

const mockDecrypt = vi.mocked(decryptValue);

function resetChains(sc = dbModule._selectChain, uc = dbModule._updateChain) {
	sc.from.mockReset().mockReturnThis();
	sc.where.mockReset().mockReturnThis();
	sc.limit.mockReset().mockResolvedValue([]);
	uc.set.mockReset().mockReturnThis();
	uc.where.mockReset().mockResolvedValue(undefined);
}

beforeEach(() => {
	vi.useFakeTimers();
	resetChains();
	vi.clearAllMocks();
	dbModule.db.select.mockReturnValue(dbModule._selectChain);
	dbModule.db.update.mockReturnValue(dbModule._updateChain);
	dbModule._selectChain.from.mockReturnThis();
	dbModule._selectChain.where.mockReturnThis();
	dbModule._selectChain.limit.mockResolvedValue([]);
	dbModule._updateChain.set.mockReturnThis();
	dbModule._updateChain.where.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.useRealTimers();
});

describe("waitForApproval", () => {
	it("returns failed when invocation record disappears", async () => {
		dbModule._selectChain.limit.mockResolvedValueOnce([]);

		const promise = waitForApproval("inv-1", {
			maxWaitMs: 5000,
			pollIntervalMs: 100,
		});

		await vi.advanceTimersByTimeAsync(100);

		const result = await promise;
		expect(result).toEqual({
			status: "failed",
			error: "Invocation record disappeared",
		});
	});

	it("returns success when status changes to success", async () => {
		mockDecrypt.mockResolvedValueOnce('{"result":"ok"}');
		dbModule._selectChain.limit.mockResolvedValueOnce([
			{
				id: "inv-1",
				status: "success",
				outputJsonEncrypted: "encrypted-payload",
				errorMessage: null,
			},
		]);

		const promise = waitForApproval("inv-1", {
			maxWaitMs: 5000,
			pollIntervalMs: 100,
		});

		await vi.advanceTimersByTimeAsync(100);

		const result = await promise;
		expect(result).toEqual({ status: "success", output: { result: "ok" } });
	});

	it("returns failed when decrypt throws", async () => {
		mockDecrypt.mockRejectedValueOnce(new Error("bad key"));
		dbModule._selectChain.limit.mockResolvedValueOnce([
			{
				id: "inv-1",
				status: "success",
				outputJsonEncrypted: "bad-data",
				errorMessage: null,
			},
		]);

		const promise = waitForApproval("inv-1", {
			maxWaitMs: 5000,
			pollIntervalMs: 100,
		});

		await vi.advanceTimersByTimeAsync(100);

		const result = await promise;
		expect(result).toEqual({
			status: "failed",
			error: "Failed to decrypt tool output",
		});
	});

	it("returns failed when status is failed", async () => {
		dbModule._selectChain.limit.mockResolvedValueOnce([
			{
				id: "inv-1",
				status: "failed",
				outputJsonEncrypted: null,
				errorMessage: "Tool crashed",
			},
		]);

		const promise = waitForApproval("inv-1", {
			maxWaitMs: 5000,
			pollIntervalMs: 100,
		});

		await vi.advanceTimersByTimeAsync(100);

		const result = await promise;
		expect(result).toEqual({ status: "failed", error: "Tool crashed" });
	});

	it("uses default error message when errorMessage is null for failed", async () => {
		dbModule._selectChain.limit.mockResolvedValueOnce([
			{
				id: "inv-1",
				status: "failed",
				outputJsonEncrypted: null,
				errorMessage: null,
			},
		]);

		const promise = waitForApproval("inv-1", {
			maxWaitMs: 5000,
			pollIntervalMs: 100,
		});

		await vi.advanceTimersByTimeAsync(100);

		const result = await promise;
		expect(result).toEqual({
			status: "failed",
			error: "Tool execution failed",
		});
	});

	it("returns rejected when status is rejected", async () => {
		dbModule._selectChain.limit.mockResolvedValueOnce([
			{
				id: "inv-1",
				status: "rejected",
				outputJsonEncrypted: null,
				errorMessage: "User denied",
			},
		]);

		const promise = waitForApproval("inv-1", {
			maxWaitMs: 5000,
			pollIntervalMs: 100,
		});

		await vi.advanceTimersByTimeAsync(100);

		const result = await promise;
		expect(result).toEqual({ status: "rejected", error: "User denied" });
	});

	it("uses default message when rejected without errorMessage", async () => {
		dbModule._selectChain.limit.mockResolvedValueOnce([
			{
				id: "inv-1",
				status: "rejected",
				outputJsonEncrypted: null,
				errorMessage: null,
			},
		]);

		const promise = waitForApproval("inv-1", {
			maxWaitMs: 5000,
			pollIntervalMs: 100,
		});

		await vi.advanceTimersByTimeAsync(100);

		const result = await promise;
		expect(result).toEqual({
			status: "rejected",
			error: "Tool invocation was rejected by user",
		});
	});

	it("times out and marks invocation as failed", async () => {
		// Always return awaiting_approval to force a timeout
		dbModule._selectChain.limit.mockResolvedValue([
			{
				id: "inv-1",
				status: "awaiting_approval",
				outputJsonEncrypted: null,
				errorMessage: null,
			},
		]);

		const promise = waitForApproval("inv-1", {
			maxWaitMs: 500,
			pollIntervalMs: 100,
		});

		// Advance past the deadline
		await vi.advanceTimersByTimeAsync(600);

		const result = await promise;
		expect(result).toEqual({ status: "failed", error: "Approval timed out" });
		expect(dbModule.db.update).toHaveBeenCalled();
	});
});
