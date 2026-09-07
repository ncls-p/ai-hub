import { hasAnotherActiveOwner } from "./organization-owner";
import { policyMutation } from "./policy-mutation";
import { requireManageableOrganizationMember } from "./organization-member-delegation";
import { and, eq, inArray } from "drizzle-orm";

import { logger } from "@/lib/logger";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
  organizationMembers,
  roleBindings,
  teamMembers,
  teams,
  workspaceMembers,
  workspaces,
} from "@/server/infrastructure/db/schema";
import {
  findSystemRole,
  getWorkspaceScope,
  IamOperationError,
  invalidateUserOrganizationAccess,
  requirePermission,
} from "./use-cases.iam-operation-error";

export const removeOrganizationMember = policyMutation(
  async function removeOrganizationMember(input: {
    actorUserId: string;
    workspaceId: string;
    userId: string;
  }) {
    const { organization } = await getWorkspaceScope(input.workspaceId);
    await requirePermission({
      userId: input.actorUserId,
      permission: "members.delete",
      resourceType: "organization",
      resourceId: organization.id,
      errorMessage: "You do not have permission to manage organization members",
    });
    if (input.userId === input.actorUserId) {
      throw new IamOperationError(
        "You cannot remove your own organization access",
        409,
      );
    }
    const affectedBindings = await requireManageableOrganizationMember({
      ...input,
      organizationId: organization.id,
    });
    const ownerRole = await findSystemRole("organization.owner");
    const [ownerBinding] = await db
      .select({ id: roleBindings.id })
      .from(roleBindings)
      .where(
        and(
          eq(roleBindings.principalType, "user"),
          eq(roleBindings.principalId, input.userId),
          eq(roleBindings.roleId, ownerRole.id),
          eq(roleBindings.resourceType, "organization"),
          eq(roleBindings.resourceId, organization.id),
        ),
      )
      .limit(1);
    if (ownerBinding) {
      if (!(await hasAnotherActiveOwner(organization.id, input.userId))) {
        throw new IamOperationError(
          "Assign another organization owner before removing this member",
          409,
        );
      }
    }

    const memberTeams = await db
      .select({ id: teams.id })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(
        and(
          eq(teamMembers.userId, input.userId),
          eq(teams.organizationId, organization.id),
        ),
      );

    await db.transaction(async (tx) => {
      if (memberTeams.length > 0) {
        await tx.delete(teamMembers).where(
          and(
            eq(teamMembers.userId, input.userId),
            inArray(
              teamMembers.teamId,
              memberTeams.map(({ id }) => id),
            ),
          ),
        );
      }
      await tx.delete(workspaceMembers).where(
        and(
          eq(workspaceMembers.userId, input.userId),
          inArray(
            workspaceMembers.workspaceId,
            (
              await tx
                .select({ id: workspaces.id })
                .from(workspaces)
                .where(eq(workspaces.organizationId, organization.id))
            ).map(({ id }) => id),
          ),
        ),
      );
      if (affectedBindings.length)
        await tx.delete(roleBindings).where(
          inArray(
            roleBindings.id,
            affectedBindings.map(({ id }) => id),
          ),
        );
      await tx
        .update(organizationMembers)
        .set({ status: "removed", updatedAt: new Date() })
        .where(
          and(
            eq(organizationMembers.organizationId, organization.id),
            eq(organizationMembers.userId, input.userId),
          ),
        );
    });

    await invalidateUserOrganizationAccess(input.userId, organization.id);
    await audit.emit({
      organizationId: organization.id,
      workspaceId: input.workspaceId,
      actorPrincipalType: "user",
      actorPrincipalId: input.actorUserId,
      action: "organization.member.removed",
      resourceType: "organization",
      resourceId: organization.id,
      outcome: "success",
      metadata: { memberUserId: input.userId },
    });
    logger.info("Organization member removed", {
      organizationId: organization.id,
      userId: input.userId,
      actorUserId: input.actorUserId,
    });
  },
);
