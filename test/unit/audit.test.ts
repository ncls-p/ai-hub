import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── DB mock ────────────────────────────────────────────────────────────

type InsertChain = {
  values: ReturnType<typeof vi.fn>;
};

type DbMock = {
  insert: ReturnType<typeof vi.fn>;
};

type DbModule = {
  db: DbMock;
  _insertChain: InsertChain;
};

vi.mock("@/server/infrastructure/db", () => {
  const insertChain: InsertChain = {
    values: vi.fn().mockResolvedValue(undefined),
  };
  return {
    db: {
      insert: vi.fn(),
    },
    _insertChain: insertChain,
  };
});

vi.mock("@/lib/logger", () => ({
  logHandledError: vi.fn(),
  logHandledWarning: vi.fn(),
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import * as _dbModule from "@/server/infrastructure/db";
const dbModule = _dbModule as unknown as DbModule;
import { audit } from "@/server/domain/services/audit";
import { logHandledError } from "@/lib/logger";

beforeEach(() => {
  vi.clearAllMocks();
  dbModule.db.insert.mockReturnValue(dbModule._insertChain);
  dbModule._insertChain.values.mockResolvedValue(undefined);
});

describe("audit.emit", () => {
  it("inserts an audit event into the database", async () => {
    await audit.emit({
      workspaceId: "ws-1",
      actorPrincipalType: "user",
      actorPrincipalId: "user-1",
      action: "agent.created",
      resourceType: "agent",
      resourceId: "agent-1",
      outcome: "success",
    });

    expect(dbModule.db.insert).toHaveBeenCalledOnce();
    expect(dbModule._insertChain.values).toHaveBeenCalledOnce();
  });

  it("includes all provided fields in the insert", async () => {
    await audit.emit({
      organizationId: "org-1",
      workspaceId: "ws-1",
      actorPrincipalType: "api_key",
      actorPrincipalId: "key-1",
      action: "workspace.updated",
      resourceType: "workspace",
      resourceId: "ws-1",
      outcome: "success",
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
      metadata: { key: "value" },
    });

    const insertedValues = dbModule._insertChain.values.mock.calls[0][0];
    expect(insertedValues.organizationId).toBe("org-1");
    expect(insertedValues.workspaceId).toBe("ws-1");
    expect(insertedValues.actorPrincipalType).toBe("api_key");
    expect(insertedValues.action).toBe("workspace.updated");
    expect(insertedValues.outcome).toBe("success");
    expect(insertedValues.ipAddress).toBe("127.0.0.1");
    expect(insertedValues.metadataJson).toEqual({ key: "value" });
  });

  it("maps missing optional fields to null", async () => {
    await audit.emit({
      action: "system.startup",
      outcome: "success",
    });

    const insertedValues = dbModule._insertChain.values.mock.calls[0][0];
    expect(insertedValues.workspaceId).toBeNull();
    expect(insertedValues.organizationId).toBeNull();
    expect(insertedValues.actorPrincipalType).toBeNull();
    expect(insertedValues.ipAddress).toBeNull();
    expect(insertedValues.metadataJson).toBeNull();
  });

  it("does not throw when the database insert fails", async () => {
    dbModule._insertChain.values.mockRejectedValueOnce(
      new Error("DB connection lost"),
    );

    await expect(
      audit.emit({
        action: "agent.created",
        outcome: "success",
      }),
    ).resolves.toBeUndefined();

    expect(logHandledError).toHaveBeenCalledWith(
      "Failed to write audit event",
      expect.objectContaining({ action: "agent.created" }),
    );
  });

  it("logs the action and error message on failure", async () => {
    dbModule._insertChain.values.mockRejectedValueOnce(new Error("timeout"));

    await audit.emit({
      action: "mcp.invoked",
      outcome: "failed",
    });

    expect(logHandledError).toHaveBeenCalledWith(
      "Failed to write audit event",
      expect.objectContaining({
        action: "mcp.invoked",
        error: "timeout",
      }),
    );
  });
});
