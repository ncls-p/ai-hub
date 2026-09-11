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
import {
  createWorkflowAgenticModelFixture,
  request,
} from "./workflow-agentic-route.suite-3.fixture";

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

  it("fails closed when no assistant is available", async () => {
    mocks.listAgents.mockResolvedValue([]);
    mocks.getAgentDefaultPreferences.mockResolvedValue({
      organizationDefaultAgentId: null,
      userDefaultAgentId: null,
      effectiveDefaultAgentId: null,
    });

    const response = await POST(request(), {
      params: Promise.resolve({ workflowId }),
    });

    expect(response.status).toBe(400);
    expect(mocks.createChatModel).not.toHaveBeenCalled();
    expect(mocks.updateWorkflow).not.toHaveBeenCalled();
  });
});

vi.mock("@/modules/usage/limited-language-model", () => ({
  applyUsageLimits: async (model: unknown) => model,
}));
