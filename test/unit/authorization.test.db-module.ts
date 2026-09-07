import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  canDelegatePermissionSet,
  matchesPermission,
} from "@/server/domain/services/authorization";
import { cache } from "@/server/infrastructure/cache";
import * as _dbModule from "@/server/infrastructure/db";

// ─── Mocks ────────────────────────────────────────────────────────────

vi.mock("@/lib/logger", () => ({
  logHandledError: vi.fn(),
  logHandledWarning: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/crypto", () => ({
  encryptValue: vi.fn().mockResolvedValue("enc:value"),
  decryptValue: vi.fn().mockResolvedValue("decrypted"),
}));

type Chain = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
};

function makeChain(): Chain {
  const c = {} as Chain;
  for (const k of [
    "select",
    "insert",
    "update",
    "delete",
    "from",
    "where",
    "orderBy",
    "values",
    "set",
    "innerJoin",
  ] as const) {
    c[k] = vi.fn().mockReturnThis();
  }
  c.limit = vi.fn().mockResolvedValue([]);
  c.returning = vi.fn().mockResolvedValue([]);
  return c;
}

type DbMock = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
};

type DbModule = {
  db: DbMock;
  _c: Chain;
};

vi.mock("@/server/infrastructure/db", () => {
  const chain = makeChain();
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn(),
    },
    _c: chain,
  };
});

vi.mock("@/server/infrastructure/cache", () => ({
  cache: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));
export const dbModule = _dbModule as unknown as DbModule;

function resetDb() {
  for (const k of [
    "select",
    "insert",
    "update",
    "delete",
    "from",
    "where",
    "orderBy",
    "values",
    "set",
    "innerJoin",
  ] as const) {
    dbModule._c[k].mockReset().mockReturnThis();
  }
  dbModule._c.limit.mockReset().mockResolvedValue([]);
  dbModule._c.returning.mockReset().mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
  vi.mocked(cache.get).mockReset();
  vi.mocked(cache.set).mockReset();
  vi.mocked(cache.del).mockReset();
});

// ─── matchesPermission (pure function) ───────────────────────────────

describe("matchesPermission", () => {
  it("matches exact permission", () => {
    expect(matchesPermission("agents.create", "agents.create")).toBe(true);
  });

  it("matches wildcard grants", () => {
    expect(matchesPermission("agents.*", "agents.create")).toBe(true);
    expect(matchesPermission("agents.*", "agents.delete")).toBe(true);
  });

  it("matches manage grants for domain actions", () => {
    expect(matchesPermission("agents.manage", "agents.create")).toBe(true);
  });

  it("does not match different domains", () => {
    expect(matchesPermission("agents.create", "providers.create")).toBe(false);
  });

  it("lets view grants satisfy read-oriented actions", () => {
    expect(matchesPermission("tools.view", "tools.get")).toBe(false);
    expect(matchesPermission("tools.view", "tools.list")).toBe(false);
    expect(matchesPermission("tools.view", "tools.view")).toBe(true);
    expect(matchesPermission("tools.view", "tools.viewAllowed")).toBe(false);
    expect(matchesPermission("tools.view", "tools.viewLimited")).toBe(false);
    expect(matchesPermission("tools.view", "tools.viewMetadata")).toBe(false);
    expect(matchesPermission("tools.view", "tools.viewOwn")).toBe(false);
    expect(matchesPermission("tools.view", "tools.viewShared")).toBe(false);
    expect(matchesPermission("tools.view", "tools.configure")).toBe(false);
  });

  it("rejects malformed permissions without an action", () => {
    expect(matchesPermission("agents", "agents.create")).toBe(false);
    expect(matchesPermission("agents", "agents")).toBe(false);
  });

  it("does not let a specific grant satisfy a wildcard requirement", () => {
    expect(matchesPermission("agents.create", "agents.*")).toBe(false);
  });
});

describe("canDelegatePermissionSet", () => {
  it("allows only permissions held by the actor", () => {
    expect(
      canDelegatePermissionSet(
        ["workspaces.get", "roles.manage"],
        ["workspaces.get"],
      ),
    ).toBe(true);
    expect(
      canDelegatePermissionSet(
        ["workspaces.get", "roles.manage"],
        ["workspaces.get", "agents.manage"],
      ),
    ).toBe(false);
  });

  it("honors wildcard and manage grants without crossing domains", () => {
    expect(canDelegatePermissionSet(["agents.manage"], ["agents.get"])).toBe(
      true,
    );
    expect(
      canDelegatePermissionSet(["agents.manage"], ["providers.manage"]),
    ).toBe(false);
  });
});
