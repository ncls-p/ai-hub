vi.mock("@/modules/resource-package/permissions", () => ({
  requirePackageInstallPermissions: vi.fn().mockResolvedValue(undefined),
}));
import { adminModerateItem } from "@/modules/marketplace/use-cases";
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
