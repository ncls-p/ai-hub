import { beforeEach, describe, expect, it, vi } from "vitest";

import { listRemoteMcpTools } from "@/modules/mcp/client";
import { toMcpServerForEdit, toSafeMcpServer } from "@/modules/mcp/use-cases";
import * as _dbModule from "@/server/infrastructure/db";

// ─── Mocks ────────────────────────────────────────────────────────────

vi.mock("@/server/domain/services/audit", () => ({
  audit: { emit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/logger", () => ({
  logHandledError: vi.fn(),
  logHandledWarning: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/crypto", () => ({
  encryptValue: vi.fn().mockResolvedValue("enc:value"),
  decryptValue: vi.fn().mockResolvedValue("decrypted"),
}));

vi.mock("@/modules/mcp/client", () => ({
  listRemoteMcpTools: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/modules/mcp/auth-hint", () => ({
  inferMcpAuthHint: vi.fn().mockReturnValue("none"),
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
  _tx: Chain;
};

vi.mock("@/server/infrastructure/db", () => {
  const chain = makeChain();
  const tx = makeChain();
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn(),
    },
    _c: chain,
    _tx: tx,
  };
});
export const dbModule = _dbModule as unknown as DbModule;

function reset() {
  for (const chain of [dbModule._c, dbModule._tx]) {
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
    ] as const) {
      chain[k].mockReset().mockReturnThis();
    }
    chain.limit.mockReset().mockResolvedValue([]);
    chain.returning.mockReset().mockResolvedValue([]);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  reset();
  dbModule.db.select.mockReturnValue(dbModule._c);
  dbModule.db.insert.mockReturnValue(dbModule._c);
  dbModule.db.update.mockReturnValue(dbModule._c);
  dbModule.db.delete.mockReturnValue(dbModule._c);
  dbModule.db.transaction.mockImplementation(
    (cb: (tx: Chain) => Promise<unknown>) => cb(dbModule._tx),
  );
  // Reset listRemoteMcpTools mock queue between tests
  vi.mocked(listRemoteMcpTools).mockReset().mockResolvedValue([]);
});

// ─── Fixtures ────────────────────────────────────────────────────────

export const fakeSseServer = {
  id: "srv-1",
  workspaceId: "ws-1",
  name: "Remote Server",
  transport: "sse" as const,
  command: null,
  argsJson: null,
  url: "https://mcp.example.com/sse",
  encryptedHeadersJson: null,
  encryptedEnvJson: null,
  enabled: true,
  requireApproval: false,
  isGlobal: false,
  visibility: "private",
  healthStatus: "healthy",
  lastCheckedAt: null,
  createdById: "user-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
};

export const fakeStdioServer = {
  ...fakeSseServer,
  id: "srv-2",
  transport: "stdio" as const,
  command: "npx mcp-server",
  url: null,
};

export const fakeTool = {
  id: "tool-1",
  mcpServerId: "srv-1",
  name: "search",
  description: "Search the web",
  inputSchemaJson: null,
  outputSchemaJson: null,
  enabled: true,
  requireApproval: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── toSafeMcpServer ──────────────────────────────────────────────────

describe("toSafeMcpServer", () => {
  it("hides connection credentials embedded in URLs or command arguments", () => {
    const safe = toSafeMcpServer(
      {
        ...fakeSseServer,
        url: "https://example.test?token=secret",
        command: "secret",
        argsJson: ["secret"],
      },
      false,
    );
    expect(safe.url).toBeNull();
    expect(safe.command).toBeNull();
    expect(safe.argsJson).toBeNull();
    expect(JSON.stringify(safe)).not.toContain("secret");
  });
  it("omits encrypted fields and exposes hasHeaders/hasEnv flags", () => {
    const safe = toSafeMcpServer(fakeSseServer);
    expect(safe).not.toHaveProperty("encryptedHeadersJson");
    expect(safe).not.toHaveProperty("encryptedEnvJson");
    expect(safe.hasHeaders).toBe(false);
    expect(safe.hasEnv).toBe(false);
  });

  it("hasHeaders is true when encryptedHeadersJson present", () => {
    const safe = toSafeMcpServer({
      ...fakeSseServer,
      encryptedHeadersJson: { auth: "enc" },
    });
    expect(safe.hasHeaders).toBe(true);
  });

  it("hasEnv is true when encryptedEnvJson present", () => {
    const safe = toSafeMcpServer({
      ...fakeSseServer,
      encryptedEnvJson: { KEY: "enc" },
    });
    expect(safe.hasEnv).toBe(true);
  });
});

// ─── toMcpServerForEdit ───────────────────────────────────────────────

describe("toMcpServerForEdit", () => {
  it("adds authHint to safe server", () => {
    const result = toMcpServerForEdit(fakeSseServer);
    expect(result).toHaveProperty("authHint");
    expect(result.hasHeaders).toBe(false);
  });
});
