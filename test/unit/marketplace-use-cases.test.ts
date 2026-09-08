vi.mock("@/modules/resource-package/permissions", () => ({
  requirePackageInstallPermissions: vi.fn().mockResolvedValue(undefined),
}));
import {
  getMarketplaceItem,
  getMarketplaceItemWithShares,
  listMarketplaceItems,
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

function givenSelectOrderBy(value: unknown) {
  return dbModule._selectChain.orderBy.mockResolvedValue(value);
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
});
