import { executeAgent } from "@/modules/agent/runtime-executor";
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
  it("records successful and failed bound tool executions", async () => {
    mocks.getActiveVersion.mockResolvedValueOnce({
      ...rootVersion,
      maxToolCalls: 3,
    });
    mocks.buildBoundTools.mockResolvedValueOnce({
      tools: {
        lookup: {
          execute: vi.fn(async () => ({ answer: 42 })),
        },
        unstable: {
          execute: vi.fn(async () => {
            throw new Error("upstream unavailable");
          }),
        },
        metadata_only: { description: "No executable handler" },
      },
      toolApproval: undefined,
    });
    mocks.generateText.mockImplementationOnce(async (options) => {
      const tools = options.tools as Record<
        string,
        { execute?: (input: unknown) => Promise<unknown> }
      >;
      await expect(
        tools.lookup.execute?.({ query: "status" }),
      ).resolves.toEqual({ answer: 42 });
      await expect(
        tools.unstable.execute?.({ query: "status" }),
      ).rejects.toThrow("upstream unavailable");
      expect(tools.metadata_only).toEqual({
        description: "No executable handler",
      });
      return {
        text: "Completed with tools",
        usage: { inputTokens: 4, outputTokens: 5 },
      };
    });
    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Use the tools",
        trigger: "api",
      }),
    ).resolves.toMatchObject({ text: "Completed with tools" });
    expect(mocks.appendStep).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "tool",
        status: "success",
        name: "lookup",
      }),
    );
    expect(mocks.appendStep).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "tool",
        status: "failed",
        name: "unstable",
      }),
    );
  });
  it("emits parent tool lifecycle progress without waiting for or trusting the observer", async () => {
    const onProgress = vi
      .fn()
      .mockReturnValueOnce(new Promise<void>(() => undefined))
      .mockRejectedValueOnce(new Error("progress subscriber unavailable"));
    mocks.getActiveVersion.mockResolvedValueOnce({
      ...rootVersion,
      maxToolCalls: 1,
    });
    mocks.generateText.mockImplementationOnce(async (options) => {
      const toolCall = {
        type: "tool-call" as const,
        toolCallId: "lookup-call",
        toolName: "lookup",
        input: { query: "status" },
        dynamic: false,
      };
      await options.onToolExecutionStart?.({
        callId: "model-call",
        messages: [],
        toolCall,
        toolContext: undefined,
      });
      await options.onToolExecutionEnd?.({
        callId: "model-call",
        messages: [],
        toolCall,
        toolContext: undefined,
        toolExecutionMs: 27,
        toolOutput: {
          ...toolCall,
          type: "tool-result",
          output: { answer: 42 },
        },
      });
      return {
        text: "Completed with progress",
        usage: { inputTokens: 4, outputTokens: 5 },
      };
    });
    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Use lookup",
        trigger: "api",
        onProgress,
      }),
    ).resolves.toMatchObject({ text: "Completed with progress" });
    const context = {
      id: "77777777-7777-4777-8777-777777777777:lookup-call",
      toolCallId: "lookup-call",
      toolName: "lookup",
      agentName: rootAgent.name,
      agentId: rootAgent.id,
      runId: "77777777-7777-4777-8777-777777777777",
      parentRunId: null,
      depth: 0,
    };
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      ...context,
      type: "tool-start",
      input: { query: "status" },
    });
    expect(onProgress).toHaveBeenNthCalledWith(2, {
      ...context,
      type: "tool-end",
      durationMs: 27,
      output: { answer: 42 },
    });
  });
  it("emits a safe tool error in lifecycle progress", async () => {
    const onProgress = vi.fn();
    mocks.generateText.mockImplementationOnce(async (options) => {
      const toolCall = {
        type: "tool-call" as const,
        toolCallId: "unstable-call",
        toolName: "unstable",
        input: { query: "status" },
        dynamic: false,
      };
      await options.onToolExecutionEnd?.({
        callId: "model-call",
        messages: [],
        toolCall,
        toolContext: undefined,
        toolExecutionMs: 13,
        toolOutput: {
          ...toolCall,
          type: "tool-error",
          error: new Error("Request failed with Bearer super-secret"),
        },
      });
      return {
        text: "Recovered",
        usage: { inputTokens: 2, outputTokens: 3 },
      };
    });
    await executeAgent({
      workspaceId: rootAgent.workspaceId,
      userId: rootAgent.createdById,
      agentId: rootAgent.id,
      prompt: "Try the unstable tool",
      trigger: "api",
      onProgress,
    });
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool-end",
        toolName: "unstable",
        durationMs: 13,
        error: "Request failed with Bearer [REDACTED]",
      }),
    );
    expect(JSON.stringify(onProgress.mock.calls)).not.toContain("super-secret");
  });
});

vi.mock("@/modules/usage/limited-language-model", () => ({
  applyUsageLimits: async (model: unknown) => model,
}));
