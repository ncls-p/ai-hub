import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/infrastructure/ai-sdk/devtools", () => ({
  registerAiSdkDevTools: vi.fn(),
}));

vi.mock("@/server/domain/services/audit", () => ({
  audit: { emit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/crypto", () => ({
  encryptValue: vi.fn().mockResolvedValue("encrypted-payload"),
  decryptValue: vi.fn().mockResolvedValue("decrypted-value"),
}));

vi.mock("@/modules/mcp/client", () => ({
  callRemoteMcpTool: vi.fn().mockResolvedValue({ id: "wf-1" }),
}));

vi.mock("@/modules/mcp/use-cases", () => ({
  getMcpServer: vi.fn().mockResolvedValue({
    id: "mcp-1",
    workspaceId: "ws-1",
    name: "n8n",
    transport: "sse",
    url: "https://example.test/sse",
    enabled: true,
  }),
}));

vi.mock("@/server/infrastructure/providers", () => ({
  getAdapter: vi.fn().mockReturnValue({
    createChatModel: vi.fn().mockReturnValue({ model: "runtime-model" }),
  }),
}));

vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({ text: "Automation ready." }),
  stepCountIs: vi.fn((steps) => ({ type: "step-count", steps })),
  tool: vi.fn((definition) => definition),
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
  onConflictDoUpdate: ReturnType<typeof vi.fn>;
};

function makeChain(): Chain {
  const c = {} as Chain;
  for (const key of [
    "select",
    "insert",
    "update",
    "delete",
    "from",
    "where",
    "orderBy",
    "values",
    "set",
    "onConflictDoUpdate",
  ] as const) {
    c[key] = vi.fn().mockReturnThis();
  }
  c.limit = vi.fn().mockResolvedValue([]);
  c.returning = vi.fn().mockResolvedValue([]);
  return c;
}

type DbModule = {
  db: {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
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
    },
    _c: chain,
  };
});

import { decryptValue } from "@/lib/crypto";
import {
  deleteCustomTool,
  listCustomTools,
} from "@/modules/custom-tools/use-cases";
import { callRemoteMcpTool } from "@/modules/mcp/client";
import * as _dbModule from "@/server/infrastructure/db";
import { generateText } from "ai";

const dbModule = _dbModule as unknown as DbModule;

function resetDb() {
  for (const key of [
    "select",
    "insert",
    "update",
    "delete",
    "from",
    "where",
    "orderBy",
    "values",
    "set",
    "onConflictDoUpdate",
  ] as const) {
    dbModule._c[key].mockReset().mockReturnThis();
  }
  dbModule._c.limit.mockReset().mockResolvedValue([]);
  dbModule._c.returning.mockReset().mockResolvedValue([]);
  dbModule.db.select.mockReset().mockReturnValue(dbModule._c);
  dbModule.db.insert.mockReset().mockReturnValue(dbModule._c);
  dbModule.db.update.mockReset().mockReturnValue(dbModule._c);
  dbModule.db.delete.mockReset().mockReturnValue(dbModule._c);
}

const enabledConfig = {
  enabled: true,
  providerId: "11111111-1111-4111-8111-111111111111",
  modelId: "22222222-2222-4222-8222-222222222222",
  n8nMcpServerId: "33333333-3333-4333-8333-333333333333",
  createWorkflowToolName: "n8n_create_workflow",
  validateWorkflowToolName: "n8n_validate_workflow",
  activateWorkflowToolName: "n8n_update_partial_workflow",
  credentialToolName: "n8n_manage_credentials",
  allowWorkflowActivation: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
  vi.mocked(generateText).mockResolvedValue({
    text: "Automation ready.",
  } as never);
  vi.mocked(callRemoteMcpTool).mockResolvedValue({
    content: [{ type: "text", text: JSON.stringify({ id: "wf-1" }) }],
  });
  vi.mocked(decryptValue).mockResolvedValue("decrypted-value");
});

describe("custom tool listing and deletion", () => {
  it("lists only accessible tools and marks editable tools", async () => {
    dbModule._c.orderBy.mockResolvedValueOnce([
      {
        workspaceId: "ws-1",
        id: "own",
        createdById: "user-1",
        isGlobal: false,
        name: "Own",
      },
      {
        workspaceId: "ws-1",
        id: "global",
        createdById: "other",
        isGlobal: true,
        name: "Global",
      },
      {
        workspaceId: "ws-1",
        id: "other",
        createdById: "other",
        isGlobal: false,
        name: "Other",
      },
    ]);

    const result = await listCustomTools("ws-1", "user-1", true);

    expect(result.map((item) => item.canEdit)).toEqual([true, true]);
  });

  it("throws when deleting an absent or unauthorized custom tool", async () => {
    dbModule._c.limit
      .mockResolvedValueOnce([{ valueJson: enabledConfig }])
      .mockResolvedValueOnce([]);

    await expect(
      deleteCustomTool({
        workspaceId: "ws-1",
        userId: "user-1",
        customToolId: "missing",
      }),
    ).rejects.toThrow("Custom tool not found");

    resetDb();
    dbModule._c.limit
      .mockResolvedValueOnce([{ valueJson: enabledConfig }])
      .mockResolvedValueOnce([
        { id: "tool-1", createdById: "other", isGlobal: false },
      ]);
    await expect(
      deleteCustomTool({
        workspaceId: "ws-1",
        userId: "user-1",
        customToolId: "tool-1",
      }),
    ).rejects.toThrow("Custom tool not found");
  });

  it("archives editable tools and reports workflow deletion failures", async () => {
    dbModule._c.limit
      .mockResolvedValueOnce([{ valueJson: enabledConfig }])
      .mockResolvedValueOnce([
        {
          id: "tool-1",
          createdById: "user-1",
          isGlobal: false,
          n8nWorkflowId: "wf-1",
        },
      ]);
    dbModule._c.where
      .mockReturnValueOnce(dbModule._c)
      .mockReturnValueOnce(dbModule._c)
      .mockResolvedValueOnce([{ name: "n8n_delete_workflow" }]);
    vi.mocked(callRemoteMcpTool).mockRejectedValueOnce(
      new Error("remote down"),
    );

    const result = await deleteCustomTool({
      workspaceId: "ws-1",
      userId: "user-1",
      customToolId: "tool-1",
    });

    expect(result).toEqual({
      deleted: true,
      workflowDeleted: false,
      workflowDeleteError: "remote down",
    });
    expect(dbModule.db.update).toHaveBeenCalled();
  });
});
