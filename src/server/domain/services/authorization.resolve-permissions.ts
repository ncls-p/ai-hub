import { needsFreshAuthorization } from "./authorization.fresh-context";
import type { AccessResourceType } from "@/server/domain/entities/access-resource";
import { cache } from "@/server/infrastructure/cache";
import { db } from "@/server/infrastructure/db";
import { findAccessResource } from "@/server/infrastructure/db/access-resource-repository";
import {
  roleBindings,
  roles,
  teamMembers,
  teams,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { and, eq, gte, inArray, isNull, or } from "drizzle-orm";
import {
  AuthorizationContext,
  PERMISSION_CACHE_TTL,
  Permission,
  ResourceType,
  addRolePermissions,
  isActiveOrganizationMember,
  isActiveWorkspaceMember,
  permissionResolutions,
  uniquePermissions,
} from "./authorization.permission-cache-ttl";

async function resolvePermissionsUncached(
  ctx: AuthorizationContext,
  resourceType: ResourceType,
  resourceId: string,
  cacheKey: string,
  fresh = false,
): Promise<Permission[]> {
  let organizationId: string | null =
    resourceType === "organization" ? resourceId : null;
  let workspaceId: string | null =
    resourceType === "workspace" ? resourceId : null;
  let parentResource: { type: AccessResourceType; id: string } | undefined;
  if (resourceType === "workspace") {
    const [workspace] = await db
      .select({ organizationId: workspaces.organizationId })
      .from(workspaces)
      .where(eq(workspaces.id, resourceId))
      .limit(1);
    if (!workspace) {
      if (!fresh) await cache.set(cacheKey, [], PERMISSION_CACHE_TTL);
      return [];
    }
    organizationId = workspace.organizationId;
  } else if (resourceType !== "organization") {
    const resource = await findAccessResource(resourceType, resourceId);
    if (!resource) {
      if (!fresh) await cache.set(cacheKey, [], PERMISSION_CACHE_TTL);
      return [];
    }
    workspaceId = resource.workspaceId;
    organizationId = resource.organizationId;
    parentResource = resource.parent;
  }

  if (
    ctx.principalType === "user" &&
    ((workspaceId &&
      !(await isActiveWorkspaceMember(
        ctx.principalId,
        workspaceId,
        organizationId ?? undefined,
      ))) ||
      (!workspaceId &&
        organizationId &&
        !(await isActiveOrganizationMember(ctx.principalId, organizationId))))
  ) {
    if (!fresh) await cache.set(cacheKey, [], PERMISSION_CACHE_TTL);
    return [];
  }

  let groupIds: string[] = [];
  if (ctx.principalType === "user" && organizationId) {
    const memberships = await db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(
        and(
          eq(teamMembers.userId, ctx.principalId),
          eq(teams.organizationId, organizationId),
        ),
      );
    groupIds = [
      ...memberships.map(({ teamId }) => teamId),
      organizationId,
      ...(workspaceId ? [workspaceId] : []),
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
  const inheritedResourceFilters = [
    and(
      eq(roleBindings.resourceType, resourceType),
      eq(roleBindings.resourceId, resourceId),
    ),
  ];
  if (workspaceId && resourceType !== "workspace") {
    inheritedResourceFilters.push(
      and(
        eq(roleBindings.resourceType, "workspace"),
        eq(roleBindings.resourceId, workspaceId),
      ),
    );
  }
  if (parentResource) {
    inheritedResourceFilters.push(
      and(
        eq(roleBindings.resourceType, parentResource.type),
        eq(roleBindings.resourceId, parentResource.id),
      ),
    );
  }
  if (organizationId && resourceType !== "organization") {
    inheritedResourceFilters.push(
      and(
        eq(roleBindings.resourceType, "organization"),
        eq(roleBindings.resourceId, organizationId),
      ),
    );
  }
  const resourceFilter =
    inheritedResourceFilters.length === 1
      ? inheritedResourceFilters[0]
      : or(...inheritedResourceFilters);

  const bindings = await db
    .select()
    .from(roleBindings)
    .innerJoin(roles, eq(roleBindings.roleId, roles.id))
    .where(
      and(
        principalFilter,
        resourceFilter,
        or(
          isNull(roleBindings.expiresAt),
          gte(roleBindings.expiresAt, new Date()),
        ),
      ),
    );

  const permissions: Permission[] = [];
  for (const binding of bindings) {
    addRolePermissions(permissions, binding.roles);
  }

  const resolvedPermissions = uniquePermissions(permissions);
  const nextExpiry = Math.min(
    ...bindings.map(
      ({ role_bindings: binding }) => binding?.expiresAt?.getTime() ?? Infinity,
    ),
  );
  const ttl = Math.min(
    PERMISSION_CACHE_TTL,
    Math.floor((nextExpiry - Date.now()) / 1000),
  );
  if (!fresh && ttl > 0) await cache.set(cacheKey, resolvedPermissions, ttl);
  return resolvedPermissions;
}

export async function resolvePermissions(
  ctx: AuthorizationContext,
  resourceType: ResourceType,
  resourceId: string,
): Promise<Permission[]> {
  const cacheKey = `perm:${ctx.principalType}:${ctx.principalId}:${resourceType}:${resourceId}`;
  if (needsFreshAuthorization())
    return resolvePermissionsUncached(
      ctx,
      resourceType,
      resourceId,
      cacheKey,
      true,
    );
  const cached = await cache.get<Permission[]>(cacheKey);
  if (cached) return cached;

  const pending = permissionResolutions.get(cacheKey);
  if (pending) return pending;

  const resolution = resolvePermissionsUncached(
    ctx,
    resourceType,
    resourceId,
    cacheKey,
  );
  permissionResolutions.set(cacheKey, resolution);
  try {
    return await resolution;
  } finally {
    if (permissionResolutions.get(cacheKey) === resolution) {
      permissionResolutions.delete(cacheKey);
    }
  }
}
