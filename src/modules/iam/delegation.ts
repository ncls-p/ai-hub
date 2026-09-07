import { isOrganizationOwner } from "./organization-owner";
import { and, eq } from "drizzle-orm";
import {
  authorization,
  type ResourceType,
} from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  roleBindings,
  roles,
  teamMembers,
  organizationMembers,
  workspaceMembers,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { isSubordinatePermissionSet } from "./permission-matching";
import {
  IamOperationError,
  requireDelegablePermissions,
  rolePermissions,
} from "./use-cases.iam-operation-error";

/** Resolve both explicit teams and the virtual organization/project groups. */
export async function groupUserIds(groupId: string): Promise<string[]> {
  const rows = await Promise.all([
    db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, groupId)),
    db
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, groupId),
          eq(organizationMembers.status, "active"),
        ),
      ),
    db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, groupId),
          eq(workspaceMembers.status, "active"),
        ),
      ),
    db
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .innerJoin(
        workspaces,
        eq(workspaces.organizationId, organizationMembers.organizationId),
      )
      .where(
        and(
          eq(workspaces.id, groupId),
          eq(organizationMembers.status, "active"),
        ),
      ),
  ]);
  return [...new Set(rows.flat().map(({ userId }) => userId))];
}

/** A team is a grant to every member, including the actor when they belong to it. */
export async function requireSubordinatePrincipal(input: {
  actorUserId: string;
  principalType: string;
  principalId: string;
  resourceType: ResourceType;
  resourceId: string;
}) {
  const userIds =
    input.principalType === "user"
      ? [input.principalId]
      : input.principalType === "group"
        ? await groupUserIds(input.principalId)
        : null;
  if (!userIds)
    throw new IamOperationError(
      "This principal cannot be administered here",
      403,
    );
  if (
    await isOrganizationOwner(
      input.actorUserId,
      input.resourceType,
      input.resourceId,
    )
  )
    return;
  const actorPermissions = await authorization.listPermissions(
    { principalType: "user", principalId: input.actorUserId },
    input.resourceType,
    input.resourceId,
  );
  for (const userId of userIds) {
    if (userId === input.actorUserId)
      throw new IamOperationError(
        "You cannot change your own access, including through a team or role",
        403,
      );
    const targetPermissions = await authorization.listPermissions(
      { principalType: "user", principalId: userId },
      input.resourceType,
      input.resourceId,
    );
    if (!isSubordinatePermissionSet(actorPermissions, targetPermissions)) {
      throw new IamOperationError(
        "You can only manage members with strictly lower access at this scope",
        403,
      );
    }
  }
}

/** Check every affected binding, not only the role's new permission list. */
export async function requireManageableRole(input: {
  actorUserId: string;
  roleId: string;
}) {
  const bindings = await db
    .select()
    .from(roleBindings)
    .where(eq(roleBindings.roleId, input.roleId));
  for (const binding of bindings) {
    await requireSubordinatePrincipal({ ...input, ...binding });
  }
}

/** Team membership changes confer/revoke every role already assigned to the team. */
export async function requireManageableTeam(input: {
  actorUserId: string;
  teamId: string;
  userId?: string;
}) {
  const bindings = await db
    .select({ binding: roleBindings, role: roles })
    .from(roleBindings)
    .innerJoin(roles, eq(roleBindings.roleId, roles.id))
    .where(
      and(
        eq(roleBindings.principalType, "group"),
        eq(roleBindings.principalId, input.teamId),
      ),
    );
  for (const { binding, role } of bindings) {
    await requireDelegablePermissions({
      ...input,
      resourceType: binding.resourceType,
      resourceId: binding.resourceId,
      permissions: rolePermissions(role),
    });
    await requireSubordinatePrincipal({
      ...input,
      principalType: input.userId ? "user" : "group",
      principalId: input.userId ?? input.teamId,
      resourceType: binding.resourceType,
      resourceId: binding.resourceId,
    });
  }
}
