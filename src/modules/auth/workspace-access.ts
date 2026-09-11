import { distributedResourcePermissions } from "@/modules/iam/resource-availability";
import { getRequestAuthContext } from "@/modules/auth/request-auth-context";
import type { AccessResourceType } from "@/server/domain/entities/access-resource";
import {
  authorization,
  matchesPermission,
  type PermissionCheckResult,
} from "@/server/domain/services/authorization";
import { findAccessResource } from "@/server/infrastructure/db/access-resource-repository";

function apiKeyScopeResult(
  userId: string,
  workspaceId: string,
  permission: string,
): PermissionCheckResult {
  const auth = getRequestAuthContext();
  if (!auth || auth.type === "user") return { granted: true };

  if (auth.userId !== userId) {
    return { granted: false, reason: "API token actor mismatch" };
  }
  if (auth.workspaceId !== workspaceId) {
    return {
      granted: false,
      reason: "API token is restricted to another workspace",
    };
  }
  if (!auth.scopes.some((scope) => matchesPermission(scope, permission))) {
    return {
      granted: false,
      reason: `API token scope missing: ${permission}`,
    };
  }

  return { granted: true };
}

export function checkRequestPermissionScope(
  userId: string,
  workspaceId: string,
  permission: string,
): PermissionCheckResult {
  return apiKeyScopeResult(userId, workspaceId, permission);
}

export async function checkWorkspacePermissionForRequest(
  userId: string,
  workspaceId: string,
  permission: string,
): Promise<PermissionCheckResult> {
  const scopeResult = apiKeyScopeResult(userId, workspaceId, permission);
  if (!scopeResult.granted) return scopeResult;

  return authorization.checkPermission(
    { principalType: "user", principalId: userId },
    permission,
    "workspace",
    workspaceId,
  );
}

export async function hasWorkspacePermissionForRequest(
  userId: string,
  workspaceId: string,
  permission: string,
) {
  const result = await checkWorkspacePermissionForRequest(
    userId,
    workspaceId,
    permission,
  );
  return result.granted;
}

export async function checkResourcePermissionForRequest(
  userId: string,
  workspaceId: string,
  permission: string,
  resourceType: AccessResourceType,
  resourceId: string,
): Promise<PermissionCheckResult> {
  const scopeResult = apiKeyScopeResult(userId, workspaceId, permission);
  if (!scopeResult.granted) return scopeResult;

  const resource = await findAccessResource(resourceType, resourceId);
  if (
    resource &&
    resource.workspaceId !== workspaceId &&
    (
      await distributedResourcePermissions(
        userId,
        resourceType,
        resourceId,
        workspaceId,
      )
    ).includes(permission)
  ) {
    return { granted: true };
  }
  if (!resource || resource.workspaceId !== workspaceId) {
    return { granted: false, reason: "Resource not found in this project" };
  }

  return authorization.checkPermission(
    { principalType: "user", principalId: userId },
    permission,
    resourceType,
    resourceId,
  );
}

export async function hasResourcePermissionForRequest(
  userId: string,
  workspaceId: string,
  permission: string,
  resourceType: AccessResourceType,
  resourceId: string,
) {
  const result = await checkResourcePermissionForRequest(
    userId,
    workspaceId,
    permission,
    resourceType,
    resourceId,
  );
  return result.granted;
}

export async function isWorkspaceMemberForRequest(
  userId: string,
  workspaceId: string,
) {
  const auth = getRequestAuthContext();
  if (auth?.type === "api_key") {
    if (auth.userId !== userId || auth.workspaceId !== workspaceId) {
      return false;
    }
  }

  return authorization.requireWorkspaceMember(userId, workspaceId);
}

export function isPermissionAllowedByRequestScope(
  workspaceId: string,
  permission: string,
) {
  const auth = getRequestAuthContext();
  if (!auth || auth.type === "user") return true;
  if (auth.workspaceId !== workspaceId) return false;
  return auth.scopes.some((scope) => matchesPermission(scope, permission));
}
