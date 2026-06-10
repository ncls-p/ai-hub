import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	listMarketplaceItems,
	getMarketplaceItem,
	getMarketplaceItemWithShares,
	publishMarketplaceItem,
	shareMarketplaceItem,
	unshareMarketplaceItem,
	featureMarketplaceItem,
	unfeatureMarketplaceItem,
	updateMarketplaceItem,
	deleteMarketplaceItem,
	adminModerateItem,
} from "@/modules/marketplace/use-cases";

// ─── Mocks ─────────────────────────────────────────────────────────────

vi.mock("@/server/domain/services/audit", () => ({
	audit: {
		emit: vi.fn().mockResolvedValue(undefined),
	},
}));

type SelectChain = {
	from: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
	orderBy: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
};

type UpdateChain = {
	set: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
	returning: ReturnType<typeof vi.fn>;
};

type InsertChain = {
	values: ReturnType<typeof vi.fn>;
	returning: ReturnType<typeof vi.fn>;
};

type DeleteChain = {
	where: ReturnType<typeof vi.fn>;
};

vi.mock("@/server/infrastructure/db", () => {
	const selectChain: SelectChain = {
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		orderBy: vi.fn().mockResolvedValue([]),
		limit: vi.fn().mockResolvedValue([]),
	};
	const updateChain: UpdateChain = {
		set: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		returning: vi.fn().mockResolvedValue([]),
	};
	const insertChain: InsertChain = {
		values: vi.fn().mockReturnThis(),
		returning: vi.fn().mockResolvedValue([]),
	};
	const deleteChain: DeleteChain = {
		where: vi.fn().mockResolvedValue(undefined),
	};

	return {
		db: {
			select: vi.fn().mockReturnValue(selectChain),
			insert: vi.fn().mockReturnValue(insertChain),
			update: vi.fn().mockReturnValue(updateChain),
			delete: vi.fn().mockReturnValue(deleteChain),
			transaction: vi.fn(),
		},
		_selectChain: selectChain,
		_updateChain: updateChain,
		_insertChain: insertChain,
		_deleteChain: deleteChain,
	};
});

declare module "@/server/infrastructure/db" {
	export const _selectChain: SelectChain;
	export const _updateChain: UpdateChain;
	export const _insertChain: InsertChain;
	export const _deleteChain: DeleteChain;
}

import * as dbModule from "@/server/infrastructure/db";

// ─── Helpers ───────────────────────────────────────────────────────────

function resetChains() {
	const sc = dbModule._selectChain;
	const uc = dbModule._updateChain;
	const ic = dbModule._insertChain;
	const dc = dbModule._deleteChain;

	sc.from.mockReset().mockReturnThis();
	sc.where.mockReset().mockReturnThis();
	sc.orderBy.mockReset().mockResolvedValue([]);
	sc.limit.mockReset().mockResolvedValue([]);
	uc.set.mockReset().mockReturnThis();
	uc.where.mockReset().mockReturnThis();
	uc.returning.mockReset().mockResolvedValue([]);
	ic.values.mockReset().mockReturnThis();
	ic.returning.mockReset().mockResolvedValue([]);
	dc.where.mockReset().mockResolvedValue(undefined);
}

function givenSelectLimit(value: unknown) {
	return dbModule._selectChain.limit.mockResolvedValue(value);
}

function givenSelectLimitOnce(value: unknown) {
	return dbModule._selectChain.limit.mockResolvedValueOnce(value);
}

function givenSelectOrderBy(value: unknown) {
	return dbModule._selectChain.orderBy.mockResolvedValue(value);
}

function givenUpdateReturningOnce(value: unknown) {
	return dbModule._updateChain.returning.mockResolvedValueOnce(value);
}

function givenInsertReturningOnce(value: unknown) {
	return dbModule._insertChain.returning.mockResolvedValueOnce(value);
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe("marketplace use-cases", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetChains();
	});

	describe("listMarketplaceItems", () => {
		it("should return published items when no userId provided", async () => {
			const items = [{ id: "1", name: "Test Item", status: "published" }];
			givenSelectOrderBy(items);
			const result = await listMarketplaceItems({});
			expect(result).toEqual(items);
		});

		it("should filter by type when type array provided", async () => {
			givenSelectOrderBy([]);
			await listMarketplaceItems({ type: ["agent", "skill"] });
			expect(dbModule._selectChain.from).toHaveBeenCalled();
		});

		it("should filter by featured when featuredOnly is true", async () => {
			givenSelectOrderBy([]);
			await listMarketplaceItems({ featuredOnly: true });
			expect(dbModule._selectChain.from).toHaveBeenCalled();
		});

		it("should support search parameter", async () => {
			givenSelectOrderBy([]);
			await listMarketplaceItems({ search: "test" });
			expect(dbModule._selectChain.from).toHaveBeenCalled();
		});

		it("should support sortBy parameter", async () => {
			givenSelectOrderBy([]);
			await listMarketplaceItems({ sortBy: "downloads" });
			expect(dbModule._selectChain.from).toHaveBeenCalled();
		});
	});

	describe("getMarketplaceItem", () => {
		it("should return item when found", async () => {
			const item = { id: "1", name: "Test Item" };
			givenSelectLimit([item]);
			const result = await getMarketplaceItem("1");
			expect(result).toEqual(item);
		});

		it("should return null when item not found", async () => {
			givenSelectLimit([]);
			const result = await getMarketplaceItem("nonexistent");
			expect(result).toBeNull();
		});
	});

	describe("getMarketplaceItemWithShares", () => {
		it("should return item with shareCount", async () => {
			const item = { id: "1", name: "Test Item" };
			const shares = [{ id: "s1" }, { id: "s2" }];
			const sc = dbModule._selectChain;
			// First query: select.from.where.limit → where returns chain, limit resolves item
			sc.where.mockImplementationOnce(() => sc);
			givenSelectLimitOnce([item]);
			// Second query: select.from.where → where resolves shares directly
			sc.where.mockResolvedValueOnce(shares);
			const result = await getMarketplaceItemWithShares("1");
			expect(result).toEqual({ ...item, shareCount: 2 });
		});

		it("should return null when item not found", async () => {
			givenSelectLimit([]);
			const result = await getMarketplaceItemWithShares("nonexistent");
			expect(result).toBeNull();
		});
	});

	describe("publishMarketplaceItem", () => {
		it("should publish a draft item", async () => {
			const item = {
				id: "1",
				publisherUserId: "user1",
				status: "draft",
				visibility: "private",
			};
			const updated = { ...item, status: "published", visibility: "public" };
			givenSelectLimitOnce([item]);
			givenUpdateReturningOnce([updated]);
			const result = await publishMarketplaceItem("1", "user1", {
				visibility: "public",
			});
			expect(result.status).toBe("published");
			expect(result.visibility).toBe("public");
		});

		it("should throw when item not found", async () => {
			givenSelectLimit([]);
			await expect(
				publishMarketplaceItem("nonexistent", "user1", {}),
			).rejects.toThrow("Marketplace item not found");
		});

		it("should throw when not authorized", async () => {
			const item = {
				id: "1",
				publisherUserId: "other_user",
				status: "draft",
			};
			givenSelectLimit([item]);
			await expect(publishMarketplaceItem("1", "user1", {})).rejects.toThrow(
				"Not authorized to publish this item",
			);
		});

		it("should throw when item is not a draft", async () => {
			const item = {
				id: "1",
				publisherUserId: "user1",
				status: "published",
			};
			givenSelectLimit([item]);
			await expect(publishMarketplaceItem("1", "user1", {})).rejects.toThrow(
				"Only drafts can be published",
			);
		});
	});

	describe("shareMarketplaceItem", () => {
		it("should share item with target user", async () => {
			const item = {
				id: "1",
				publisherUserId: "user1",
				publisherWorkspaceId: "ws1",
			};
			const targetUser = {
				id: "user2",
				name: "User 2",
				email: "user2@test.com",
			};
			const share = { id: "share1", itemId: "1", sharedWithUserId: "user2" };
			givenSelectLimitOnce([item]);
			givenSelectLimitOnce([targetUser]);
			givenInsertReturningOnce([share]);
			const result = await shareMarketplaceItem({
				itemId: "1",
				userId: "user1",
				targetUserId: "user2",
			});
			expect(result).toEqual(share);
		});

		it("should throw when item not found", async () => {
			givenSelectLimit([]);
			await expect(
				shareMarketplaceItem({
					itemId: "nonexistent",
					userId: "user1",
					targetUserId: "user2",
				}),
			).rejects.toThrow("Marketplace item not found");
		});

		it("should throw when target user not found", async () => {
			const item = { id: "1", publisherUserId: "user1" };
			givenSelectLimitOnce([item]);
			givenSelectLimitOnce([]);
			await expect(
				shareMarketplaceItem({
					itemId: "1",
					userId: "user1",
					targetUserId: "nonexistent",
				}),
			).rejects.toThrow("Target user not found");
		});
	});

	describe("unshareMarketplaceItem", () => {
		it("should unshare item from target user", async () => {
			const item = {
				id: "1",
				publisherUserId: "user1",
				publisherWorkspaceId: "ws1",
			};
			givenSelectLimit([item]);
			await unshareMarketplaceItem({
				itemId: "1",
				userId: "user1",
				targetUserId: "user2",
			});
			expect(dbModule._deleteChain.where).toHaveBeenCalled();
		});

		it("should throw when not authorized", async () => {
			const item = { id: "1", publisherUserId: "other_user" };
			givenSelectLimit([item]);
			await expect(
				unshareMarketplaceItem({
					itemId: "1",
					userId: "user1",
					targetUserId: "user2",
				}),
			).rejects.toThrow("Not authorized to unshare this item");
		});
	});

	describe("featureMarketplaceItem", () => {
		it("should feature an item", async () => {
			const item = {
				id: "1",
				publisherWorkspaceId: "ws1",
				isFeatured: false,
			};
			const updated = { ...item, isFeatured: true, featuredOrder: 1 };
			givenSelectLimitOnce([item]);
			givenUpdateReturningOnce([updated]);
			const result = await featureMarketplaceItem({
				itemId: "1",
				adminUserId: "admin1",
				order: 1,
			});
			expect(result.isFeatured).toBe(true);
			expect(result.featuredOrder).toBe(1);
		});

		it("should throw when item not found", async () => {
			givenSelectLimit([]);
			await expect(
				featureMarketplaceItem({
					itemId: "nonexistent",
					adminUserId: "admin1",
				}),
			).rejects.toThrow("Marketplace item not found");
		});
	});

	describe("unfeatureMarketplaceItem", () => {
		it("should unfeature an item", async () => {
			const item = {
				id: "1",
				publisherWorkspaceId: "ws1",
				isFeatured: true,
			};
			const updated = {
				...item,
				isFeatured: false,
				featuredOrder: null,
				featuredAt: null,
			};
			givenSelectLimitOnce([item]);
			givenUpdateReturningOnce([updated]);
			const result = await unfeatureMarketplaceItem({
				itemId: "1",
				adminUserId: "admin1",
			});
			expect(result.isFeatured).toBe(false);
			expect(result.featuredOrder).toBeNull();
		});
	});

	describe("updateMarketplaceItem", () => {
		it("should update item fields", async () => {
			const item = {
				id: "1",
				publisherUserId: "user1",
				name: "Old Name",
				description: "Old desc",
			};
			const updated = {
				...item,
				name: "New Name",
				description: "New desc",
				tagsJson: ["tag1", "tag2"],
			};
			givenSelectLimitOnce([item]);
			givenUpdateReturningOnce([updated]);
			const result = await updateMarketplaceItem({
				itemId: "1",
				userId: "user1",
				name: "New Name",
				description: "New desc",
				tags: ["tag1", "tag2"],
			});
			expect(result.name).toBe("New Name");
			expect(result.tagsJson).toEqual(["tag1", "tag2"]);
		});

		it("should throw when not authorized", async () => {
			const item = { id: "1", publisherUserId: "other_user" };
			givenSelectLimit([item]);
			await expect(
				updateMarketplaceItem({
					itemId: "1",
					userId: "user1",
					name: "New Name",
				}),
			).rejects.toThrow("Not authorized to update this item");
		});
	});

	describe("deleteMarketplaceItem", () => {
		it("should archive item", async () => {
			const item = {
				id: "1",
				publisherUserId: "user1",
				publisherWorkspaceId: "ws1",
				status: "published",
			};
			const updated = { ...item, status: "archived" };
			givenSelectLimitOnce([item]);
			givenUpdateReturningOnce([updated]);
			const result = await deleteMarketplaceItem("1", "user1");
			expect(result.status).toBe("archived");
		});

		it("should throw when not authorized", async () => {
			const item = { id: "1", publisherUserId: "other_user" };
			givenSelectLimit([item]);
			await expect(deleteMarketplaceItem("1", "user1")).rejects.toThrow(
				"Not authorized to delete this item",
			);
		});
	});

	describe("adminModerateItem", () => {
		it("should suspend an item", async () => {
			const item = {
				id: "1",
				publisherWorkspaceId: "ws1",
				status: "published",
			};
			const updated = { ...item, status: "suspended" };
			givenSelectLimitOnce([item]);
			givenUpdateReturningOnce([updated]);
			const result = await adminModerateItem({
				itemId: "1",
				adminUserId: "admin1",
				action: "suspend",
			});
			expect(result.status).toBe("suspended");
		});

		it("should unsuspend an item", async () => {
			const item = {
				id: "1",
				publisherWorkspaceId: "ws1",
				status: "suspended",
			};
			const updated = { ...item, status: "published" };
			givenSelectLimitOnce([item]);
			givenUpdateReturningOnce([updated]);
			const result = await adminModerateItem({
				itemId: "1",
				adminUserId: "admin1",
				action: "unsuspend",
			});
			expect(result.status).toBe("published");
		});

		it("should archive an item", async () => {
			const item = {
				id: "1",
				publisherWorkspaceId: "ws1",
				status: "published",
			};
			const updated = { ...item, status: "archived" };
			givenSelectLimitOnce([item]);
			givenUpdateReturningOnce([updated]);
			const result = await adminModerateItem({
				itemId: "1",
				adminUserId: "admin1",
				action: "archive",
			});
			expect(result.status).toBe("archived");
		});

		it("should throw for unknown action", async () => {
			const item = { id: "1", publisherWorkspaceId: "ws1" };
			givenSelectLimit([item]);
			await expect(
				adminModerateItem({
					itemId: "1",
					adminUserId: "admin1",
					action: "unknown" as never,
				}),
			).rejects.toThrow("Unknown moderation action: unknown");
		});
	});
});
