import { policyMutation } from "./policy-mutation";
import { and, eq, inArray } from "drizzle-orm";

import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  organizationBuiltinToolPolicies,
  organizationMembers,
  roleBindings,
  roles,
  teams,
  workspaces,
} from "@/server/infrastructure/db/schema";

import { previewOrganizationTransfer } from "./organization-transfer.preview-organization-transfer";
import { IamOperationError } from "./use-cases";

export const executeOrganizationTransfer = policyMutation(
  async function executeOrganizationTransfer(
    input: Parameters<typeof previewOrganizationTransfer>[0] & {
      confirmationToken: string;
    },
  ) {
    const preview = await previewOrganizationTransfer(input);
    if (preview.blockers.length > 0) {
      throw new IamOperationError(preview.blockers.join(". "), 409);
    }
    if (preview.confirmationToken !== input.confirmationToken) {
      throw new IamOperationError(
        "The migration changed. Review it again before confirming.",
        409,
      );
    }
    const now = new Date();
    const sourceOrganizationId = preview.source.organizationId;
    const targetOrganizationId = preview.destination.organizationId;
    const memberRows = await db
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, sourceOrganizationId),
          eq(organizationMembers.status, "active"),
        ),
      );
    const sourceBindings = await db
      .select()
      .from(roleBindings)
      .where(
        and(
          eq(roleBindings.resourceType, "organization"),
          eq(roleBindings.resourceId, sourceOrganizationId),
        ),
      );
    const sourcePolicies = await db
      .select()
      .from(organizationBuiltinToolPolicies)
      .where(
        eq(
          organizationBuiltinToolPolicies.organizationId,
          sourceOrganizationId,
        ),
      );

    await db.transaction(async (tx) => {
      for (const resolution of preview.conflictResolutions) {
        if (resolution.resourceType === "project") {
          await tx
            .update(workspaces)
            .set({ slug: resolution.to, updatedAt: now })
            .where(eq(workspaces.id, resolution.resourceId));
        } else if (resolution.resourceType === "team") {
          await tx
            .update(teams)
            .set({ slug: resolution.to, updatedAt: now })
            .where(eq(teams.id, resolution.resourceId));
        } else {
          await tx
            .update(roles)
            .set({ name: resolution.to, updatedAt: now })
            .where(eq(roles.id, resolution.resourceId));
        }
      }
      for (const { userId } of memberRows) {
        await tx
          .insert(organizationMembers)
          .values({
            organizationId: targetOrganizationId,
            userId,
            status: "active",
          })
          .onConflictDoUpdate({
            target: [
              organizationMembers.organizationId,
              organizationMembers.userId,
            ],
            set: { status: "active", updatedAt: now },
          });
      }
      if (sourceBindings.length > 0) {
        await tx
          .insert(roleBindings)
          .values(
            sourceBindings.map((binding) => ({
              principalType: binding.principalType,
              principalId: binding.principalId,
              roleId: binding.roleId,
              resourceType: "organization" as const,
              resourceId: targetOrganizationId,
              conditionJson: binding.conditionJson,
              expiresAt: binding.expiresAt,
              createdById: binding.createdById,
            })),
          )
          .onConflictDoNothing();
        await tx.delete(roleBindings).where(
          inArray(
            roleBindings.id,
            sourceBindings.map(({ id }) => id),
          ),
        );
      }
      await tx
        .update(roles)
        .set({ ownerResourceId: targetOrganizationId, updatedAt: now })
        .where(
          and(
            eq(roles.isSystem, false),
            eq(roles.ownerResourceType, "organization"),
            eq(roles.ownerResourceId, sourceOrganizationId),
          ),
        );
      await tx
        .update(teams)
        .set({ organizationId: targetOrganizationId, updatedAt: now })
        .where(eq(teams.organizationId, sourceOrganizationId));
      await tx
        .update(workspaces)
        .set({ organizationId: targetOrganizationId, updatedAt: now })
        .where(eq(workspaces.organizationId, sourceOrganizationId));
      for (const policy of sourcePolicies) {
        await tx
          .insert(organizationBuiltinToolPolicies)
          .values({
            organizationId: targetOrganizationId,
            toolName: policy.toolName,
            enabled: policy.enabled,
            requireApproval: policy.requireApproval,
            updatedById: input.actorUserId,
          })
          .onConflictDoNothing();
      }
      if (sourcePolicies.length > 0) {
        await tx.delete(organizationBuiltinToolPolicies).where(
          inArray(
            organizationBuiltinToolPolicies.id,
            sourcePolicies.map(({ id }) => id),
          ),
        );
      }
      if (memberRows.length > 0) {
        await tx
          .update(organizationMembers)
          .set({ status: "removed", updatedAt: now })
          .where(
            and(
              eq(organizationMembers.organizationId, sourceOrganizationId),
              inArray(
                organizationMembers.userId,
                memberRows.map(({ userId }) => userId),
              ),
            ),
          );
      }
    });

    await Promise.all(
      memberRows.map(({ userId }) =>
        authorization.invalidatePrincipalPermissionCache(userId),
      ),
    );
    await audit.emit({
      organizationId: targetOrganizationId,
      workspaceId: preview.destination.workspaceId,
      actorPrincipalType: "user",
      actorPrincipalId: input.actorUserId,
      action: "organization.transferred",
      resourceType: "organization",
      resourceId: sourceOrganizationId,
      outcome: "success",
      metadata: {
        sourceOrganizationId,
        targetOrganizationId,
        counts: preview.counts,
      },
    });
    return {
      transferred: preview.counts,
      destination: preview.destination,
    };
  },
);
