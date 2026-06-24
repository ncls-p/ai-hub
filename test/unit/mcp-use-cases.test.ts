import { beforeEach, describe, expect, it, vi } from "vitest";

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

import * as _dbModule from "@/server/infrastructure/db";
const dbModule = _dbModule as unknown as DbModule;
import { listRemoteMcpTools } from "@/modules/mcp/client";
import {
  archiveMcpServer,
  createMcpServer,
  getMcpServer,
  listMcpServers,
  listMcpTools,
  syncMcpTools,
  testMcpConnection,
  toMcpServerForEdit,
  toSafeMcpServer,
  updateMcpServer,
  updateMcpTool,
} from "@/modules/mcp/use-cases";

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

const fakeSseServer = {
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
  healthStatus: "healthy",
  lastCheckedAt: null,
  createdById: "user-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
};

const fakeStdioServer = {
  ...fakeSseServer,
  id: "srv-2",
  transport: "stdio" as const,
  command: "npx mcp-server",
  url: null,
};

const fakeTool = {
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

// ─── getMcpServer ─────────────────────────────────────────────────────

describe("getMcpServer", () => {
  it("returns null when server not found", async () => {
    const result = await getMcpServer("nonexistent", "ws-1");
    expect(result).toBeNull();
  });

  it("returns server when found", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
    const result = await getMcpServer("srv-1", "ws-1");
    expect(result).toEqual(fakeSseServer);
  });
});

// ─── listMcpServers ───────────────────────────────────────────────────

describe("listMcpServers", () => {
  it("returns mapped safe servers", async () => {
    dbModule._c.orderBy.mockResolvedValueOnce([fakeSseServer]);
    const result = await listMcpServers("ws-1");
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty("encryptedHeadersJson");
  });

  it("returns empty array when no servers", async () => {
    dbModule._c.orderBy.mockResolvedValueOnce([]);
    const result = await listMcpServers("ws-1");
    expect(result).toHaveLength(0);
  });
});

// ─── createMcpServer ──────────────────────────────────────────────────

describe("createMcpServer", () => {
  it("inserts server without encryption for empty headers/env", async () => {
    dbModule._c.returning.mockResolvedValueOnce([fakeSseServer]);
    const { encryptValue } = await import("@/lib/crypto");

    const result = await createMcpServer({
      workspaceId: "ws-1",
      userId: "user-1",
      name: "Test",
      transport: "sse",
      url: "https://example.com",
    });

    expect(dbModule.db.insert).toHaveBeenCalled();
    expect(encryptValue).not.toHaveBeenCalled();
    expect(result).toEqual(fakeSseServer);
  });

  it("encrypts headers on create", async () => {
    dbModule._c.returning.mockResolvedValueOnce([fakeSseServer]);
    const { encryptValue } = await import("@/lib/crypto");

    await createMcpServer({
      workspaceId: "ws-1",
      userId: "user-1",
      name: "Test",
      transport: "sse",
      url: "https://example.com",
      headers: { Authorization: "Bearer secret" },
    });

    expect(encryptValue).toHaveBeenCalledWith("Bearer secret");
  });

  it("encrypts env vars on create", async () => {
    dbModule._c.returning.mockResolvedValueOnce([fakeSseServer]);
    const { encryptValue } = await import("@/lib/crypto");

    await createMcpServer({
      workspaceId: "ws-1",
      userId: "user-1",
      name: "Test",
      transport: "stdio",
      command: "node server.js",
      env: { API_KEY: "secret" },
    });

    expect(encryptValue).toHaveBeenCalledWith("secret");
  });
});

// ─── updateMcpServer ──────────────────────────────────────────────────

describe("updateMcpServer", () => {
  it("throws when server not found", async () => {
    await expect(
      updateMcpServer({
        serverId: "srv-1",
        workspaceId: "ws-1",
        userId: "user-1",
        transport: "sse",
        url: "https://example.com",
      }),
    ).rejects.toThrow("MCP server not found");
  });

  it("throws when switching to sse without url", async () => {
    dbModule._c.limit.mockResolvedValueOnce([{ ...fakeStdioServer }]);

    await expect(
      updateMcpServer({
        serverId: "srv-2",
        workspaceId: "ws-1",
        userId: "user-1",
        transport: "sse",
      }),
    ).rejects.toThrow("URL is required for remote transport");
  });

  it("throws when switching to stdio without command", async () => {
    dbModule._c.limit.mockResolvedValueOnce([{ ...fakeSseServer }]);

    await expect(
      updateMcpServer({
        serverId: "srv-1",
        workspaceId: "ws-1",
        userId: "user-1",
        transport: "stdio",
        command: "",
      }),
    ).rejects.toThrow("Command is required for stdio transport");
  });

  it("updates server fields and returns updated server", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
    dbModule._c.returning.mockResolvedValueOnce([
      { ...fakeSseServer, name: "Updated" },
    ]);

    const result = await updateMcpServer({
      serverId: "srv-1",
      workspaceId: "ws-1",
      userId: "user-1",
      name: "Updated",
    });

    expect(result).toEqual({ ...fakeSseServer, name: "Updated" });
  });

  it("merges encrypted headers when updating existing headers", async () => {
    dbModule._c.limit.mockResolvedValueOnce([
      { ...fakeSseServer, encryptedHeadersJson: { Authorization: "enc:old" } },
    ]);
    dbModule._c.returning.mockResolvedValueOnce([fakeSseServer]);
    const { decryptValue, encryptValue } = await import("@/lib/crypto");

    await updateMcpServer({
      serverId: "srv-1",
      workspaceId: "ws-1",
      userId: "user-1",
      headers: { "X-New": "new-value" },
    });

    expect(decryptValue).toHaveBeenCalledWith("enc:old");
    expect(encryptValue).toHaveBeenCalledWith("new-value");
  });
});

// ─── archiveMcpServer ─────────────────────────────────────────────────

describe("archiveMcpServer", () => {
  it("throws when server not found", async () => {
    await expect(archiveMcpServer("srv-1", "ws-1", "user-1")).rejects.toThrow(
      "MCP server not found",
    );
  });

  it("sets archivedAt and disables server", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);

    await archiveMcpServer("srv-1", "ws-1", "user-1");

    expect(dbModule.db.update).toHaveBeenCalled();
  });
});

// ─── listMcpTools ─────────────────────────────────────────────────────

describe("listMcpTools", () => {
  it("throws when server not found", async () => {
    await expect(listMcpTools("srv-1", "ws-1")).rejects.toThrow(
      "MCP server not found",
    );
  });

  it("returns tools ordered by name", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
    dbModule._c.orderBy.mockResolvedValueOnce([fakeTool]);

    const tools = await listMcpTools("srv-1", "ws-1");
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("search");
  });
});

// ─── syncMcpTools ─────────────────────────────────────────────────────

describe("syncMcpTools", () => {
  it("throws when server not found", async () => {
    await expect(syncMcpTools("srv-1", "ws-1", "user-1")).rejects.toThrow(
      "MCP server not found",
    );
  });

  it("returns manual status for stdio transport", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeStdioServer]);

    const result = await syncMcpTools("srv-2", "ws-1", "user-1");
    expect(result.status).toBe("manual");
    expect(result.discovered).toBe(0);
  });

  it("syncs tools for SSE transport", async () => {
    // Q1 (getMcpServer): .where() chains → .limit() terminal
    // Q2 (existing tools): .where() terminal
    dbModule._c.where
      .mockReturnValueOnce(dbModule._c) // Q1: keep chain for .limit()
      .mockResolvedValueOnce([]); // Q2: existing tools
    dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
    vi.mocked(listRemoteMcpTools).mockResolvedValueOnce([
      { name: "search", description: "Search" },
    ] as never);

    const result = await syncMcpTools("srv-1", "ws-1", "user-1");
    expect(result.discovered).toBe(1);
    expect(result.status).toBe("healthy");
  });

  it("returns unhealthy status when remote call fails", async () => {
    dbModule._c.where
      .mockReturnValueOnce(dbModule._c)
      .mockResolvedValueOnce([]);
    dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
    vi.mocked(listRemoteMcpTools).mockRejectedValueOnce(
      new Error("Connection refused"),
    );

    const result = await syncMcpTools("srv-1", "ws-1", "user-1");
    expect(result.status).toBe("unhealthy");
    expect(result.discovered).toBe(0);
  });

  it("preserves per-tool requireApproval from existing tools", async () => {
    dbModule._c.where
      .mockReturnValueOnce(dbModule._c) // Q1: getMcpServer where
      .mockResolvedValueOnce([{ name: "search", requireApproval: true }]); // Q2: existing tools
    dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
    vi.mocked(listRemoteMcpTools).mockResolvedValueOnce([
      { name: "search", description: "Search" },
    ] as never);

    await syncMcpTools("srv-1", "ws-1", "user-1");

    // Check the insert values included requireApproval=true for "search"
    expect(dbModule._tx.values).toHaveBeenCalled();
    const insertedTools = dbModule._tx.values.mock.calls[0][0];
    const searchTool = (
      insertedTools as Array<{ name: string; requireApproval: boolean }>
    ).find((t) => t.name === "search");
    expect(searchTool?.requireApproval).toBe(true);
  });
});

// ─── testMcpConnection ────────────────────────────────────────────────

describe("testMcpConnection", () => {
  it("throws when server not found", async () => {
    await expect(testMcpConnection("srv-1", "ws-1", "user-1")).rejects.toThrow(
      "MCP server not found",
    );
  });

  it("returns manual status for stdio transport", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeStdioServer]);

    const result = await testMcpConnection("srv-2", "ws-1", "user-1");
    expect(result.status).toBe("manual");
  });

  it("returns healthy with tool count message", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
    vi.mocked(listRemoteMcpTools).mockResolvedValueOnce([
      { name: "search" },
    ] as never);

    const result = await testMcpConnection("srv-1", "ws-1", "user-1");
    expect(result.status).toBe("healthy");
    expect(result.message).toContain("1 tools available");
  });

  it("returns healthy with no-tools message", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
    vi.mocked(listRemoteMcpTools).mockResolvedValueOnce([]);

    const result = await testMcpConnection("srv-1", "ws-1", "user-1");
    expect(result.status).toBe("healthy");
    expect(result.message).toContain("no tools returned");
  });

  it("returns unhealthy status when connection fails", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
    vi.mocked(listRemoteMcpTools).mockRejectedValueOnce(new Error("Timeout"));

    const result = await testMcpConnection("srv-1", "ws-1", "user-1");
    expect(result.status).toBe("unhealthy");
    expect(result.message).toBe("Timeout");
  });
});

// ─── updateMcpTool ────────────────────────────────────────────────────

describe("updateMcpTool", () => {
  it("throws when server not found", async () => {
    await expect(
      updateMcpTool({
        toolId: "tool-1",
        serverId: "srv-1",
        workspaceId: "ws-1",
        userId: "user-1",
        enabled: true,
      }),
    ).rejects.toThrow("MCP server not found");
  });

  it("throws when no updates provided", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);

    await expect(
      updateMcpTool({
        toolId: "tool-1",
        serverId: "srv-1",
        workspaceId: "ws-1",
        userId: "user-1",
      }),
    ).rejects.toThrow("No updates provided");
  });

  it("throws when tool not found after update", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
    // update().returning() returns empty
    dbModule._c.returning.mockResolvedValueOnce([]);

    await expect(
      updateMcpTool({
        toolId: "tool-1",
        serverId: "srv-1",
        workspaceId: "ws-1",
        userId: "user-1",
        enabled: true,
      }),
    ).rejects.toThrow("MCP tool not found");
  });

  it("returns updated tool", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
    dbModule._c.returning.mockResolvedValueOnce([
      { ...fakeTool, enabled: false },
    ]);

    const result = await updateMcpTool({
      toolId: "tool-1",
      serverId: "srv-1",
      workspaceId: "ws-1",
      userId: "user-1",
      enabled: false,
      requireApproval: true,
    });

    expect(result).toEqual({ ...fakeTool, enabled: false });
  });
});
