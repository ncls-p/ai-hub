import { decryptValue } from "@/lib/crypto";
import { runCustomToolBuilder } from "@/modules/custom-tools/use-cases";
import { callRemoteMcpTool } from "@/modules/mcp/client";
import * as _dbModule from "@/server/infrastructure/db";
import { generateText } from "ai";
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
const providerRow = {
  id: enabledConfig.providerId,
  workspaceId: null,
  name: "OpenAI",
  kind: "openai",
  enabled: true,
  baseUrl: null,
  authType: "bearer",
  encryptedApiKey: "enc-api-key",
  encryptedHeadersJson: { "x-test": "enc-header" },
  queryParamsJson: { beta: "true" },
};
const modelRow = {
  id: enabledConfig.modelId,
  providerId: enabledConfig.providerId,
  modelId: "gpt-4.1-mini",
  displayName: "GPT 4.1 Mini",
  enabled: true,
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
describe("runCustomToolBuilder", () => {
  it("rejects disabled builder, wrong workspace, and missing LLM config", async () => {
    dbModule._c.limit.mockResolvedValueOnce([
      { valueJson: { enabled: false } },
    ]);
    await expect(
      runCustomToolBuilder({
        workspaceId: "ws-1",
        userId: "user-1",
        messages: [],
      }),
    ).rejects.toThrow("Custom tool builder is disabled");
    resetDb();
    dbModule._c.limit.mockResolvedValueOnce([
      {
        valueJson: {
          ...enabledConfig,
          workspaceId: "44444444-4444-4444-8444-444444444444",
        },
      },
    ]);
    await expect(
      runCustomToolBuilder({
        workspaceId: "ws-1",
        userId: "user-1",
        messages: [],
      }),
    ).rejects.toThrow("configured for another workspace");
    resetDb();
    dbModule._c.limit.mockResolvedValueOnce([{ valueJson: { enabled: true } }]);
    await expect(
      runCustomToolBuilder({
        workspaceId: "ws-1",
        userId: "user-1",
        messages: [],
      }),
    ).rejects.toThrow("LLM is not configured");
  });
  it("builds a runtime model and returns the generated response", async () => {
    dbModule._c.limit
      .mockResolvedValueOnce([{ valueJson: enabledConfig }])
      .mockResolvedValueOnce([providerRow])
      .mockResolvedValueOnce([modelRow]);
    dbModule._c.where
      .mockReturnValueOnce(dbModule._c)
      .mockReturnValueOnce(dbModule._c)
      .mockReturnValueOnce(dbModule._c)
      .mockResolvedValueOnce([]);
    const result = await runCustomToolBuilder({
      workspaceId: "ws-1",
      userId: "user-1",
      messages: [{ role: "user", content: "Build a notifier" }],
      credentialRefs: [
        {
          requestId: "req-1",
          credentialRef: "33333333-3333-4333-8333-333333333333",
        },
      ],
    });
    expect(result.message).toBe("Automation ready.");
    expect(result.actionCount).toBe(0);
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: expect.any(AbortSignal),
        maxOutputTokens: 4_000,
        messages: [{ role: "user", content: "Build a notifier" }],
        stopWhen: { type: "step-count", steps: 12 },
        system: expect.stringContaining("custom-tool builder assistant"),
      }),
    );
    expect(decryptValue).toHaveBeenCalledWith("enc-api-key");
    expect(decryptValue).toHaveBeenCalledWith("enc-header");
  });
  it("stops builder side effects at the action budget", async () => {
    vi.mocked(generateText).mockImplementationOnce((async (
      options: unknown,
    ) => {
      const previewTool = (
        options as {
          tools: {
            update_workflow_preview: {
              execute: (input: unknown) => Promise<unknown>;
            };
          };
        }
      ).tools.update_workflow_preview;
      for (let index = 0; index < 21; index += 1) {
        await previewTool.execute({
          title: "Preview",
          summary: "Summary",
          status: "draft",
          steps: [{ label: "Step", description: "Description" }],
        });
      }
      return { text: "never" } as never;
    }) as never);
    dbModule._c.limit
      .mockResolvedValueOnce([{ valueJson: enabledConfig }])
      .mockResolvedValueOnce([providerRow])
      .mockResolvedValueOnce([modelRow]);
    dbModule._c.where
      .mockReturnValueOnce(dbModule._c)
      .mockReturnValueOnce(dbModule._c)
      .mockReturnValueOnce(dbModule._c)
      .mockResolvedValueOnce([]);
    await expect(
      runCustomToolBuilder({
        workspaceId: "ws-1",
        userId: "user-1",
        messages: [{ role: "user", content: "Loop forever" }],
      }),
    ).rejects.toThrow("Custom tool builder action limit reached");
  });
  it("infers a secure Discord webhook request from assistant text", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: "Il me manque le webhook Discord. Clique le bouton sécurisé pour le renseigner.",
    } as never);
    dbModule._c.limit
      .mockResolvedValueOnce([{ valueJson: enabledConfig }])
      .mockResolvedValueOnce([providerRow])
      .mockResolvedValueOnce([modelRow]);
    dbModule._c.where
      .mockReturnValueOnce(dbModule._c)
      .mockReturnValueOnce(dbModule._c)
      .mockReturnValueOnce(dbModule._c)
      .mockResolvedValueOnce([]);
    dbModule._c.returning.mockResolvedValueOnce([
      {
        id: "secret-req-1",
        title: "Connexion Discord",
        description: "desc",
        expiresAt: new Date(Date.now() + 1000),
      },
    ]);
    const result = await runCustomToolBuilder({
      workspaceId: "ws-1",
      userId: "user-1",
      messages: [{ role: "user", content: "Send Discord alerts" }],
    });
    expect(result.secretRequests).toHaveLength(1);
    expect(result.secretRequests[0].fields[0].name).toBe("discord_webhook_url");
    expect(result.actionCount).toBe(1);
  });
});

vi.mock("@/modules/usage/limited-language-model", () => ({
  applyUsageLimits: async (model: unknown) => model,
}));
