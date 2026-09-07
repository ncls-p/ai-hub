import { findSystemRole } from "./use-cases.iam-operation-error";
import { policyMutation } from "./policy-mutation";
import { and, eq, inArray } from "drizzle-orm";

import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  organizationMembers,
  roleBindings,
  teamMembers,
  teams,
  workspaceMembers,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { listSourceBindings } from "./member-transfer.list-member-transfer-destinations";
import { previewMemberTransfer } from "./member-transfer.preview-member-transfer";
import { IamOperationError } from "./use-cases";

export const executeMemberTransfer = policyMutation(
  async function executeMemberTransfer(
    input: Parameters<typeof previewMemberTransfer>[0] & {
      confirmationToken: string;
    },
  ) {
    const preview = await previewMemberTransfer(input);
    if (preview.blockers.length > 0) {
      throw new IamOperationError(preview.blockers.join(" "), 409);
    }
    if (preview.confirmationToken !== input.confirmationToken) {
      throw new IamOperationError(
        "Access changed since the preview. Review the transfer again.",
        409,
      );
    }
    const userIds = preview.members.map(({ userId }) => userId);
    const crossOrganization = preview.destination.crossOrganization;
    const memberRole = crossOrganization
      ? await findSystemRole(
          "organization.user",
          preview.destination.organizationId,
        )
      : { id: "" };
    const sourceOrganizationWorkspaces =
      crossOrganization && input.mode === "move"
        ? await db
            .select({ id: workspaces.id })
            .from(workspaces)
            .where(eq(workspaces.organizationId, preview.source.organizationId))
        : [];
    const sourceOrganizationTeams =
      crossOrganization && input.mode === "move"
        ? await db
            .select({ id: teams.id })
            .from(teams)
            .where(eq(teams.organizationId, preview.source.organizationId))
        : [];
    const sourceBindings =
      input.mode === "move"
        ? await listSourceBindings({
            userIds,
            sourceWorkspaceId: input.sourceWorkspaceId,
            sourceOrganizationId: preview.source.organizationId,
            includeWholeOrganization: crossOrganization,
          })
        : [];

    const inactiveDestinationMembers = crossOrganization
      ? await db
          .select({
            userId: organizationMembers.userId,
            status: organizationMembers.status,
          })
          .from(organizationMembers)
          .where(
            and(
              eq(
                organizationMembers.organizationId,
                preview.destination.organizationId,
              ),
              inArray(organizationMembers.userId, userIds),
            ),
          )
      : [];
    const reactivatedIds = inactiveDestinationMembers
      .filter(({ status }) => status !== "active")
      .map(({ userId }) => userId);
    const staleBindings = reactivatedIds.length
      ? await listSourceBindings({
          userIds: reactivatedIds,
          sourceWorkspaceId: input.targetWorkspaceId,
          sourceOrganizationId: preview.destination.organizationId,
          includeWholeOrganization: true,
        })
      : [];
    const destinationTeams = reactivatedIds.length
      ? await db
          .select({ id: teams.id })
          .from(teams)
          .where(eq(teams.organizationId, preview.destination.organizationId))
      : [];

    await db.transaction(async (tx) => {
      if (staleBindings.length)
        await tx.delete(roleBindings).where(
          inArray(
            roleBindings.id,
            staleBindings.map(({ id }) => id),
          ),
        );
      if (destinationTeams.length)
        await tx.delete(teamMembers).where(
          and(
            inArray(teamMembers.userId, reactivatedIds),
            inArray(
              teamMembers.teamId,
              destinationTeams.map(({ id }) => id),
            ),
          ),
        );
      if (crossOrganization) {
        for (const userId of userIds) {
          await tx
            .insert(organizationMembers)
            .values({
              organizationId: preview.destination.organizationId,
              userId,
              status: "active",
            })
            .onConflictDoUpdate({
              target: [
                organizationMembers.organizationId,
                organizationMembers.userId,
              ],
              set: { status: "active", updatedAt: new Date() },
            });
          await tx
            .insert(roleBindings)
            .values({
              principalType: "user",
              principalId: userId,
              roleId: memberRole.id,
              resourceType: "organization",
              resourceId: preview.destination.organizationId,
              createdById: input.actorUserId,
            })
            .onConflictDoNothing();
        }
      }
      await tx
        .insert(roleBindings)
        .values(
          userIds.map((userId) => ({
            principalType: "user" as const,
            principalId: userId,
            roleId: input.roleId,
            resourceType: "workspace" as const,
            resourceId: input.targetWorkspaceId,
            createdById: input.actorUserId,
          })),
        )
        .onConflictDoNothing();

      if (input.mode === "move") {
        if (sourceBindings.length > 0) {
          await tx.delete(roleBindings).where(
            inArray(
              roleBindings.id,
              sourceBindings.map(({ id }) => id),
            ),
          );
        }
        if (crossOrganization) {
          if (sourceOrganizationTeams.length > 0) {
            await tx.delete(teamMembers).where(
              and(
                inArray(teamMembers.userId, userIds),
                inArray(
                  teamMembers.teamId,
                  sourceOrganizationTeams.map(({ id }) => id),
                ),
              ),
            );
          }
          if (sourceOrganizationWorkspaces.length > 0) {
            await tx.delete(workspaceMembers).where(
              and(
                inArray(workspaceMembers.userId, userIds),
                inArray(
                  workspaceMembers.workspaceId,
                  sourceOrganizationWorkspaces.map(({ id }) => id),
                ),
              ),
            );
          }
          await tx
            .update(organizationMembers)
            .set({ status: "removed", updatedAt: new Date() })
            .where(
              and(
                eq(
                  organizationMembers.organizationId,
                  preview.source.organizationId,
                ),
                inArray(organizationMembers.userId, userIds),
              ),
            );
        }
      }
    });

    await Promise.all(
      userIds.map((userId) =>
        authorization.invalidatePrincipalPermissionCache(userId),
      ),
    );
    await audit.emit({
      organizationId: preview.destination.organizationId,
      workspaceId: input.targetWorkspaceId,
      actorPrincipalType: "user",
      actorPrincipalId: input.actorUserId,
      action:
        input.mode === "move"
          ? "organization.members.moved"
          : "organization.members.added_to_project",
      resourceType: "workspace",
      resourceId: input.targetWorkspaceId,
      outcome: "success",
      metadata: {
        sourceWorkspaceId: input.sourceWorkspaceId,
        userIds,
        roleId: input.roleId,
        crossOrganization,
      },
    });
    return { transferred: userIds.length, preview };
  },
);
