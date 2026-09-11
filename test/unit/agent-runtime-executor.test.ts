import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  buildBoundTools: vi.fn(),
  getDelegationBindings: vi.fn(),
  createRun: vi.fn(),
  claimRun: vi.fn(),
  heartbeatRun: vi.fn(),
  appendStep: vi.fn(),
  completeRun: vi.fn(),
  failRun: vi.fn(),
  consumeDelegation: vi.fn(),
  readPayload: vi.fn(),
  getVisibleAgent: vi.fn(),
  getActiveVersion: vi.fn(),
  getVersion: vi.fn(),
  resolveProvider: vi.fn(),
  buildSkillsPrompt: vi.fn(),
  checkPermission: vi.fn(),
  createChatModel: vi.fn(),
  logWarning: vi.fn(),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: mocks.generateText };
});
vi.mock("@/app/api/workspace/[agentId]/chat/route-support", () => ({
  buildBoundTools: mocks.buildBoundTools,
}));
vi.mock("@/modules/agent/delegation-use-cases", () => ({
  getDelegationBindingsForVersion: mocks.getDelegationBindings,
}));
vi.mock("@/modules/agent/run-use-cases", () => ({
  createAgentRun: mocks.createRun,
  claimAgentRun: mocks.claimRun,
  heartbeatAgentRun: mocks.heartbeatRun,
  appendAgentRunStep: mocks.appendStep,
  completeAgentRun: mocks.completeRun,
  failAgentRun: mocks.failRun,
  consumeAgentRunDelegationBudget: mocks.consumeDelegation,
  readAgentRunPayload: mocks.readPayload,
}));
vi.mock("@/modules/agent/use-cases", () => ({
  getVisibleAgentById: mocks.getVisibleAgent,
  getActiveVersion: mocks.getActiveVersion,
  getAgentVersionById: mocks.getVersion,
  resolveProviderForVersion: mocks.resolveProvider,
}));
vi.mock("@/modules/skills/use-cases", () => ({
  buildSkillsRegistryPrompt: mocks.buildSkillsPrompt,
}));
vi.mock("@/server/domain/services/authorization", () => ({
  authorization: { checkPermission: mocks.checkPermission },
}));
vi.mock("@/server/infrastructure/providers", () => ({
  getAdapter: vi.fn(() => ({ createChatModel: mocks.createChatModel })),
}));
vi.mock("@/server/infrastructure/db", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: mocks.logWarning },
}));

import { executeAgent } from "@/modules/agent/runtime-executor";

const rootAgent = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  createdById: "33333333-3333-4333-8333-333333333333",
  name: "Root agent",
  kind: "assistant",
};
const rootVersion = {
  id: "44444444-4444-4444-8444-444444444444",
  agentId: rootAgent.id,
  systemPrompt: "Help",
  maxToolCalls: 0,
  maxOutputTokens: 4_000,
  orchestrationPolicyJson: null,
  approvalPolicyJson: null,
};
const provider = {
  providerId: "55555555-5555-4555-8555-555555555555",
  modelRecordId: "66666666-6666-4666-8666-666666666666",
  modelId: "model-api-id",
  providerKind: "openai",
  runtimeConfig: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkPermission.mockResolvedValue({ granted: true });
  mocks.getVisibleAgent.mockResolvedValue(rootAgent);
  mocks.getActiveVersion.mockResolvedValue(rootVersion);
  mocks.getVersion.mockResolvedValue(rootVersion);
  mocks.resolveProvider.mockResolvedValue(provider);
  mocks.createChatModel.mockReturnValue({ modelId: "test-model" });
  mocks.createRun.mockResolvedValue({
    run: { id: "77777777-7777-4777-8777-777777777777", status: "queued" },
    reused: false,
  });
  mocks.claimRun.mockResolvedValue({ id: "run", status: "running" });
  mocks.heartbeatRun.mockResolvedValue(true);
  mocks.buildBoundTools.mockResolvedValue({
    tools: {},
    toolApproval: undefined,
  });
  mocks.getDelegationBindings.mockResolvedValue([]);
  mocks.buildSkillsPrompt.mockResolvedValue(null);
  mocks.generateText.mockResolvedValue({
    text: "Completed",
    usage: { inputTokens: 10, outputTokens: 20 },
  });
  mocks.completeRun.mockResolvedValue({ status: "success" });
  mocks.failRun.mockResolvedValue(null);
  mocks.consumeDelegation.mockResolvedValue(1);
});

describe("agent runtime executor", () => {
  it("rejects agents and versions that are not visible", async () => {
    mocks.getVisibleAgent.mockResolvedValueOnce(null);

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Hello",
        trigger: "api",
      }),
    ).rejects.toMatchObject({ code: "AGENT_NOT_FOUND" });

    mocks.getVisibleAgent.mockResolvedValueOnce(rootAgent);
    mocks.getActiveVersion.mockResolvedValueOnce({
      ...rootVersion,
      agentId: "another-agent",
    });
    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Hello",
        trigger: "api",
      }),
    ).rejects.toMatchObject({ code: "AGENT_VERSION_NOT_FOUND" });
  });

  it("checks chat permission before creating a run", async () => {
    mocks.checkPermission.mockResolvedValueOnce({
      granted: false,
      reason: "Missing permission: agents.chat",
    });

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Hello",
        trigger: "api",
      }),
    ).rejects.toMatchObject({ code: "AGENT_RUN_FORBIDDEN" });
    expect(mocks.createRun).not.toHaveBeenCalled();
  });

  it("executes and settles a bounded root run", async () => {
    const messages = [
      { role: "system" as const, content: "Earlier conversation summary" },
      { role: "user" as const, content: "Current follow-up" },
    ];
    const result = await executeAgent({
      workspaceId: rootAgent.workspaceId,
      userId: rootAgent.createdById,
      agentId: rootAgent.id,
      prompt: "Hello",
      messages,
      trigger: "api",
    });

    expect(result).toMatchObject({
      text: "Completed",
      inputTokens: 10,
      outputTokens: 20,
      totalTreeTokens: 30,
    });
    expect(mocks.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({ reservationTokens: 30 }),
    );
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: "Help",
        allowSystemInMessages: true,
        messages,
      }),
    );
    expect(mocks.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: expect.objectContaining({ operation: "api" }),
      }),
    );
  });

  it("honors the output limit advertised by the selected model", async () => {
    mocks.resolveProvider.mockResolvedValueOnce({
      ...provider,
      maxOutputTokens: 2_048,
    });

    await executeAgent({
      workspaceId: rootAgent.workspaceId,
      userId: rootAgent.createdById,
      agentId: rootAgent.id,
      prompt: "Hello",
      trigger: "api",
    });

    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 2_048 }),
    );
  });

  it("fails explicitly when the model loop ends without a final answer", async () => {
    mocks.generateText.mockResolvedValueOnce({
      text: "   ",
      usage: { inputTokens: 4, outputTokens: 0 },
    });

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Hello",
        trigger: "api",
      }),
    ).rejects.toMatchObject({ code: "AGENT_EMPTY_RESPONSE" });
    expect(mocks.completeRun).not.toHaveBeenCalled();
    expect(mocks.failRun).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "AGENT_EMPTY_RESPONSE" }),
    );
  });
});

vi.mock("@/modules/usage/limited-language-model", () => ({
  applyUsageLimits: async (model: unknown) => model,
}));
