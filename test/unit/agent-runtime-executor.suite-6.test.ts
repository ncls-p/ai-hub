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
vi.mock("@/lib/logger", () => ({ logger: { warn: mocks.logWarning } }));

import { executeAgent } from "@/modules/agent/runtime-executor";

import {
  childAgent,
  childVersion,
  orchestrator,
  orchestratorVersion,
  provider,
  rootAgent,
  rootVersion,
} from "./agent-runtime-executor.suite-6.fixture";

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
  it("fails closed when an orchestrator delegates an attachment outside its authorized set", async () => {
    mocks.getVisibleAgent.mockResolvedValueOnce(orchestrator);
    mocks.getActiveVersion.mockResolvedValueOnce(orchestratorVersion);
    mocks.getDelegationBindings.mockResolvedValueOnce([
      {
        childAgentId: childAgent.id,
        childAgentVersionId: childVersion.id,
        instructions: "Research",
      },
    ]);
    mocks.generateText.mockImplementationOnce(async (options) => {
      const delegate = Object.entries(options.tools).find(([name]) =>
        name.startsWith("delegate_"),
      )?.[1] as {
        execute: (input: {
          task: string;
          attachmentIds: string[];
        }) => Promise<unknown>;
      };
      await expect(
        delegate.execute({
          task: "Inspect a file",
          attachmentIds: ["34343434-3434-4434-8434-343434343434"],
        }),
      ).rejects.toMatchObject({
        code: "AGENT_DELEGATION_ATTACHMENT_FORBIDDEN",
      });
      return {
        text: "The requested file was not delegated.",
        usage: { inputTokens: 3, outputTokens: 4 },
      };
    });

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Coordinate",
        trigger: "api",
        availableAttachments: [],
      }),
    ).resolves.toMatchObject({ text: "The requested file was not delegated." });

    expect(mocks.getVersion).not.toHaveBeenCalled();
    expect(mocks.appendStep).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "delegation", status: "failed" }),
    );
  });

  it("rechecks delegation permission and executes the pinned child version", async () => {
    const onProgress = vi.fn();
    const attachment = {
      kind: "chat_file" as const,
      id: "12121212-1212-4212-8212-121212121212",
      fileName: "quarterly-report.pdf",
      mimeType: "application/pdf",
      size: 4_096,
      hash: "attachment-hash",
      url: "/api/workspace/chat-attachments/quarterly-report",
      category: "document" as const,
      extractionStatus: "readable" as const,
      extractedTextChars: 12_000,
    };
    mocks.getVisibleAgent
      .mockResolvedValueOnce(orchestrator)
      .mockResolvedValueOnce(childAgent);
    mocks.getActiveVersion.mockResolvedValueOnce(orchestratorVersion);
    mocks.getVersion.mockResolvedValueOnce(childVersion);
    mocks.resolveProvider
      .mockResolvedValueOnce({ ...provider, modelRecordId: "root-model" })
      .mockResolvedValueOnce({ ...provider, modelRecordId: "child-model" });
    mocks.getDelegationBindings.mockResolvedValueOnce([
      {
        childAgentId: childAgent.id,
        childAgentVersionId: childVersion.id,
        instructions: "Research",
      },
    ]);
    mocks.buildBoundTools
      .mockResolvedValueOnce({ tools: {}, toolApproval: undefined })
      .mockResolvedValueOnce({
        tools: {
          web_search: { execute: vi.fn(async () => ({ sourceCount: 3 })) },
        },
        toolApproval: undefined,
      });
    mocks.createRun
      .mockResolvedValueOnce({
        run: { id: "77777777-7777-4777-8777-777777777777", status: "queued" },
        reused: false,
      })
      .mockResolvedValueOnce({
        run: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "queued" },
        reused: false,
      });
    let call = 0;
    mocks.generateText.mockImplementation(async (options) => {
      call += 1;
      if (call === 1) {
        const delegationEntry = Object.entries(options.tools).find(([name]) =>
          name.startsWith("delegate_"),
        );
        expect(delegationEntry?.[0]).toBe("delegate_specialist_1");
        const delegate = delegationEntry?.[1] as {
          description: string;
          execute: (input: {
            task: string;
            attachmentIds?: string[];
          }) => Promise<unknown>;
          toModelOutput: (options: {
            toolCallId: string;
            input: { task: string; attachmentIds?: string[] };
            output: unknown;
          }) => unknown;
        };
        expect(delegate.description).not.toContain(childAgent.id);
        const delegatedOutput = await delegate.execute({
          task: "Investigate",
          attachmentIds: [attachment.id],
        });
        expect(delegatedOutput).toMatchObject({
          childRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          childAgentId: childAgent.id,
          childAgentName: childAgent.name,
          result: "Child result",
          visualOutputs: [
            expect.objectContaining({
              kind: "code_sandbox_result",
              title: "Sandbox output",
            }),
          ],
        });
        const visualOutputId = (
          delegatedOutput as { visualOutputs: Array<{ id: string }> }
        ).visualOutputs[0].id;
        const publish = options.tools.publish_specialist_output as {
          execute: (input: { visualOutputId: string }) => Promise<unknown>;
        };
        await expect(
          publish.execute({ visualOutputId }),
        ).resolves.toMatchObject({ kind: "code_sandbox_result", ok: true });
        const modelOutput = await delegate.toModelOutput({
          toolCallId: "delegate-call",
          input: { task: "Investigate", attachmentIds: [attachment.id] },
          output: delegatedOutput,
        });
        expect(modelOutput).toMatchObject({ type: "text" });
        expect((modelOutput as { value: string }).value).toContain(
          "Visual outputs available for optional publication",
        );
        expect(JSON.stringify(modelOutput)).not.toContain(childAgent.id);
        expect(JSON.stringify(modelOutput)).not.toContain(childAgent.name);
        expect(JSON.stringify(modelOutput)).not.toContain(
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        );
        return {
          text: "Synthesized",
          usage: { inputTokens: 7, outputTokens: 8 },
        };
      }
      if (call === 2) {
        expect(options.instructions).toContain(
          "Return only the final answer needed by the parent orchestrator.",
        );
        expect(options.instructions).toContain(attachment.id);
        expect(options.instructions).toContain(attachment.fileName);
        const prepareStep = options.prepareStep as (input: {
          stepNumber: number;
          instructions: string;
          messages: Array<{ role: "user"; content: string }>;
        }) => unknown;
        const stepInput = {
          instructions: options.instructions as string,
          messages: [{ role: "user" as const, content: "Continue" }],
        };
        expect(
          await prepareStep({ ...stepInput, stepNumber: 2 }),
        ).toMatchObject({
          messages: stepInput.messages,
          maxOutputTokens: 4_000,
        });
        expect(
          await prepareStep({ ...stepInput, stepNumber: 3 }),
        ).toMatchObject({
          activeTools: [],
          toolChoice: "none",
          messages: stepInput.messages,
          maxOutputTokens: 4_000,
        });
        const childToolCall = {
          type: "tool-call" as const,
          toolCallId: "child-tool-call",
          toolName: "run_code_sandbox",
          input: {
            language: "python",
            code: "print('done')",
            attachments: [{ id: attachment.id }],
          },
          dynamic: false,
        };
        await options.onToolExecutionStart?.({
          callId: "child-model-call",
          messages: [],
          toolCall: childToolCall,
          toolContext: undefined,
        });
        await options.onToolExecutionEnd?.({
          callId: "child-model-call",
          messages: [],
          toolCall: childToolCall,
          toolContext: undefined,
          toolExecutionMs: 31,
          toolOutput: {
            ...childToolCall,
            type: "tool-result",
            output: {
              kind: "code_sandbox_result",
              ok: true,
              language: "python",
              exitCode: 0,
              timedOut: false,
              durationMs: 31,
              stdout: "done",
              stderr: "",
              files: [
                {
                  path: "chart.png",
                  size: 120,
                  mimeType: "image/png",
                  fromInput: false,
                },
              ],
            },
          },
        });
        return {
          text: "",
          usage: { inputTokens: 2, outputTokens: 3 },
          toolResults: [
            {
              type: "tool-result",
              toolCallId: "child-tool-call",
              toolName: "run_code_sandbox",
              output: {
                kind: "code_sandbox_result",
                ok: true,
                language: "python",
                exitCode: 0,
                timedOut: false,
                durationMs: 31,
                stdout: "done",
                stderr: "",
                files: [
                  {
                    path: "chart.png",
                    size: 120,
                    mimeType: "image/png",
                    fromInput: false,
                  },
                ],
              },
            },
          ],
          responseMessages: [
            {
              role: "tool",
              content: [
                {
                  type: "tool-result",
                  toolCallId: "child-tool-call",
                  toolName: "run_code_sandbox",
                  output: {
                    type: "json",
                    value: { kind: "code_sandbox_result" },
                  },
                },
              ],
            },
          ],
        };
      }
      expect(options).not.toHaveProperty("tools");
      expect(options).not.toHaveProperty("prompt");
      expect(options.messages[0].content).toContain(
        '"kind":"code_sandbox_result"',
      );
      expect(options.instructions).toContain(
        "Your previous turn ended without a final text response",
      );
      return {
        text: "Child result",
        usage: { inputTokens: 4, outputTokens: 4 },
      };
    });

    const result = await executeAgent({
      workspaceId: rootAgent.workspaceId,
      userId: rootAgent.createdById,
      agentId: rootAgent.id,
      prompt: "Coordinate",
      trigger: "api",
      availableAttachments: [attachment],
      onProgress,
    });

    expect(result.totalTreeTokens).toBe(28);
    expect(result.usageBreakdown).toEqual(
      expect.arrayContaining([
        {
          modelId: "child-model",
          inputTokens: 6,
          outputTokens: 7,
        },
        { modelId: "root-model", inputTokens: 7, outputTokens: 8 },
      ]),
    );
    expect(mocks.checkPermission).toHaveBeenCalledWith(
      { principalType: "user", principalId: rootAgent.createdById },
      "agents.delegate",
      "agent",
      childAgent.id,
    );
    expect(mocks.getVersion).toHaveBeenCalledWith(childVersion.id);
    expect(mocks.createRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        agentId: childAgent.id,
        agentVersionId: childVersion.id,
        parentRunId: "77777777-7777-4777-8777-777777777777",
        trigger: "delegation",
      }),
    );
    const rootDeadline = mocks.createRun.mock.calls[0][0].deadlineAt as Date;
    const childDeadline = mocks.createRun.mock.calls[1][0].deadlineAt as Date;
    expect(rootDeadline.getTime() - childDeadline.getTime()).toBe(7_500);
    expect(mocks.completeRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ reservationTokens: 28 }),
    );
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      type: "tool-start",
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:child-tool-call",
      toolCallId: "child-tool-call",
      toolName: "run_code_sandbox",
      agentName: childAgent.name,
      agentId: childAgent.id,
      runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      parentRunId: "77777777-7777-4777-8777-777777777777",
      depth: 1,
      modelHistoryKind: "visual-only",
      input: {
        language: "python",
        code: "print('done')",
        attachments: [{ id: attachment.id }],
      },
    });
    expect(onProgress).toHaveBeenNthCalledWith(2, {
      type: "tool-end",
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:child-tool-call",
      toolCallId: "child-tool-call",
      toolName: "run_code_sandbox",
      agentName: childAgent.name,
      agentId: childAgent.id,
      runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      parentRunId: "77777777-7777-4777-8777-777777777777",
      depth: 1,
      modelHistoryKind: "visual-only",
      durationMs: 31,
      output: {
        kind: "code_sandbox_result",
        ok: true,
        language: "python",
        exitCode: 0,
        timedOut: false,
        durationMs: 31,
        stdout: "done",
        stderr: "",
        files: [
          {
            path: "chart.png",
            size: 120,
            mimeType: "image/png",
            fromInput: false,
          },
        ],
      },
    });
    expect(mocks.buildBoundTools).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ enableDocumentExplorer: true }),
    );
  });
});

vi.mock("@/modules/usage/limited-language-model", () => ({
  applyUsageLimits: async (model: unknown) => model,
}));
