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
  it("fails closed when delegation permission is revoked at call time", async () => {
    const onProgress = vi.fn();
    mocks.getVisibleAgent.mockResolvedValueOnce({
      ...rootAgent,
      kind: "orchestrator",
    });
    mocks.getActiveVersion.mockResolvedValueOnce({
      ...rootVersion,
      maxToolCalls: 2,
      orchestrationPolicyJson: {
        maxDepth: 2,
        maxDelegations: 2,
        maxParallel: 1,
        maxChildSteps: 2,
        maxTotalTokens: 5_000,
        timeoutMs: 30_000,
        resultMaxChars: 2_000,
      },
    });
    mocks.getDelegationBindings.mockResolvedValueOnce([
      {
        childAgentId: "88888888-8888-4888-8888-888888888888",
        childAgentVersionId: "99999999-9999-4999-8999-999999999999",
      },
    ]);
    mocks.checkPermission
      .mockResolvedValueOnce({ granted: true })
      .mockResolvedValueOnce({
        granted: false,
        reason: "Missing permission: agents.delegate",
      });
    mocks.generateText.mockImplementationOnce(async (options) => {
      const [toolName, delegate] = Object.entries(options.tools).find(
        ([name]) => name.startsWith("delegate_"),
      ) as [string, { execute: (input: { task: string }) => Promise<unknown> }];
      const toolCall = {
        type: "tool-call" as const,
        toolCallId: "delegate-call",
        toolName,
        input: { task: "Blocked" },
        dynamic: false,
      };
      try {
        await delegate.execute(toolCall.input);
      } catch (error) {
        await options.onToolExecutionEnd?.({
          callId: "model-call",
          messages: [],
          toolCall,
          toolContext: undefined,
          toolExecutionMs: 9,
          toolOutput: {
            ...toolCall,
            type: "tool-error",
            error,
          },
        });
        throw error;
      }
      throw new Error("unreachable");
    });

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Coordinate",
        trigger: "api",
        onProgress,
      }),
    ).rejects.toMatchObject({
      code: "AGENT_DELEGATION_FORBIDDEN",
      message: "The specialist could not complete the delegated task.",
    });
    expect(mocks.getVersion).not.toHaveBeenCalled();
    expect(mocks.failRun).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "AGENT_DELEGATION_FORBIDDEN" }),
    );
    expect(mocks.logWarning).toHaveBeenCalledWith(
      "Specialist delegation failed",
      expect.objectContaining({
        errorCode: "AGENT_DELEGATION_FORBIDDEN",
        errorDetail: "Missing permission: agents.delegate",
      }),
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool-end",
        toolName: "delegate_specialist_1",
        error: "Missing permission: agents.delegate",
        errorCode: "AGENT_DELEGATION_FORBIDDEN",
      }),
    );
  });
});

vi.mock("@/modules/usage/limited-language-model", () => ({
  applyUsageLimits: async (model: unknown) => model,
}));
