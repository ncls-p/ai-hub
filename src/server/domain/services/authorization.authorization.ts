import { logHandledWarning } from "@/lib/logger";
import type { AccessResourceType } from "@/server/domain/entities/access-resource";
import { cache } from "@/server/infrastructure/cache";
import { db } from "@/server/infrastructure/db";
import { findAccessResource } from "@/server/infrastructure/db/access-resource-repository";
import {
  roleBindings,
  roles,
  teamMembers,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { and, eq, gte, inArray, isNull, or } from "drizzle-orm";
import {
  AuthorizationContext,
  Permission,
  PermissionCheckResult,
  ResourceType,
  addRolePermissions,
  isActiveWorkspaceMember,
  matchesPermission,
  permissionResolutions,
} from "./authorization.permission-cache-ttl";
import { resolvePermissions } from "./authorization.resolve-permissions";

export const authorization = {
  async listDirectlyAuthorizedResourceIds(
    ctx: AuthorizationContext,
    permission: string,
    resourceType: AccessResourceType,
    resourceIds: string[],
    workspaceId?: string,
  ): Promise<Set<string>> {
    const uniqueResourceIds = [...new Set(resourceIds)];
    if (uniqueResourceIds.length === 0) return new Set();

    let groupIds: string[] = [];
    if (ctx.principalType === "user") {
      const resolvedWorkspaceId =
        workspaceId ??
        (await findAccessResource(resourceType, uniqueResourceIds[0]))
          ?.workspaceId;
      if (!resolvedWorkspaceId) return new Set();
      const [workspace] = await db
        .select({ organizationId: workspaces.organizationId })
        .from(workspaces)
        .where(eq(workspaces.id, resolvedWorkspaceId))
        .limit(1);
      if (
        !workspace ||
        !(await isActiveWorkspaceMember(
          ctx.principalId,
          resolvedWorkspaceId,
          workspace.organizationId,
        ))
      ) {
        return new Set();
      }
      const memberships = await db
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .where(eq(teamMembers.userId, ctx.principalId));
      groupIds = [
        ...memberships.map(({ teamId }) => teamId),
        resolvedWorkspaceId,
        workspace.organizationId,
      ];
    }

    const principalFilter =
      ctx.principalType === "user" && groupIds.length > 0
        ? or(
            and(
              eq(roleBindings.principalType, "user"),
              eq(roleBindings.principalId, ctx.principalId),
            ),
            and(
              eq(roleBindings.principalType, "group"),
              inArray(roleBindings.principalId, groupIds),
            ),
          )
        : and(
            eq(roleBindings.principalType, ctx.principalType),
            eq(roleBindings.principalId, ctx.principalId),
          );
    const bindings = await db
      .select({
        resourceId: roleBindings.resourceId,
        roleName: roles.name,
        isSystem: roles.isSystem,
        permissionsJson: roles.permissionsJson,
      })
      .from(roleBindings)
      .innerJoin(roles, eq(roleBindings.roleId, roles.id))
      .where(
        and(
          principalFilter,
          eq(roleBindings.resourceType, resourceType),
          inArray(roleBindings.resourceId, uniqueResourceIds),
          or(
            isNull(roleBindings.expiresAt),
            gte(roleBindings.expiresAt, new Date()),
          ),
        ),
      );

    return new Set(
      bindings
        .filter((binding) => {
          const permissions: Permission[] = [];
          addRolePermissions(permissions, {
            name: binding.roleName,
            isSystem: binding.isSystem,
            permissionsJson: binding.permissionsJson,
          });
          return permissions.some((granted) =>
            matchesPermission(granted, permission),
          );
        })
        .map(({ resourceId }) => resourceId),
    );
  },

  async hasDirectPermission(
    ctx: AuthorizationContext,
    permission: string,
    resourceType: AccessResourceType,
    resourceId: string,
    workspaceId?: string,
  ): Promise<boolean> {
    return (
      await this.listDirectlyAuthorizedResourceIds(
        ctx,
        permission,
        resourceType,
        [resourceId],
        workspaceId,
      )
    ).has(resourceId);
  },

  async listPermissions(
    ctx: AuthorizationContext,
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<Permission[]> {
    return resolvePermissions(ctx, resourceType, resourceId);
  },

  async checkPermission(
    ctx: AuthorizationContext,
    permission: string,
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<PermissionCheckResult> {
    const permissions = await resolvePermissions(ctx, resourceType, resourceId);
    const granted = permissions.some((p) => matchesPermission(p, permission));

    return {
      granted,
      reason: granted ? undefined : `Missing permission: ${permission}`,
    };
  },

  async requirePermission(
    ctx: AuthorizationContext,
    permission: string,
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<PermissionCheckResult> {
    const result = await this.checkPermission(
      ctx,
      permission,
      resourceType,
      resourceId,
    );

    if (!result.granted) {
      logHandledWarning("Permission denied", {
        principal: ctx.principalId,
        permission,
        resourceType,
        resourceId,
      });
    }

    return result;
  },

  async hasPermission(
    ctx: AuthorizationContext,
    permission: string,
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<boolean> {
    const result = await this.checkPermission(
      ctx,
      permission,
      resourceType,
      resourceId,
    );
    return result.granted;
  },

  async requireWorkspaceMember(
    userId: string,
    workspaceId: string,
  ): Promise<boolean> {
    const isMember = await isActiveWorkspaceMember(userId, workspaceId);
    return isMember;
  },

  async invalidatePermissionCache(
    principalId: string,
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<void> {
    permissionResolutions.delete(
      `perm:user:${principalId}:${resourceType}:${resourceId}`,
    );
    await cache.del(`perm:user:${principalId}:${resourceType}:${resourceId}`);
  },

  async invalidatePrincipalPermissionCache(principalId: string): Promise<void> {
    const prefix = `perm:user:${principalId}:`;
    for (const key of permissionResolutions.keys()) {
      if (key.startsWith(prefix)) permissionResolutions.delete(key);
    }
    await cache.delByPrefix(`perm:user:${principalId}:`);
  },
};
