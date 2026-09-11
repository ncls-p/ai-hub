import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStarterDefinition } from "@/modules/workflows/contracts";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getWorkflowDetail: vi.fn(),
  updateWorkflow: vi.fn(),
  listAgents: vi.fn(),
  getAgentById: vi.fn(),
  getAgentDefaultPreferences: vi.fn(),
  getConfiguredWorkflowBuilderAgentId: vi.fn(),
  getActiveVersion: vi.fn(),
  resolveProviderForVersion: vi.fn(),
  createChatModel: vi.fn(),
  getWorkflowAgentHistory: vi.fn(),
  getPendingWorkflowAgentRunRequests: vi.fn(),
  createWorkflowAgentRunRequest: vi.fn(),
  getWorkflowAgentTodoList: vi.fn(),
  updateWorkflowAgentTodoList: vi.fn(),
  appendWorkflowAgentMessage: vi.fn(),
  searchWebWithSearxng: vi.fn(),
  executeCodeSandbox: vi.fn(),
}));

vi.mock("@/lib/route-handler", () => ({
  requireWorkspacePermissionAsync: mocks.requirePermission,
  requireResourcePermissionAsync: mocks.requirePermission,
  handleRoute: async (
    request: Request,
    handler: (context: {
      session: { user: { id: string } };
      request: Request;
    }) => Promise<Response>,
    options?: { expectedError?: (error: unknown) => Response | null },
  ) => {
    try {
      return await handler({
        session: { user: { id: userId } },
        request,
      });
    } catch (error) {
      return (
        options?.expectedError?.(error) ??
        Response.json({ error: "Internal server error" }, { status: 500 })
      );
    }
  },
}));

vi.mock("@/modules/agent/use-cases", () => ({
  listAgents: mocks.listAgents,
  getAgentById: mocks.getAgentById,
  getAgentDefaultPreferences: mocks.getAgentDefaultPreferences,
  getActiveVersion: mocks.getActiveVersion,
  resolveProviderForVersion: mocks.resolveProviderForVersion,
}));

vi.mock("@/modules/workflows/builder-settings", () => ({
  getConfiguredWorkflowBuilderAgentId:
    mocks.getConfiguredWorkflowBuilderAgentId,
}));

vi.mock("@/modules/agent/runtime-policy", () => ({
  createRuntimeDeadline: () => ({ signal: new AbortController().signal }),
}));

vi.mock("@/modules/workflows/use-cases", () => ({
  WorkflowConflictError: class WorkflowConflictError extends Error {},
  WorkflowNotFoundError: class WorkflowNotFoundError extends Error {},
  WorkflowQueueError: class WorkflowQueueError extends Error {},
  getWorkflowDetail: mocks.getWorkflowDetail,
  updateWorkflow: mocks.updateWorkflow,
}));

vi.mock("@/modules/workflows/agentic-history", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/modules/workflows/agentic-history")
    >();
  return {
    ...actual,
    getWorkflowAgentHistory: mocks.getWorkflowAgentHistory,
    appendWorkflowAgentMessage: mocks.appendWorkflowAgentMessage,
  };
});

vi.mock("@/modules/tool/builtin-tool-primitives", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/modules/tool/builtin-tool-primitives")
    >();
  return {
    ...actual,
    searchWebWithSearxng: mocks.searchWebWithSearxng,
  };
});

vi.mock("@/modules/tool/code-sandbox", () => ({
  executeCodeSandbox: mocks.executeCodeSandbox,
}));

vi.mock("@/modules/workflows/agentic-run-approvals", () => ({
  getPendingWorkflowAgentRunRequests: mocks.getPendingWorkflowAgentRunRequests,
  createWorkflowAgentRunRequest: mocks.createWorkflowAgentRunRequest,
}));

vi.mock("@/modules/workflows/agentic-todo-list", () => ({
  getWorkflowAgentTodoList: mocks.getWorkflowAgentTodoList,
  updateWorkflowAgentTodoList: mocks.updateWorkflowAgentTodoList,
}));

vi.mock("@/server/infrastructure/providers", () => ({
  getAdapter: () => ({ createChatModel: mocks.createChatModel }),
}));

import { POST } from "@/app/api/workspace/workflows/[workflowId]/agentic/route";
import { request } from "./workflow-agentic-route.suite-3.fixture";
import {
  createWorkflowAgenticModelFixture,
  generatedDefinition,
  textStream,
  toolCallStream,
} from "./workflow-agentic-route.suite-4.fixture";

const userId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const workflowId = "33333333-3333-4333-8333-333333333333";
const agentId = "44444444-4444-4444-8444-444444444444";
const versionId = "55555555-5555-4555-8555-555555555555";

describe("workflow agentic route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue(null);
    mocks.getWorkflowDetail.mockResolvedValue({
      id: workflowId,
      workspaceId,
      name: "Summary",
      description: null,
      latestVersion: 1,
      version: 1,
      definition: createStarterDefinition(),
    });
    mocks.listAgents.mockResolvedValue([
      { id: agentId, name: "Workflow assistant" },
    ]);
    mocks.getAgentById.mockResolvedValue(null);
    mocks.getConfiguredWorkflowBuilderAgentId.mockResolvedValue(null);
    mocks.getWorkflowAgentHistory.mockResolvedValue({
      messages: [],
      pendingRequests: [],
    });
    mocks.getPendingWorkflowAgentRunRequests.mockResolvedValue([]);
    mocks.getWorkflowAgentTodoList.mockResolvedValue(null);
    mocks.updateWorkflowAgentTodoList.mockImplementation(async (input) => ({
      kind: "chat_todo_list",
      title: input.todoList.title,
      items: input.todoList.items,
      completedCount: input.todoList.items.filter(
        (item: { status: string }) => item.status === "completed",
      ).length,
      totalCount: input.todoList.items.length,
    }));
    mocks.createWorkflowAgentRunRequest.mockImplementation(async (input) => ({
      id: "99999999-9999-4999-8999-999999999999",
      title: input.title,
      reason: input.reason ?? null,
      inputPreview: input.payload ?? {},
      expectedVersion: input.expectedVersion,
      status: "pending",
      expiresAt: "2099-07-23T10:00:00.000Z",
    }));
    mocks.executeCodeSandbox.mockResolvedValue({
      ok: true,
      stdout: "tests passed",
      stderr: "",
      exitCode: 0,
    });
    mocks.appendWorkflowAgentMessage.mockImplementation(async (input) => ({
      id: crypto.randomUUID(),
      role: input.role,
      content: input.content,
      createdAt: new Date().toISOString(),
    }));
    mocks.searchWebWithSearxng.mockResolvedValue({
      ok: true,
      query: "Build a summary workflow",
      results: [],
    });
    mocks.getAgentDefaultPreferences.mockResolvedValue({
      organizationDefaultAgentId: agentId,
      userDefaultAgentId: null,
      effectiveDefaultAgentId: agentId,
    });
    mocks.getActiveVersion.mockResolvedValue({
      id: versionId,
      maxOutputTokens: 4_000,
      temperature: null,
      topP: null,
    });
    mocks.resolveProviderForVersion.mockResolvedValue({
      providerKind: "openai-compatible",
      providerId: "provider-1",
      modelId: "model-1",
      runtimeConfig: {},
    });
    mocks.createChatModel.mockReturnValue(createWorkflowAgenticModelFixture());
    mocks.updateWorkflow.mockImplementation(async (input) => ({
      ...input,
      latestVersion: 2,
      version: 2,
      status: "draft",
    }));
  });

  it("lets the model repair a failed connection tool call and saves the corrected graph", async () => {
    mocks.createChatModel.mockReturnValueOnce(
      new MockLanguageModelV4({
        modelId: "model-1",
        doStream: [
          toolCallStream("tool-plan", "set_workflow_plan", {
            summary: "Build and connect the summary workflow",
            steps: ["Add the summary step", "Connect and test the graph"],
            tests: ["Validate every connection"],
          }),
          toolCallStream("tool-todos", "update_todo_list", {
            title: "Summary workflow",
            items: [
              {
                id: "connect",
                label: "Connect the workflow",
                status: "in_progress",
              },
            ],
          }),
          toolCallStream("tool-nodes", "upsert_workflow_nodes", {
            summary: "Add the summary step",
            nodes: generatedDefinition.nodes.filter(
              (node) => node.id === "summary",
            ),
          }),
          toolCallStream("tool-bad-edge", "connect_workflow_nodes", {
            connections: [
              {
                source: "missing-trigger",
                target: "summary",
              },
            ],
          }),
          toolCallStream("tool-good-edge", "connect_workflow_nodes", {
            connections: [
              {
                source: "trigger",
                target: "summary",
                outcome: "",
              },
            ],
          }),
          toolCallStream("tool-validate", "validate_workflow", {}),
          toolCallStream("tool-dry-run", "dry_run_workflow", {
            testInput: { message: "Bonjour" },
          }),
          textStream("The corrected workflow is ready."),
        ],
      }),
    );

    const response = await POST(request(createStarterDefinition()), {
      params: Promise.resolve({ workflowId }),
    });
    const events = (await response.text())
      .trim()
      .split("\n")
      .map(
        (line) =>
          JSON.parse(line) as {
            type: string;
            id?: string;
            status?: string;
          },
      );

    expect(
      events.find(
        (event) => event.type === "tool_result" && event.id === "tool-bad-edge",
      ),
    ).toMatchObject({ status: "error" });
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(mocks.updateWorkflow).toHaveBeenCalledTimes(1);
    expect(mocks.updateWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        definition: expect.objectContaining({
          edges: [
            expect.objectContaining({
              source: "trigger",
              target: "summary",
              sourceHandle: null,
            }),
          ],
        }),
      }),
    );
  });
});

vi.mock("@/modules/usage/limited-language-model", () => ({
  applyUsageLimits: async (model: unknown) => model,
}));
