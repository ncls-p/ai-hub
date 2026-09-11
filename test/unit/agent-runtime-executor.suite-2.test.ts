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
  it("recovers an empty final turn from successful tool results without calling another tool", async () => {
    mocks.getActiveVersion.mockResolvedValueOnce({
      ...rootVersion,
      maxToolCalls: 1,
    });
    mocks.buildBoundTools.mockResolvedValueOnce({
      tools: {
        deepwiki: {
          execute: vi.fn(async () => ({ result: "Australia release notes" })),
        },
      },
      toolApproval: undefined,
    });
    const incompatibleProviderMessages = [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "deepwiki-call",
            toolName: "deepwiki",
            input: { question: "Latest ServiceNow release" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "deepwiki-call",
            toolName: "deepwiki",
            output: { type: "text", value: "Australia release notes" },
          },
        ],
      },
    ];
    mocks.generateText
      .mockResolvedValueOnce({
        text: "",
        usage: { inputTokens: 10, outputTokens: 1 },
        toolResults: [
          {
            type: "tool-result",
            toolCallId: "deepwiki-call",
            toolName: "deepwiki",
            output: {
              result: "Australia release notes",
              apiKey: "must-not-cross-the-recovery-boundary",
            },
          },
        ],
        responseMessages: incompatibleProviderMessages,
      })
      .mockResolvedValueOnce({
        text: "ServiceNow Australia is the latest release.",
        usage: { inputTokens: 20, outputTokens: 5 },
      });

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Parle-moi des dernières mises à jour ServiceNow",
        trigger: "api",
      }),
    ).resolves.toMatchObject({
      text: "ServiceNow Australia is the latest release.",
      inputTokens: 30,
      outputTokens: 6,
      totalTreeTokens: 36,
    });

    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    const recoveryCall = mocks.generateText.mock.calls[1][0];
    expect(recoveryCall).toEqual(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            role: "user",
            content: expect.stringContaining("Australia release notes"),
          }),
        ],
        telemetry: expect.objectContaining({
          functionId: "ai-hub.agent-run.empty-response-recovery",
        }),
      }),
    );
    expect(recoveryCall).not.toHaveProperty("prompt");
    expect(recoveryCall).not.toHaveProperty("tools");
    const recoveryPrompt = recoveryCall.messages[0].content;
    expect(recoveryPrompt).toContain("[REDACTED]");
    expect(recoveryPrompt).not.toContain(
      "must-not-cross-the-recovery-boundary",
    );
    expect(mocks.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 30,
        outputTokens: 6,
        reservationTokens: 36,
      }),
    );
    expect(mocks.appendStep).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "model",
        status: "success",
        outputPreview: expect.objectContaining({
          recoveredFromEmptyResponse: true,
        }),
      }),
    );
  });

  it("returns the safe tool result when the tool-free recovery also returns no text", async () => {
    mocks.getActiveVersion.mockResolvedValueOnce({
      ...rootVersion,
      maxToolCalls: 1,
    });
    mocks.buildBoundTools.mockResolvedValueOnce({
      tools: { lookup: { execute: vi.fn() } },
      toolApproval: undefined,
    });
    mocks.generateText
      .mockResolvedValueOnce({
        text: "",
        usage: { inputTokens: 4, outputTokens: 0 },
        toolResults: [{ toolName: "lookup", output: { answer: 42 } }],
        responseMessages: [],
      })
      .mockResolvedValueOnce({
        text: "   ",
        usage: { inputTokens: 5, outputTokens: 0 },
      });

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Use lookup",
        trigger: "api",
      }),
    ).resolves.toMatchObject({
      text: "42",
      inputTokens: 9,
      outputTokens: 0,
      totalTreeTokens: 9,
    });
    expect(mocks.completeRun).toHaveBeenCalled();
    expect(mocks.appendStep).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "model",
        status: "success",
        outputPreview: expect.objectContaining({
          recoveredFromEmptyResponse: false,
          recoveredFromToolResult: true,
        }),
      }),
    );
  });
});

vi.mock("@/modules/usage/limited-language-model", () => ({
  applyUsageLimits: async (model: unknown) => model,
}));
