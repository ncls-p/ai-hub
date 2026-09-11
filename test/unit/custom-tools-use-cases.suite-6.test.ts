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
  it("executes builder tool callbacks for previews, secrets, workflows, credentials, and registration", async () => {
    const credentialRef = "55555555-5555-4555-8555-555555555555";
    vi.mocked(decryptValue)
      .mockResolvedValueOnce("api-key")
      .mockResolvedValueOnce("header-value")
      .mockResolvedValueOnce(
        JSON.stringify({ webhookUrl: "https://discord.test/webhook" }),
      )
      .mockResolvedValueOnce(JSON.stringify({ token: "secret-token" }));
    vi.mocked(callRemoteMcpTool)
      .mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify({ id: "wf-created" }) }],
      })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "activated" }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "valid" }] })
      .mockResolvedValueOnce({
        structuredContent: { id: "n8n-cred-1" },
        content: [],
      } as never);
    vi.mocked(generateText).mockImplementationOnce((async (
      options: unknown,
    ) => {
      const opts = options as {
        tools: Record<string, { execute: (input: never) => Promise<unknown> }>;
      };
      await opts.tools.update_workflow_preview.execute({
        title: "Discord notifier",
        summary: "Send a message",
        status: "draft",
        steps: [{ label: "Receive", description: "Get input" }],
      } as never);
      await opts.tools.request_user_secrets.execute({
        title: "Discord",
        description: "Webhook",
        fields: [
          {
            name: "webhookUrl",
            label: "Webhook URL",
            type: "secret",
            required: true,
          },
        ],
      } as never);
      await opts.tools.create_n8n_workflow.execute({
        name: "Discord notifier",
        nodes: [
          {
            name: "Internal trigger",
            type: "n8n-nodes-base.executeWorkflowTrigger",
            parameters: { url: `__SECRET:${credentialRef}:webhookUrl__` },
          },
        ],
        connections: {},
        settings: { executionOrder: "v1" },
      } as never);
      await opts.tools.validate_n8n_workflow.execute({
        id: "wf-created",
      } as never);
      await opts.tools.create_n8n_credential_from_ref.execute({
        credentialRef,
        credentialType: "discordWebhookApi",
        name: "Discord webhook",
      } as never);
      await opts.tools.register_custom_tool.execute({
        name: "Discord notifier",
        description: "Notify Discord",
        inputSchema: { type: "object" },
      } as never);
      return { text: "Registered." } as never;
    }) as never);
    dbModule._c.limit
      .mockResolvedValueOnce([
        { valueJson: { ...enabledConfig, allowWorkflowActivation: true } },
      ])
      .mockResolvedValueOnce([providerRow])
      .mockResolvedValueOnce([modelRow])
      .mockResolvedValueOnce([
        { id: credentialRef, encryptedPayload: "enc-payload" },
      ])
      .mockResolvedValueOnce([
        { id: credentialRef, encryptedPayload: "enc-payload" },
      ]);
    dbModule._c.where
      .mockReturnValueOnce(dbModule._c)
      .mockReturnValueOnce(dbModule._c)
      .mockReturnValueOnce(dbModule._c)
      .mockResolvedValueOnce([{ name: "server__n8n_create_workflow" }])
      .mockReturnValueOnce(dbModule._c)
      .mockResolvedValueOnce([{ name: "server__n8n_create_workflow" }])
      .mockResolvedValueOnce([{ name: "server__n8n_update_partial_workflow" }])
      .mockResolvedValueOnce([{ name: "server__n8n_validate_workflow" }])
      .mockReturnValueOnce(dbModule._c)
      .mockResolvedValueOnce([{ name: "server__n8n_manage_credentials" }]);
    dbModule._c.returning
      .mockResolvedValueOnce([
        {
          id: "secret-request-1",
          title: "Discord",
          description: "Webhook",
          expiresAt: new Date(Date.now() + 1000),
        },
      ])
      .mockResolvedValueOnce([
        { id: "tool-1", name: "Discord notifier", status: "workflow_created" },
      ]);
    const result = await runCustomToolBuilder({
      workspaceId: "ws-1",
      userId: "user-1",
      messages: [{ role: "user", content: "Build it" }],
      credentialRefs: [{ requestId: "req-1", credentialRef }],
      isGlobal: true,
    });
    expect(result.message).toBe("Registered.");
    expect(result.secretRequests).toHaveLength(1);
    expect(result.createdWorkflows).toHaveLength(1);
    expect(result.workflowPreviews).toHaveLength(1);
    expect(result.registeredTools).toEqual([
      { id: "tool-1", name: "Discord notifier", status: "workflow_created" },
    ]);
    expect(result.progressEvents.map((event) => event.label)).toContain(
      "Tool enregistré",
    );
    expect(callRemoteMcpTool).toHaveBeenCalledWith(
      expect.any(Object),
      "server__n8n_create_workflow",
      expect.objectContaining({ name: "Discord notifier" }),
    );
  });
});

vi.mock("@/modules/usage/limited-language-model", () => ({
  applyUsageLimits: async (model: unknown) => model,
}));
