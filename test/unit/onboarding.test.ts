import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────

type SelectChain = {
	from: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
};

type InsertChain = {
	values: ReturnType<typeof vi.fn>;
	onConflictDoUpdate: ReturnType<typeof vi.fn>;
};

vi.mock("@/server/infrastructure/db", () => {
	const sc: SelectChain = {
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		limit: vi.fn().mockResolvedValue([]),
	};
	const ic: InsertChain = {
		values: vi.fn().mockReturnThis(),
		onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
	};
	return {
		db: {
			select: vi.fn().mockReturnValue(sc),
			insert: vi.fn().mockReturnValue(ic),
		},
		_sc: sc,
		_ic: ic,
	};
});

declare module "@/server/infrastructure/db" {
	export const _sc: SelectChain;
	export const _ic: InsertChain;
}

import * as dbModule from "@/server/infrastructure/db";
import {
	isOnboardingComplete,
	markOnboardingComplete,
} from "@/modules/onboarding/use-cases";

beforeEach(() => {
	vi.clearAllMocks();
	dbModule._sc.from.mockReturnThis();
	dbModule._sc.where.mockReturnThis();
	dbModule._sc.limit.mockResolvedValue([]);
	dbModule._ic.values.mockReturnThis();
	dbModule._ic.onConflictDoUpdate.mockResolvedValue(undefined);
});

describe("isOnboardingComplete", () => {
	it("returns false when no setting exists", async () => {
		dbModule._sc.limit.mockResolvedValueOnce([]);

		const result = await isOnboardingComplete("user-1");
		expect(result).toBeFalsy();
	});

	it("returns false when setting has no completed flag", async () => {
		dbModule._sc.limit.mockResolvedValueOnce([{ valueJson: {} }]);

		const result = await isOnboardingComplete("user-1");
		expect(result).toBeFalsy();
	});

	it("returns false when completed is false", async () => {
		dbModule._sc.limit.mockResolvedValueOnce([
			{ valueJson: { completed: false } },
		]);

		const result = await isOnboardingComplete("user-1");
		expect(result).toBeFalsy();
	});

	it("returns true when completed is true", async () => {
		dbModule._sc.limit.mockResolvedValueOnce([
			{ valueJson: { completed: true } },
		]);

		const result = await isOnboardingComplete("user-1");
		expect(result).toBeTruthy();
	});

	it("returns false when valueJson is not an object", async () => {
		dbModule._sc.limit.mockResolvedValueOnce([{ valueJson: "invalid" }]);

		const result = await isOnboardingComplete("user-1");
		expect(result).toBeFalsy();
	});

	it("returns false when valueJson is null", async () => {
		dbModule._sc.limit.mockResolvedValueOnce([{ valueJson: null }]);

		const result = await isOnboardingComplete("user-1");
		expect(result).toBeFalsy();
	});
});

describe("markOnboardingComplete", () => {
	it("inserts or updates onboarding setting", async () => {
		await markOnboardingComplete("user-1");

		expect(dbModule.db.insert).toHaveBeenCalledOnce();
		expect(dbModule._ic.values).toHaveBeenCalledOnce();
		expect(dbModule._ic.onConflictDoUpdate).toHaveBeenCalledOnce();

		const insertValues = dbModule._ic.values.mock.calls[0][0];
		expect(insertValues.key).toContain("user-1");
		expect(insertValues.valueJson).toMatchObject({ completed: true });
	});

	it("uses the userId in the setting key", async () => {
		await markOnboardingComplete("specific-user-id");

		const insertValues = dbModule._ic.values.mock.calls[0][0];
		expect(insertValues.key).toContain("specific-user-id");
	});
});
