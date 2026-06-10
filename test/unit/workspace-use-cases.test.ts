import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────

vi.mock("@/server/domain/services/audit", () => ({
	audit: { emit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/server/domain/services/authorization", () => ({
	authorization: {
		invalidatePermissionCache: vi.fn().mockResolvedValue(undefined),
	},
}));

vi.mock("@/lib/logger", () => ({
	logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const CHAIN_KEYS = [
	"select",
	"insert",
	"update",
	"delete",
	"from",
	"where",
	"innerJoin",
	"orderBy",
	"values",
	"set",
	"onConflictDoNothing",
] as const;

type ChainFn = ReturnType<typeof vi.fn>;

type ChainMock = {
	[K in (typeof CHAIN_KEYS)[number]]: ChainFn;
} & {
	limit: ChainFn;
	returning: ChainFn;
};

type DbMock = {
	select: ChainFn;
	insert: ChainFn;
	update: ChainFn;
	delete: ChainFn;
	transaction: ChainFn;
};

type DbModule = {
	db: DbMock;
	_chain: ChainMock;
	_tx: ChainMock;
};

// vi.mock is hoisted — the factory must be self-contained (no external refs).
vi.mock("@/server/infrastructure/db", () => {
	const buildChain = (): ChainMock => {
		const c = {} as Record<string, ChainFn>;
		const keys = [
			"select",
			"insert",
			"update",
			"delete",
			"from",
			"where",
			"innerJoin",
			"orderBy",
			"values",
			"set",
			"onConflictDoNothing",
		] as const;
		for (const k of keys) {
			c[k] = vi.fn().mockReturnThis();
		}
		c.limit = vi.fn().mockResolvedValue([]);
		c.returning = vi.fn().mockResolvedValue([]);
		return c as ChainMock;
	};

	const chain = buildChain();
	const tx = buildChain();
	const db: DbMock = {
		select: vi.fn(),
		insert: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
		transaction: vi.fn(),
	};
	return { db, _chain: chain, _tx: tx };
});

import * as _dbModule from "@/server/infrastructure/db";
const dbModule = _dbModule as unknown as DbModule;

import {
	addWorkspaceMember,
	countWorkspaces,
	createWorkspace,
	findUserByEmail,
	getWorkspaceBySlug,
	getWorkspacesByUserId,
	listWorkspaceMembers,
	removeWorkspaceMember,
	updateWorkspaceMemberRole,
} from "@/modules/workspace/use-cases";

function resetChain(chain: ChainMock) {
	for (const k of CHAIN_KEYS) {
		chain[k].mockReset().mockReturnThis();
	}
	chain.limit.mockReset().mockResolvedValue([]);
	chain.returning.mockReset().mockResolvedValue([]);
}

function reset() {
	resetChain(dbModule._chain);
	resetChain(dbModule._tx);
}

beforeEach(() => {
	vi.clearAllMocks();
	reset();
	dbModule.db.select.mockReturnValue(dbModule._chain);
	dbModule.db.insert.mockReturnValue(dbModule._chain);
	dbModule.db.update.mockReturnValue(dbModule._chain);
	dbModule.db.delete.mockReturnValue(dbModule._chain);
	dbModule.db.transaction.mockImplementation(
		(cb: (tx: ChainMock) => Promise<unknown>) => cb(dbModule._tx),
	);
});

// ─── Fixtures ────────────────────────────────────────────────────────

const fakeWorkspace = {
	id: "ws-1",
	organizationId: "org-1",
	name: "My Workspace",
	slug: "my-ws",
	createdById: "user-1",
	createdAt: new Date(),
	updatedAt: new Date(),
	archivedAt: null,
};

const fakeMember = {
	id: "member-1",
	workspaceId: "ws-1",
	userId: "user-2",
	status: "active",
	createdAt: new Date(),
	updatedAt: new Date(),
};

const fakeRole = {
	id: "role-1",
	name: "workspace.member",
	scopeType: "workspace",
	isSystem: true,
	permissionsJson: [],
};

// ─── Tests ───────────────────────────────────────────────────────────

describe("getWorkspaceBySlug", () => {
	it("returns null when not found", async () => {
		const result = await getWorkspaceBySlug("nonexistent");
		expect(result).toBeNull();
	});

	it("returns workspace when found", async () => {
		dbModule._chain.limit.mockResolvedValueOnce([fakeWorkspace]);

		const result = await getWorkspaceBySlug("my-ws");
		expect(result).toEqual(fakeWorkspace);
	});
});

describe("countWorkspaces", () => {
	it("returns workspace count when .from() is terminal", async () => {
		// countWorkspaces: db.select({ value: count() }).from(workspaces)
		// .from() is terminal
		dbModule._chain.from.mockResolvedValueOnce([{ value: 7 }]);

		const result = await countWorkspaces();
		expect(result).toBe(7);
	});
});

describe("getWorkspacesByUserId", () => {
	it("returns list of workspaces with members and orgs", async () => {
		const row = {
			workspace: fakeWorkspace,
			member: fakeMember,
			organization: { id: "org-1", name: "Org" },
		};
		// getWorkspacesByUserId ends at .where() (innerJoin().where() terminal)
		dbModule._chain.where.mockResolvedValueOnce([row]);

		const result = await getWorkspacesByUserId("user-2");
		expect(result).toHaveLength(1);
		expect(result[0].workspace).toEqual(fakeWorkspace);
	});

	it("returns empty array when user has no workspaces", async () => {
		dbModule._chain.where.mockResolvedValueOnce([]);

		const result = await getWorkspacesByUserId("user-unknown");
		expect(result).toHaveLength(0);
	});
});

describe("findUserByEmail", () => {
	it("returns null when user not found", async () => {
		const result = await findUserByEmail("missing@example.com");
		expect(result).toBeNull();
	});

	it("returns user when found (normalizes email)", async () => {
		const user = { id: "user-1", name: "Alice", email: "alice@example.com" };
		dbModule._chain.limit.mockResolvedValueOnce([user]);

		const result = await findUserByEmail("ALICE@EXAMPLE.COM");
		expect(result).toEqual(user);
	});
});

describe("listWorkspaceMembers", () => {
	it("returns empty list when no members", async () => {
		// Q1: .innerJoin(users).where() terminal
		// Q2: .innerJoin(roles).where() terminal
		dbModule._chain.where
			.mockResolvedValueOnce([]) // Q1: members
			.mockResolvedValueOnce([]); // Q2: bindings

		const result = await listWorkspaceMembers("ws-1");
		expect(result).toHaveLength(0);
	});

	it("returns members with role names from bindings", async () => {
		const memberRow = {
			id: "m1",
			userId: "user-2",
			status: "active",
			createdAt: new Date(),
			name: "Bob",
			email: "bob@example.com",
		};
		const bindingRow = { principalId: "user-2", roleName: "workspace.owner" };

		dbModule._chain.where
			.mockResolvedValueOnce([memberRow]) // Q1: members
			.mockResolvedValueOnce([bindingRow]); // Q2: bindings

		const result = await listWorkspaceMembers("ws-1");
		expect(result).toHaveLength(1);
		expect(result[0].roleName).toBe("workspace.owner");
	});

	it("defaults to workspace.member when no binding found", async () => {
		const memberRow = {
			id: "m1",
			userId: "user-3",
			status: "active",
			createdAt: new Date(),
			name: "Carol",
			email: "carol@example.com",
		};

		dbModule._chain.where
			.mockResolvedValueOnce([memberRow])
			.mockResolvedValueOnce([]); // no bindings

		const result = await listWorkspaceMembers("ws-1");
		expect(result[0].roleName).toBe("workspace.member");
	});
});

describe("createWorkspace", () => {
	it("creates workspace via transaction, returning workspace object", async () => {
		const fakeOrg = { id: "org-1", name: "Acme", slug: "acme" };
		const fakeWs = {
			id: "ws-2",
			name: "Main",
			slug: "main",
			organizationId: "org-1",
		};
		const seedRole = { id: "role-owner", name: "workspace.owner" };

		// tx.select().from(organizations).where().limit(1) → finds existing org
		dbModule._tx.limit.mockResolvedValue([fakeOrg]);

		// tx.insert(workspaces).values().returning() → first returning = workspace
		// tx.insert(roles).values().onConflictDoNothing().returning() → default [] (then fallback select)
		dbModule._tx.returning
			.mockResolvedValueOnce([fakeWs]) // workspace insert
			.mockResolvedValue([]); // role inserts (all empty → fallback to limit)

		// tx.select().from(roles).where().limit(1) for seedSystemRoles fallbacks → seedRole
		// Already covered: tx.limit default returns [fakeOrg] which is truthy (acts as role)
		// Override to return something with an id property
		dbModule._tx.limit.mockResolvedValue([seedRole]);

		const result = await createWorkspace({
			userId: "user-1",
			organizationName: "Acme",
			organizationSlug: "acme",
			workspaceName: "Main",
			workspaceSlug: "main",
		});

		expect(result).toEqual(fakeWs);
		expect(dbModule.db.transaction).toHaveBeenCalledOnce();
	});
});

describe("addWorkspaceMember", () => {
	it("throws when workspace not found", async () => {
		await expect(
			addWorkspaceMember({
				workspaceId: "ws-1",
				userId: "user-2",
				invitedBy: "user-1",
			}),
		).rejects.toThrow("Workspace not found");
	});

	it("throws when user is already an active member", async () => {
		dbModule._chain.limit
			.mockResolvedValueOnce([fakeWorkspace])
			.mockResolvedValueOnce([{ ...fakeMember, status: "active" }]);

		await expect(
			addWorkspaceMember({
				workspaceId: "ws-1",
				userId: "user-2",
				invitedBy: "user-1",
			}),
		).rejects.toThrow("already a workspace member");
	});

	it("throws when role not found", async () => {
		dbModule._chain.limit
			.mockResolvedValueOnce([fakeWorkspace])
			.mockResolvedValueOnce([]) // no existing member
			.mockResolvedValueOnce([]); // role not found

		await expect(
			addWorkspaceMember({
				workspaceId: "ws-1",
				userId: "user-2",
				roleName: "workspace.nonexistent",
				invitedBy: "user-1",
			}),
		).rejects.toThrow("Role not found");
	});

	it("adds new member via transaction (no existing member)", async () => {
		dbModule._chain.limit
			.mockResolvedValueOnce([fakeWorkspace])
			.mockResolvedValueOnce([]) // no existing member
			.mockResolvedValueOnce([fakeRole]);

		// tx: check existing binding
		dbModule._tx.limit.mockResolvedValueOnce([]); // no existing binding

		await addWorkspaceMember({
			workspaceId: "ws-1",
			userId: "user-2",
			invitedBy: "user-1",
		});

		expect(dbModule.db.transaction).toHaveBeenCalledOnce();
	});

	it("reactivates removed member via transaction update", async () => {
		dbModule._chain.limit
			.mockResolvedValueOnce([fakeWorkspace])
			.mockResolvedValueOnce([{ ...fakeMember, status: "removed" }])
			.mockResolvedValueOnce([fakeRole]);

		// tx: check existing binding
		dbModule._tx.limit.mockResolvedValueOnce([]);

		await addWorkspaceMember({
			workspaceId: "ws-1",
			userId: "user-2",
			invitedBy: "user-1",
		});

		expect(dbModule.db.transaction).toHaveBeenCalledOnce();
	});
});

describe("removeWorkspaceMember", () => {
	it("throws when workspace not found", async () => {
		await expect(
			removeWorkspaceMember({
				workspaceId: "ws-1",
				userId: "user-2",
				removedBy: "user-1",
			}),
		).rejects.toThrow("Workspace not found");
	});

	it("throws when member not found", async () => {
		dbModule._chain.limit
			.mockResolvedValueOnce([fakeWorkspace])
			.mockResolvedValueOnce([]);

		await expect(
			removeWorkspaceMember({
				workspaceId: "ws-1",
				userId: "user-2",
				removedBy: "user-1",
			}),
		).rejects.toThrow("Member not found");
	});

	it("marks member as removed when found", async () => {
		dbModule._chain.limit
			.mockResolvedValueOnce([fakeWorkspace])
			.mockResolvedValueOnce([fakeMember]);

		await removeWorkspaceMember({
			workspaceId: "ws-1",
			userId: "user-2",
			removedBy: "user-1",
		});

		expect(dbModule.db.update).toHaveBeenCalled();
	});
});

describe("updateWorkspaceMemberRole", () => {
	it("throws when workspace not found", async () => {
		await expect(
			updateWorkspaceMemberRole({
				workspaceId: "ws-1",
				userId: "user-2",
				roleName: "workspace.member",
				updatedBy: "user-1",
			}),
		).rejects.toThrow("Workspace not found");
	});

	it("throws when role not found", async () => {
		dbModule._chain.limit
			.mockResolvedValueOnce([fakeWorkspace])
			.mockResolvedValueOnce([]); // getSystemWorkspaceRole → not found

		await expect(
			updateWorkspaceMemberRole({
				workspaceId: "ws-1",
				userId: "user-2",
				roleName: "workspace.admin",
				updatedBy: "user-1",
			}),
		).rejects.toThrow("Role not found");
	});

	it("throws when member not found", async () => {
		dbModule._chain.limit
			.mockResolvedValueOnce([fakeWorkspace])
			.mockResolvedValueOnce([fakeRole])
			.mockResolvedValueOnce([]);

		await expect(
			updateWorkspaceMemberRole({
				workspaceId: "ws-1",
				userId: "user-2",
				roleName: "workspace.member",
				updatedBy: "user-1",
			}),
		).rejects.toThrow("Member not found");
	});

	it("deletes old binding and inserts new one via transaction", async () => {
		dbModule._chain.limit
			.mockResolvedValueOnce([fakeWorkspace])
			.mockResolvedValueOnce([fakeRole])
			.mockResolvedValueOnce([fakeMember]);

		await updateWorkspaceMemberRole({
			workspaceId: "ws-1",
			userId: "user-2",
			roleName: "workspace.member",
			updatedBy: "user-1",
		});

		expect(dbModule.db.transaction).toHaveBeenCalledOnce();
	});
});
