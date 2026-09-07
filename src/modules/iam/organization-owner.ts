import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  organizationMembers,
  roleBindings,
  roles,
  workspaces,
  users,
} from "@/server/infrastructure/db/schema";
import { findAccessResource } from "@/server/infrastructure/db/access-resource-repository";
import type { ResourceType } from "@/server/domain/services/authorization";

/** Ownership is a live, direct tenant binding, never inferred from a permission set. */
export async function isOrganizationOwner(
  userId: string,
  resourceType: ResourceType,
  resourceId: string,
) {
  const organizationId =
    resourceType === "organization"
      ? resourceId
      : resourceType === "workspace"
        ? (
            await db
              .select({ id: workspaces.organizationId })
              .from(workspaces)
              .where(eq(workspaces.id, resourceId))
              .limit(1)
          )[0]?.id
        : (await findAccessResource(resourceType, resourceId))?.organizationId;
  if (!organizationId) return false;
  const [owner] = await db
    .select({ id: roleBindings.id })
    .from(roleBindings)
    .innerJoin(roles, eq(roles.id, roleBindings.roleId))
    .innerJoin(users, eq(users.id, roleBindings.principalId))
    .innerJoin(
      organizationMembers,
      and(
        eq(organizationMembers.userId, roleBindings.principalId),
        eq(organizationMembers.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(roleBindings.principalType, "user"),
        eq(roleBindings.principalId, userId),
        eq(roleBindings.resourceType, "organization"),
        eq(roleBindings.resourceId, organizationId),
        eq(roles.name, "organization.owner"),
        eq(roles.isSystem, true),
        eq(organizationMembers.status, "active"),
        eq(users.banned, false),
        or(
          isNull(roleBindings.expiresAt),
          gt(roleBindings.expiresAt, new Date()),
        ),
      ),
    )
    .limit(1);
  return Boolean(owner);
}

/** A stale, suspended or expired ownership binding cannot be the recovery owner. */
export async function hasAnotherActiveOwner(
  organizationId: string,
  exceptUserId: string,
) {
  const candidates = await db
    .select({ userId: roleBindings.principalId })
    .from(roleBindings)
    .innerJoin(roles, eq(roles.id, roleBindings.roleId))
    .where(
      and(
        eq(roleBindings.resourceType, "organization"),
        eq(roleBindings.resourceId, organizationId),
        eq(roleBindings.principalType, "user"),
        eq(roles.name, "organization.owner"),
        eq(roles.isSystem, true),
      ),
    );
  for (const { userId } of candidates)
    if (
      userId !== exceptUserId &&
      (await isOrganizationOwner(userId, "organization", organizationId))
    )
      return true;
  return false;
}
