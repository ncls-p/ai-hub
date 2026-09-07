import { policyMutation } from "./policy-mutation";
import { and, eq, inArray, or } from "drizzle-orm";

import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  organizationMembers,
  organizations,
  roleBindings,
  roles,
  teams,
  workspaces,
} from "@/server/infrastructure/db/schema";

import {
  listAllResourceIds,
  nextWorkspaceOutsideOrganization,
  requirePermission,
  scopeForWorkspace,
} from "./scope-lifecycle.normalized-slug";
import { IamOperationError } from "./use-cases";

export const deleteOrganization = policyMutation(
  async function deleteOrganization(input: {
    actorUserId: string;
    workspaceId: string;
    confirmationName: string;
  }) {
    const { organization } = await scopeForWorkspace(input.workspaceId);
    await requirePermission({
      actorUserId: input.actorUserId,
      permission: "organization.delete",
      resourceType: "organization",
      resourceId: organization.id,
    });
    if (input.confirmationName.trim() !== organization.name) {
      throw new IamOperationError(
        "Type the exact organization name to confirm",
        400,
      );
    }
    const [projectRows, memberRows, teamRows, nextWorkspaceId] =
      await Promise.all([
        db
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.organizationId, organization.id)),
        db
          .select({ userId: organizationMembers.userId })
          .from(organizationMembers)
          .where(eq(organizationMembers.organizationId, organization.id)),
        db
          .select({ id: teams.id })
          .from(teams)
          .where(eq(teams.organizationId, organization.id)),
        nextWorkspaceOutsideOrganization(input.actorUserId, organization.id),
      ]);
    const workspaceIds = projectRows.map(({ id }) => id);
    const [resourceIds, customRoles] = await Promise.all([
      listAllResourceIds(workspaceIds),
      db
        .select({ id: roles.id })
        .from(roles)
        .where(
          and(
            eq(roles.isSystem, false),
            or(
              and(
                eq(roles.ownerResourceType, "organization"),
                eq(roles.ownerResourceId, organization.id),
              ),
              workspaceIds.length > 0
                ? and(
                    eq(roles.ownerResourceType, "workspace"),
                    inArray(roles.ownerResourceId, workspaceIds),
                  )
                : undefined,
            ),
          ),
        ),
    ]);
    const customRoleIds = customRoles.map(({ id }) => id);
    const teamIds = teamRows.map(({ id }) => id);
    await db.transaction(async (tx) => {
      if (teamIds.length > 0) {
        await tx
          .delete(roleBindings)
          .where(
            and(
              eq(roleBindings.principalType, "group"),
              inArray(roleBindings.principalId, teamIds),
            ),
          );
      }
      if (customRoleIds.length > 0) {
        await tx
          .delete(roleBindings)
          .where(inArray(roleBindings.roleId, customRoleIds));
        await tx.delete(roles).where(inArray(roles.id, customRoleIds));
      }
      const boundResourceIds = [
        organization.id,
        ...workspaceIds,
        ...resourceIds,
      ];
      await tx
        .delete(roleBindings)
        .where(inArray(roleBindings.resourceId, boundResourceIds));
      await tx
        .delete(organizations)
        .where(eq(organizations.id, organization.id));
    });
    await Promise.all(
      memberRows.map(({ userId }) =>
        authorization.invalidatePrincipalPermissionCache(userId),
      ),
    );
    await audit.emit({
      organizationId: organization.id,
      actorPrincipalType: "user",
      actorPrincipalId: input.actorUserId,
      action: "organization.deleted",
      resourceType: "organization",
      resourceId: organization.id,
      outcome: "success",
      metadata: {
        name: organization.name,
        slug: organization.slug,
        projects: workspaceIds.length,
      },
    });
    return { nextWorkspaceId };
  },
);
