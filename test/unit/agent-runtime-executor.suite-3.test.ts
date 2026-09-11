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
  it("returns a completed tool result when final synthesis times out", async () => {
    mocks.getActiveVersion.mockResolvedValueOnce({
      ...rootVersion,
      maxToolCalls: 1,
      toolChoice: "required",
    });
    mocks.buildBoundTools.mockResolvedValueOnce({
      tools: {
        deepwiki: {
          execute: vi.fn(async () => ({
            result: "ServiceNow Australia release notes",
            apiKey: "must-remain-redacted",
          })),
        },
      },
      toolApproval: undefined,
    });
    mocks.generateText.mockImplementationOnce(async (options) => {
      expect(options.toolChoice).toBe("required");
      const tools = options.tools as Record<
        string,
        { execute: (input: unknown) => Promise<unknown> }
      >;
      await tools.deepwiki.execute({
        repoName: "ServiceNow/ServiceNowDocs",
        question: "Latest ServiceNow updates",
      });
      await options.onStepEnd?.({
        usage: { inputTokens: 11, outputTokens: 2 },
      });
      const timeout = new Error("The operation was aborted due to timeout");
      timeout.name = "TimeoutError";
      throw timeout;
    });

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Latest ServiceNow updates",
        trigger: "api",
      }),
    ).resolves.toMatchObject({
      text: "ServiceNow Australia release notes",
      inputTokens: 11,
      outputTokens: 2,
      totalTreeTokens: 13,
    });
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    expect(mocks.failRun).not.toHaveBeenCalled();
    expect(mocks.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 11,
        outputTokens: 2,
        reservationTokens: 13,
      }),
    );
    const modelStep = mocks.appendStep.mock.calls.find(
      ([step]) => step.kind === "model",
    );
    expect(JSON.stringify(modelStep)).not.toContain("must-remain-redacted");
    expect(mocks.appendStep).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "model",
        status: "success",
        outputPreview: expect.objectContaining({
          recoveredFromToolResult: true,
        }),
      }),
    );
  });

  it("does not recover a completed tool result after explicit user cancellation", async () => {
    const controller = new AbortController();
    mocks.getActiveVersion.mockResolvedValueOnce({
      ...rootVersion,
      maxToolCalls: 1,
    });
    mocks.buildBoundTools.mockResolvedValueOnce({
      tools: {
        lookup: {
          execute: vi.fn(async () => ({ result: "must not be returned" })),
        },
      },
      toolApproval: undefined,
    });
    mocks.generateText.mockImplementationOnce(async (options) => {
      const tools = options.tools as Record<
        string,
        { execute: (input: unknown) => Promise<unknown> }
      >;
      await tools.lookup.execute({ query: "value" });
      controller.abort("Cancelled by user");
      const timeout = new Error("The operation was aborted due to timeout");
      timeout.name = "TimeoutError";
      throw timeout;
    });

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Use lookup",
        trigger: "api",
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "AGENT_RUN_CANCELLED" });
    expect(mocks.completeRun).not.toHaveBeenCalled();
    expect(mocks.failRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "cancelled",
        errorCode: "AGENT_RUN_CANCELLED",
      }),
    );
  });

  it("preserves a redacted provider detail for operational logs", async () => {
    mocks.generateText.mockRejectedValueOnce(
      new Error("Provider rejected Bearer super-secret"),
    );

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Hello",
        trigger: "api",
      }),
    ).rejects.toMatchObject({
      code: "AGENT_RUN_FAILED",
      message: "Agent run failed",
      safeDetail: "Provider rejected Bearer [REDACTED]",
    });
  });
});

vi.mock("@/modules/usage/limited-language-model", () => ({
  applyUsageLimits: async (model: unknown) => model,
}));
