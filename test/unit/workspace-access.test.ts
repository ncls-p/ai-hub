import { beforeEach, describe, expect, it, vi } from "vitest";

const { checkPermission, findAccessResource, requireWorkspaceMember } =
  vi.hoisted(() => ({
    checkPermission: vi.fn(),
    findAccessResource: vi.fn(),
    requireWorkspaceMember: vi.fn(),
  }));

vi.mock("@/server/domain/services/authorization", () => ({
  authorization: { checkPermission, requireWorkspaceMember },
  matchesPermission: (granted: string, required: string) =>
    granted === required ||
    granted === `${required.split(".")[0]}.manage` ||
    granted === `${required.split(".")[0]}.*`,
}));

vi.mock("@/server/infrastructure/db/access-resource-repository", () => ({
  findAccessResource,
}));

import { runWithRequestAuth } from "@/modules/auth/request-auth-context";
import {
  checkRequestPermissionScope,
  checkResourcePermissionForRequest,
  checkWorkspacePermissionForRequest,
  hasResourcePermissionForRequest,
  isWorkspaceMemberForRequest,
} from "@/modules/auth/workspace-access";

const apiKeyAuth = {
  type: "api_key" as const,
  apiKeyId: "key-1",
  workspaceId: "workspace-1",
  userId: "user-1",
  scopes: ["agents.chat"],
};

describe("workspace API token access", () => {
  beforeEach(() => {
    checkPermission.mockReset();
    requireWorkspaceMember.mockReset();
    findAccessResource.mockReset();
  });

  it("grants only when token scope and current user permission both grant", async () => {
    checkPermission.mockResolvedValue({ granted: true });

    const result = await runWithRequestAuth(apiKeyAuth, () =>
      checkWorkspacePermissionForRequest(
        "user-1",
        "workspace-1",
        "agents.chat",
      ),
    );

    expect(result).toEqual({ granted: true });
    expect(checkPermission).toHaveBeenCalledOnce();
  });

  it("denies a permission outside the token scope before consulting RBAC", async () => {
    const result = await runWithRequestAuth(apiKeyAuth, () =>
      checkWorkspacePermissionForRequest(
        "user-1",
        "workspace-1",
        "agents.delete",
      ),
    );

    expect(result).toEqual({
      granted: false,
      reason: "API token scope missing: agents.delete",
    });
    expect(checkPermission).not.toHaveBeenCalled();
  });

  it("exposes scope-only checks for resource-filtered collections", async () => {
    const result = await runWithRequestAuth(apiKeyAuth, () =>
      checkRequestPermissionScope(
        "user-1",
        "workspace-1",
        "providers.viewMetadata",
      ),
    );

    expect(result).toEqual({
      granted: false,
      reason: "API token scope missing: providers.viewMetadata",
    });
  });

  it("denies use by a different actor before consulting RBAC", async () => {
    const result = await runWithRequestAuth(apiKeyAuth, () =>
      checkWorkspacePermissionForRequest(
        "user-2",
        "workspace-1",
        "agents.chat",
      ),
    );

    expect(result).toEqual({
      granted: false,
      reason: "API token actor mismatch",
    });
    expect(checkPermission).not.toHaveBeenCalled();
  });

  it("denies cross-workspace use even when the scope matches", async () => {
    const result = await runWithRequestAuth(apiKeyAuth, () =>
      checkWorkspacePermissionForRequest(
        "user-1",
        "workspace-2",
        "agents.chat",
      ),
    );

    expect(result.granted).toBe(false);
    expect(result.reason).toMatch(/another workspace/i);
    expect(checkPermission).not.toHaveBeenCalled();
  });

  it("denies when the owner no longer has the permission", async () => {
    checkPermission.mockResolvedValue({
      granted: false,
      reason: "Missing permission: agents.chat",
    });

    const result = await runWithRequestAuth(apiKeyAuth, () =>
      checkWorkspacePermissionForRequest(
        "user-1",
        "workspace-1",
        "agents.chat",
      ),
    );

    expect(result.granted).toBe(false);
    expect(result.reason).toBe("Missing permission: agents.chat");
  });

  it("denies membership checks outside the token workspace", async () => {
    requireWorkspaceMember.mockResolvedValue(true);

    const member = await runWithRequestAuth(apiKeyAuth, () =>
      isWorkspaceMemberForRequest("user-1", "workspace-2"),
    );

    expect(member).toBe(false);
    expect(requireWorkspaceMember).not.toHaveBeenCalled();
  });

  it("checks a fine-grained resource after verifying its project", async () => {
    findAccessResource.mockResolvedValue({
      id: "agent-1",
      type: "agent",
      name: "Support",
      workspaceId: "workspace-1",
      organizationId: "organization-1",
    });
    checkPermission.mockResolvedValue({ granted: true });

    const result = await checkResourcePermissionForRequest(
      "user-1",
      "workspace-1",
      "agents.get",
      "agent",
      "agent-1",
    );

    expect(result.granted).toBe(true);
    expect(checkPermission).toHaveBeenCalledWith(
      { principalType: "user", principalId: "user-1" },
      "agents.get",
      "agent",
      "agent-1",
    );
  });

  it("returns the boolean form of a fine-grained resource check", async () => {
    findAccessResource.mockResolvedValue({
      id: "agent-1",
      type: "agent",
      name: "Support",
      workspaceId: "workspace-1",
      organizationId: "organization-1",
    });
    checkPermission.mockResolvedValue({ granted: true });

    await expect(
      hasResourcePermissionForRequest(
        "user-1",
        "workspace-1",
        "agents.get",
        "agent",
        "agent-1",
      ),
    ).resolves.toBe(true);
  });

  it("rejects a resource from another project before RBAC", async () => {
    findAccessResource.mockResolvedValue({
      id: "model-1",
      type: "model",
      name: "Restricted",
      workspaceId: "workspace-2",
      organizationId: "organization-1",
    });

    const result = await checkResourcePermissionForRequest(
      "user-1",
      "workspace-1",
      "models.invoke",
      "model",
      "model-1",
    );

    expect(result).toEqual({
      granted: false,
      reason: "Resource not found in this project",
    });
    expect(checkPermission).not.toHaveBeenCalled();
  });
});

vi.mock("@/modules/iam/resource-availability", () => ({
  distributedResourcePermissions: async () => [],
}));
