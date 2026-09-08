vi.mock("@/modules/resource-package/permissions", () => ({
  requirePackageInstallPermissions: vi.fn().mockResolvedValue(undefined),
}));
import {
  publishMarketplaceItem,
  shareMarketplaceItem,
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

function givenInsertReturningOnce(value: unknown) {
  return dbModule._insertChain.returning.mockResolvedValueOnce(value);
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

  describe("publishMarketplaceItem", () => {
    it("should publish a draft item", async () => {
      const item = {
        id: "1",
        publisherUserId: "user1",
        status: "draft",
        visibility: "private",
        latestVersionId: "version-1",
      };
      const updated = { ...item, status: "published", visibility: "public" };
      givenSelectLimitOnce([item]);
      givenSelectLimitOnce([
        {
          id: "version-1",
          manifestJson: {
            type: "custom_tool",
            tool: { encryptedCredentialRefs: [{ encryptedPayload: "cipher" }] },
          },
        },
      ]);
      givenUpdateReturningOnce([updated]);
      const result = await publishMarketplaceItem("1", "user1", {
        visibility: "public",
      });
      expect(result.status).toBe("published");
      expect(result.visibility).toBe("public");
      expect(dbModule._updateChain.set).toHaveBeenCalledWith({
        manifestJson: {
          type: "custom_tool",
          tool: {},
        },
      });
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
});
