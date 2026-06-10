import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
	auth: {
		api: {
			createUser: vi.fn(),
		},
	},
}));

type SelectChain = {
	from: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
	orderBy: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
	then: ReturnType<typeof vi.fn>;
};

type UpdateChain = {
	set: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
	returning: ReturnType<typeof vi.fn>;
};

type InsertChain = {
	values: ReturnType<typeof vi.fn>;
	onConflictDoUpdate: ReturnType<typeof vi.fn>;
};

vi.mock("@/server/infrastructure/db", () => {
	const sc: SelectChain = {
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		orderBy: vi.fn().mockReturnThis(),
		limit: vi.fn().mockResolvedValue([]),
		then: vi.fn(),
	};
	const uc: UpdateChain = {
		set: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		returning: vi.fn().mockResolvedValue([]),
	};
	const ic: InsertChain = {
		values: vi.fn().mockReturnThis(),
		onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
	};
	return {
		db: {
			select: vi.fn().mockReturnValue(sc),
			update: vi.fn().mockReturnValue(uc),
			insert: vi.fn().mockReturnValue(ic),
		},
		_sc: sc,
		_uc: uc,
		_ic: ic,
	};
});

declare module "@/server/infrastructure/db" {
	export const _sc: SelectChain;
	export const _uc: UpdateChain;
	export const _ic: InsertChain;
}

import * as dbModule from "@/server/infrastructure/db";

import {
	ensureBootstrapAdmin,
	getRegistrationSetting,
	isAdminRole,
	listAdminUsers,
	setRegistrationEnabled,
	updateManagedUser,
} from "@/modules/admin/use-cases";

function reset() {
	// Use mockReset() before setting defaults to clear any unconsumed once-queues
	dbModule._sc.from.mockReset().mockReturnThis();
	dbModule._sc.where.mockReset().mockReturnThis();
	dbModule._sc.orderBy.mockReset().mockReturnThis();
	dbModule._sc.limit.mockReset().mockResolvedValue([]);
	dbModule._uc.set.mockReset().mockReturnThis();
	dbModule._uc.where.mockReset().mockReturnThis();
	dbModule._uc.returning.mockReset().mockResolvedValue([]);
	dbModule._ic.values.mockReset().mockReturnThis();
	dbModule._ic.onConflictDoUpdate.mockReset().mockResolvedValue(undefined);
}

beforeEach(() => {
	vi.clearAllMocks();
	reset();
});

describe("isAdminRole", () => {
	it("returns true for 'admin'", () => {
		expect(isAdminRole("admin")).toBe(true);
	});

	it("returns false for 'user'", () => {
		expect(isAdminRole("user")).toBe(false);
	});

	it("returns false for null", () => {
		expect(isAdminRole(null)).toBe(false);
	});

	it("returns false for undefined", () => {
		expect(isAdminRole(undefined)).toBe(false);
	});
});

describe("ensureBootstrapAdmin", () => {
	it("returns null when admin already exists", async () => {
		dbModule._sc.where.mockResolvedValueOnce([{ value: 1 }]);

		const result = await ensureBootstrapAdmin();
		expect(result).toBeNull();
	});

	it("returns null when no users exist", async () => {
		// admin count = 0
		dbModule._sc.where.mockResolvedValueOnce([{ value: 0 }]);
		// first user query = empty
		dbModule._sc.limit.mockResolvedValueOnce([]);

		const result = await ensureBootstrapAdmin();
		expect(result).toBeNull();
	});

	it("promotes first user when no admin exists", async () => {
		// admin count = 0
		dbModule._sc.where.mockResolvedValueOnce([{ value: 0 }]);
		// first user
		dbModule._sc.limit.mockResolvedValueOnce([{ id: "user-1" }]);

		const result = await ensureBootstrapAdmin();
		expect(result).toBe("user-1");
		expect(dbModule.db.update).toHaveBeenCalled();
	});
});

describe("getRegistrationSetting", () => {
	// getRegistrationSetting makes two queries:
	// Q1: db.select({valueJson}).from(appSettings).where(...).limit(1) -- .limit() terminal
	// Q2: db.select({value: count()}).from(users)                      -- .from() terminal

	it("returns enabled=true and userCount when no setting", async () => {
		dbModule._sc.limit.mockResolvedValueOnce([]);
		// Q2: second .from() call resolves directly
		dbModule._sc.from
			.mockReturnValueOnce(dbModule._sc)
			.mockResolvedValueOnce([{ value: 5 }]);

		const result = await getRegistrationSetting();
		expect(result.registrationEnabled).toBe(true);
		expect(result.userCount).toBe(5);
		expect(result.canPublicSignUp).toBe(true);
	});

	it("returns disabled registration when setting says so", async () => {
		dbModule._sc.limit.mockResolvedValueOnce([{ valueJson: { enabled: false } }]);
		dbModule._sc.from
			.mockReturnValueOnce(dbModule._sc)
			.mockResolvedValueOnce([{ value: 3 }]);

		const result = await getRegistrationSetting();
		expect(result.registrationEnabled).toBe(false);
		expect(result.canPublicSignUp).toBe(false);
	});

	it("canPublicSignUp is true when user count is 0 even if disabled", async () => {
		dbModule._sc.limit.mockResolvedValueOnce([{ valueJson: { enabled: false } }]);
		dbModule._sc.from
			.mockReturnValueOnce(dbModule._sc)
			.mockResolvedValueOnce([{ value: 0 }]);

		const result = await getRegistrationSetting();
		expect(result.canPublicSignUp).toBe(true);
	});
});

describe("setRegistrationEnabled", () => {
	it("upserts the registration setting", async () => {
		// setRegistrationEnabled calls getRegistrationSetting afterwards
		dbModule._sc.limit.mockResolvedValueOnce([{ valueJson: { enabled: true } }]);
		dbModule._sc.from
			.mockReturnValueOnce(dbModule._sc)
			.mockResolvedValueOnce([{ value: 2 }]);

		const result = await setRegistrationEnabled(true, "user-1");
		expect(dbModule.db.insert).toHaveBeenCalled();
		expect(result.registrationEnabled).toBe(true);
	});
});

describe("listAdminUsers", () => {
	it("returns list of users with default role", async () => {
		const users = [
			{
				id: "u1",
				name: "Alice",
				email: "alice@example.com",
				role: null,
				banned: false,
				banReason: null,
				createdAt: new Date(),
			},
		];
		// listAdminUsers uses .then() since it chains directly
		dbModule._sc.orderBy.mockResolvedValueOnce(users);

		const result = await listAdminUsers();
		expect(result).toHaveLength(1);
		expect(result[0].role).toBe("user");
	});
});

describe("updateManagedUser", () => {
	const targetUser = {
		id: "user-2",
		name: "Bob",
		email: "bob@example.com",
		role: "user",
		banned: false,
		banReason: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	it("throws when user not found", async () => {
		dbModule._sc.limit.mockResolvedValueOnce([]);

		await expect(
			updateManagedUser({
				actorUserId: "admin-1",
				userId: "nonexistent",
			}),
		).rejects.toThrow("User not found");
	});

	it("throws when actor tries to remove own admin access", async () => {
		dbModule._sc.limit.mockResolvedValueOnce([
			{ ...targetUser, id: "admin-1", role: "admin" },
		]);

		await expect(
			updateManagedUser({
				actorUserId: "admin-1",
				userId: "admin-1",
				role: "user",
			}),
		).rejects.toThrow("cannot remove your own admin access");
	});

	it("throws when actor tries to suspend own account", async () => {
		dbModule._sc.limit.mockResolvedValueOnce([
			{ ...targetUser, id: "admin-1", role: "admin" },
		]);

		await expect(
			updateManagedUser({
				actorUserId: "admin-1",
				userId: "admin-1",
				banned: true,
			}),
		).rejects.toThrow("cannot suspend your own account");
	});

	it("throws when demoting last active admin", async () => {
		// updateManagedUser makes two select queries:
		// Q1: db.select().from(users).where(...).limit(1) — .limit() terminal
		// Q2 (getActiveAdminCount): db.select({value:count()}).from(users).where(and(...)) — .where() terminal
		// Q1's .where() must return chain so .limit() can be called
		dbModule._sc.where
			.mockReturnValueOnce(dbModule._sc)  // Q1: keep chain for limit
			.mockResolvedValueOnce([{ value: 0 }]);  // Q2: getActiveAdminCount → 0 remaining admins
		dbModule._sc.limit.mockResolvedValueOnce([
			{ ...targetUser, id: "user-2", role: "admin", banned: false },
		]);

		await expect(
			updateManagedUser({
				actorUserId: "admin-1",
				userId: "user-2",
				role: "user",
			}),
		).rejects.toThrow("At least one active admin is required");
	});

	it("updates user role when valid", async () => {
		dbModule._sc.limit.mockResolvedValueOnce([targetUser]);
		dbModule._uc.returning.mockResolvedValueOnce([
			{ ...targetUser, role: "admin" },
		]);

		const result = await updateManagedUser({
			actorUserId: "admin-1",
			userId: "user-2",
			role: "admin",
		});
		expect(result.role).toBe("admin");
	});

	it("sets ban reason when banning", async () => {
		dbModule._sc.limit.mockResolvedValueOnce([targetUser]);
		dbModule._uc.returning.mockResolvedValueOnce([
			{ ...targetUser, banned: true, banReason: "Violated policy" },
		]);

		const result = await updateManagedUser({
			actorUserId: "admin-1",
			userId: "user-2",
			banned: true,
			banReason: "Violated policy",
		});
		expect(result.banned).toBe(true);
	});
});
