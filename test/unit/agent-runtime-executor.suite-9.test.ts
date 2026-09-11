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
  it("retains the parent recovery after a specialist exceeds the tree token budget", async () => {
    const childAgent = {
      ...rootAgent,
      id: "88888888-8888-4888-8888-888888888888",
      kind: "assistant",
    };
    const childVersion = {
      ...rootVersion,
      id: "99999999-9999-4999-8999-999999999999",
      agentId: childAgent.id,
    };
    mocks.getVisibleAgent
      .mockResolvedValueOnce({ ...rootAgent, kind: "orchestrator" })
      .mockResolvedValueOnce(childAgent);
    mocks.getActiveVersion.mockResolvedValueOnce({
      ...rootVersion,
      maxToolCalls: 2,
      orchestrationPolicyJson: {
        maxDepth: 2,
        maxDelegations: 2,
        maxParallel: 1,
        maxChildSteps: 2,
        maxTotalTokens: 1_000,
        timeoutMs: 30_000,
        resultMaxChars: 2_000,
      },
    });
    mocks.getVersion.mockResolvedValueOnce(childVersion);
    mocks.getDelegationBindings.mockResolvedValueOnce([
      {
        childAgentId: childAgent.id,
        childAgentVersionId: childVersion.id,
      },
    ]);
    mocks.createRun
      .mockResolvedValueOnce({
        run: {
          id: "77777777-7777-4777-8777-777777777777",
          status: "queued",
        },
        reused: false,
      })
      .mockResolvedValueOnce({
        run: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          status: "queued",
        },
        reused: false,
      });
    let call = 0;
    mocks.generateText.mockImplementation(async (options) => {
      call += 1;
      if (call === 1) {
        const delegate = Object.entries(options.tools).find(([name]) =>
          name.startsWith("delegate_"),
        )?.[1] as {
          execute: (input: { task: string }) => Promise<unknown>;
        };
        await expect(
          delegate.execute({ task: "Research" }),
        ).rejects.toMatchObject({ code: "AGENT_TOKEN_BUDGET_EXCEEDED" });
        return {
          text: "The specialist exceeded its budget; retry with a narrower task.",
          usage: { inputTokens: 10, outputTokens: 12 },
        };
      }
      return {
        text: "Oversized specialist result",
        usage: { inputTokens: 1_100, outputTokens: 5 },
      };
    });

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Coordinate",
        trigger: "api",
      }),
    ).resolves.toMatchObject({
      text: "The specialist exceeded its budget; retry with a narrower task.",
      totalTreeTokens: 1_127,
    });
    expect(mocks.failRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        errorCode: "AGENT_TOKEN_BUDGET_EXCEEDED",
      }),
    );
    expect(mocks.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "77777777-7777-4777-8777-777777777777",
        reservationTokens: 1_127,
      }),
    );
  });
});

vi.mock("@/modules/usage/limited-language-model", () => ({
  applyUsageLimits: async (model: unknown) => model,
}));
