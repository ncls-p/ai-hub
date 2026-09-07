import { policyMutation } from "./policy-mutation";
import { and, eq, inArray } from "drizzle-orm";

import { type AccessResourceType } from "@/server/domain/entities/access-resource";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  organizationMembers,
  roleBindings,
  roles,
  teamMembers,
  workspaceMembers,
} from "@/server/infrastructure/db/schema";

import { applyResourceTransferTransaction } from "./resource-transfer.apply-transaction";
import { findIncompatibleAssignmentIds } from "./resource-transfer.find-incompatible-assignment-ids";
import { previewResourceTransfer } from "./resource-transfer.preview-resource-transfer";
import {
  RESOURCE_TYPES,
  ResourceTransferOptions,
  ResourceTransferRootType,
} from "./resource-transfer.transfer-access-policies";
import { IamOperationError } from "./use-cases";

export type ResourceTransferExecutionInput = {
  actorUserId: string;
  sourceWorkspaceId: string;
  targetWorkspaceId: string;
  resourceType: ResourceTransferRootType;
  resourceId: string;
  options: ResourceTransferOptions;
  confirmationToken: string;
};

export const executeResourceTransfer = policyMutation(
  async function executeResourceTransfer(
    input: ResourceTransferExecutionInput,
  ) {
    const preview = await previewResourceTransfer(input);
    if (preview.blockers.length > 0) {
      throw new IamOperationError(preview.blockers.join(". "), 409);
    }
    if (preview.confirmationToken !== input.confirmationToken) {
      throw new IamOperationError(
        "The transfer preview changed. Review it again before confirming.",
        409,
      );
    }
    const byType = (type: AccessResourceType) =>
      preview.items.filter((item) => item.type === type).map((item) => item.id);
    const now = new Date();
    const targetWorkspaceId = input.targetWorkspaceId;
    const crossOrganization = preview.crossOrganization;
    const assignmentIdsToRemove = await findIncompatibleAssignmentIds(
      preview.items,
      targetWorkspaceId,
      preview.destination.organizationId,
      input.options.accessPolicy,
    );
    const organizationUserRows = await db
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(
        inArray(organizationMembers.organizationId, [
          preview.source.organizationId,
          preview.destination.organizationId,
        ]),
      );
    const directPrincipalRows = (
      await Promise.all(
        RESOURCE_TYPES.map(async (type) => {
          const resourceIds = preview.items
            .filter((item) => item.type === type)
            .map((item) => item.id);
          if (resourceIds.length === 0) return [];
          return db
            .select({
              principalType: roleBindings.principalType,
              principalId: roleBindings.principalId,
            })
            .from(roleBindings)
            .where(
              and(
                eq(roleBindings.resourceType, type),
                inArray(roleBindings.resourceId, resourceIds),
              ),
            );
        }),
      )
    ).flat();
    const directTeamIds = directPrincipalRows
      .filter(({ principalType }) => principalType === "group")
      .map(({ principalId }) => principalId);
    const directTeamMemberRows =
      directTeamIds.length > 0
        ? await db
            .select({ userId: teamMembers.userId })
            .from(teamMembers)
            .where(inArray(teamMembers.teamId, directTeamIds))
        : [];
    const affectedUserIds = new Set([
      input.actorUserId,
      ...organizationUserRows.map(({ userId }) => userId),
      ...directPrincipalRows
        .filter(({ principalType }) => principalType === "user")
        .map(({ principalId }) => principalId),
      ...directTeamMemberRows.map(({ userId }) => userId),
    ]);
    const projectMemberRows =
      input.resourceType === "workspace"
        ? await db
            .select({ userId: workspaceMembers.userId })
            .from(workspaceMembers)
            .where(
              and(
                eq(workspaceMembers.workspaceId, input.sourceWorkspaceId),
                eq(workspaceMembers.status, "active"),
              ),
            )
        : [];
    for (const { userId } of projectMemberRows) affectedUserIds.add(userId);
    const [organizationMemberRole, workspaceMemberRole] =
      input.resourceType === "workspace"
        ? await Promise.all([
            db
              .select({ id: roles.id })
              .from(roles)
              .where(
                and(
                  eq(roles.isSystem, true),
                  eq(roles.name, "organization.user"),
                ),
              )
              .limit(1)
              .then((rows) => rows[0]),
            db
              .select({ id: roles.id })
              .from(roles)
              .where(
                and(
                  eq(roles.isSystem, true),
                  eq(roles.name, "workspace.member"),
                ),
              )
              .limit(1)
              .then((rows) => rows[0]),
          ])
        : [undefined, undefined];
    if (
      input.resourceType === "workspace" &&
      (!organizationMemberRole || !workspaceMemberRole)
    ) {
      throw new IamOperationError("System member roles are unavailable", 409);
    }
    const workspaceBindings =
      input.resourceType === "workspace"
        ? await db
            .select()
            .from(roleBindings)
            .where(
              and(
                eq(roleBindings.resourceType, "workspace"),
                eq(roleBindings.resourceId, input.sourceWorkspaceId),
              ),
            )
        : [];
    const transferableWorkspaceBindings = workspaceBindings.filter(
      ({ principalType }) => !crossOrganization || principalType !== "group",
    );

    await applyResourceTransferTransaction({
      input,
      preview,
      assignmentIdsToRemove,
      now,
      targetWorkspaceId,
      crossOrganization,
      byType,
      workspaceBindings,
      transferableWorkspaceBindings,
      projectMemberRows,
      organizationMemberRole,
      workspaceMemberRole,
    });

    await Promise.all(
      [...affectedUserIds].map((userId) =>
        authorization.invalidatePrincipalPermissionCache(userId),
      ),
    );
    await audit.emit({
      organizationId: preview.destination.organizationId,
      workspaceId: input.targetWorkspaceId,
      actorPrincipalType: "user",
      actorPrincipalId: input.actorUserId,
      action: "resource.transferred",
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      outcome: "success",
      metadata: {
        sourceWorkspaceId: input.sourceWorkspaceId,
        targetWorkspaceId: input.targetWorkspaceId,
        crossOrganization,
        itemCount: preview.items.length,
        options: input.options,
      },
    });

    return {
      transferred: preview.items.length,
      destination: preview.destination,
    };
  },
);
