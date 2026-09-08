vi.mock("@/modules/resource-package/permissions", () => ({
  requirePackageInstallPermissions: vi.fn().mockResolvedValue(undefined),
}));
import {
  featureMarketplaceItem,
  unfeatureMarketplaceItem,
  unshareMarketplaceItem,
} from "@/modules/marketplace/use-cases";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  onConflictDoUpdate: ReturnType<typeof vi.fn>;
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
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  };
  const deleteChain: DeleteChain = {
    where: vi.fn().mockResolvedValue(undefined),
  };

  type DbMock = {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    transaction: ReturnType<typeof vi.fn>;
  };

  type DbModule = {
    db: DbMock;
    _selectChain: SelectChain;
    _updateChain: UpdateChain;
    _insertChain: InsertChain;
    _deleteChain: DeleteChain;
  };

  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn(),
    },
    _selectChain: selectChain,
    _updateChain: updateChain,
    _insertChain: insertChain,
    _deleteChain: deleteChain,
  } as DbModule;
});

import * as _dbModule from "@/server/infrastructure/db";
const dbModule = _dbModule as unknown as {
  _selectChain: SelectChain;
  _updateChain: UpdateChain;
  _insertChain: InsertChain;
  _deleteChain: DeleteChain;
  db: {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    transaction: ReturnType<typeof vi.fn>;
  };
};

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

function givenUpdateReturningOnce(value: unknown) {
  return dbModule._updateChain.returning.mockResolvedValueOnce(value);
}
describe("marketplace use-cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChains();
    dbModule.db.select.mockReturnValue(dbModule._selectChain);
    dbModule.db.insert.mockReturnValue(dbModule._insertChain);
    dbModule.db.update.mockReturnValue(dbModule._updateChain);
    dbModule.db.delete.mockReturnValue(dbModule._deleteChain);
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
});
