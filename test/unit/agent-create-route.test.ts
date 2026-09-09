import { beforeEach, describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm";

const routeMocks = vi.hoisted(() => ({
  canManageTenantGlobals: vi.fn().mockResolvedValue(false),
  createAgent: vi.fn(),
  requireWorkspacePermissionAsync: vi.fn().mockResolvedValue(null),
  workspaceLimit: vi.fn(),
}));

vi.mock("@/lib/route-handler", () => ({
  requireWorkspacePermissionAsync: routeMocks.requireWorkspacePermissionAsync,
  handleRoute: async (
    request: Request,
    handler: (context: unknown) => Promise<Response>,
    options?: { expectedError?: (error: unknown) => Response | null },
  ) => {
    try {
      return await handler({
        session: { user: { id: "11111111-1111-4111-8111-111111111111" } },
        request,
        requestId: "request-1",
      });
    } catch (error) {
      return (
        options?.expectedError?.(error) ??
        Response.json({ error: "Internal server error" }, { status: 500 })
      );
    }
  },
}));

vi.mock("@/modules/admin/auth", () => ({
  canManageTenantGlobals: routeMocks.canManageTenantGlobals,
}));

vi.mock("@/modules/agent/use-cases", () => ({
  canEditAgent: vi.fn(),
  createAgent: routeMocks.createAgent,
  getAgentDefaultPreferences: vi.fn(),
  listAgents: vi.fn(),
  normalizePromptSuggestions: vi.fn((input) => input),
}));

vi.mock("@/modules/agent/delegation-use-cases", () => ({
  DelegationBindingValidationError: class DelegationBindingValidationError extends Error {
    readonly code = "INVALID_DELEGATION_BINDING";
  },
}));

vi.mock("@/server/domain/services/authorization", () => ({
  authorization: { hasPermission: vi.fn() },
}));

vi.mock("@/server/infrastructure/db", () => {
  const workspaceQuery = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: routeMocks.workspaceLimit,
  };

  return {
    db: {
      select: vi.fn(() => workspaceQuery),
    },
  };
});

import { POST } from "@/app/api/workspace/agents/route";

const workspaceId = "22222222-2222-4222-8222-222222222222";
const agentId = "33333333-3333-4333-8333-333333333333";
const versionId = "44444444-4444-4444-8444-444444444444";

function createRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/workspace/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("agent creation route tool presets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.workspaceLimit.mockResolvedValue([{ id: workspaceId }]);
    routeMocks.requireWorkspacePermissionAsync.mockResolvedValue(null);
    routeMocks.canManageTenantGlobals.mockResolvedValue(false);
    routeMocks.createAgent.mockResolvedValue({
      agent: { id: agentId, activeVersionId: versionId },
      version: { id: versionId },
    });
  });

  it("accepts only the explicit onboarding preset", async () => {
    const response = await POST(
      createRequest({
        workspaceId,
        name: "First assistant",
        slug: "first-assistant",
        toolPreset: "onboarding",
      }) as never,
    );

    expect(response.status).toBe(201);
    expect(routeMocks.createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        toolPreset: "onboarding",
      }),
    );

    const invalidResponse = await POST(
      createRequest({
        workspaceId,
        name: "Invalid preset",
        slug: "invalid-preset",
        toolPreset: "default",
      }) as never,
    );

    expect(invalidResponse.status).toBe(400);
    expect(routeMocks.createAgent).toHaveBeenCalledTimes(1);
  });

  it("rejects mixing the onboarding preset with client tool bindings", async () => {
    const response = await POST(
      createRequest({
        workspaceId,
        name: "Ambiguous assistant",
        slug: "ambiguous-assistant",
        toolPreset: "onboarding",
        toolBindings: [],
      }) as never,
    );

    expect(response.status).toBe(400);
    expect(routeMocks.createAgent).not.toHaveBeenCalled();
  });

  it("does not add a preset to manual creation requests", async () => {
    const response = await POST(
      createRequest({
        workspaceId,
        name: "Manual assistant",
        slug: "manual-assistant",
      }) as never,
    );

    expect(response.status).toBe(201);
    const input = routeMocks.createAgent.mock.calls[0]?.[0];
    expect(input).not.toHaveProperty("toolPreset");
    expect(input).not.toHaveProperty("toolBindings");
  });

  it("accepts creation without a slug and preserves the display name", async () => {
    const response = await POST(
      createRequest({
        workspaceId,
        name: "助手 🤖",
        accessScope: "private",
      }) as never,
    );
    expect(response.status).toBe(201);
    expect(routeMocks.createAgent).toHaveBeenCalledWith(
      expect.objectContaining({ name: "助手 🤖" }),
    );
    expect(routeMocks.createAgent.mock.calls[0][0]).not.toHaveProperty("slug");
  });

  it("returns a conflict when Drizzle wraps a duplicate assistant slug", async () => {
    routeMocks.createAgent.mockRejectedValueOnce(
      new DrizzleQueryError(
        "insert into agents ...",
        [],
        Object.assign(
          new Error("duplicate key value violates unique constraint"),
          { code: "23505", constraint: "agents_workspace_slug_unique" },
        ),
      ),
    );
    const response = await POST(
      createRequest({
        workspaceId,
        name: "test",
        slug: "test",
        accessScope: "private",
      }) as never,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Agent slug already exists in this workspace",
    });
  });
});
