import { policyMutation } from "./policy-mutation";
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
  organizationBuiltinToolPolicies,
  organizationMembers,
  roleBindings,
  roles,
  teamMembers,
  teams,
  workspaceMembers,
  workspaces,
} from "@/server/infrastructure/db/schema";

import { previewOrganizationClone } from "./organization-transfer.preview-organization-clone";
import { IamOperationError } from "./use-cases";
import { cloneWorkspaceConfiguration } from "./workspace-clone";

export const executeOrganizationClone = policyMutation(
  async function executeOrganizationClone(
    input: Parameters<typeof previewOrganizationClone>[0] & {
      confirmationToken: string;
    },
  ) {
    const preview = await previewOrganizationClone(input);
    if (preview.confirmationToken !== input.confirmationToken) {
      throw new IamOperationError(
        "The clone changed. Review it again before confirming.",
        409,
      );
    }
    const sourceOrganizationId = preview.source.organizationId;
    const targetOrganizationId = preview.destination.organizationId;
    const suffix = `copy-${randomUUID().slice(0, 8)}`;
    const sourceProjects = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.organizationId, sourceOrganizationId));
    const sourceMembers = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, sourceOrganizationId),
          eq(organizationMembers.status, "active"),
        ),
      );
    const sourceTeams = await db
      .select()
      .from(teams)
      .where(eq(teams.organizationId, sourceOrganizationId));
    const sourceCustomRoles = await db
      .select()
      .from(roles)
      .where(
        and(
          eq(roles.isSystem, false),
          eq(roles.ownerResourceType, "organization"),
          eq(roles.ownerResourceId, sourceOrganizationId),
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

    const clonedProjects = await db.transaction(async (tx) => {
      const teamMap = new Map<string, string>();
      const roleMap = new Map<string, string>();
      for (const member of sourceMembers) {
        await tx
          .insert(organizationMembers)
          .values({
            organizationId: targetOrganizationId,
            userId: member.userId,
            status: "active",
          })
          .onConflictDoUpdate({
            target: [
              organizationMembers.organizationId,
              organizationMembers.userId,
            ],
            set: { status: "active", updatedAt: new Date() },
          });
      }
      for (const source of sourceTeams) {
        const id = randomUUID();
        teamMap.set(source.id, id);
        await tx.insert(teams).values({
          ...source,
          id,
          organizationId: targetOrganizationId,
          slug: `${source.slug}-${suffix}`,
          isDefault: false,
          createdById: input.actorUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        const members = await tx
          .select()
          .from(teamMembers)
          .where(eq(teamMembers.teamId, source.id));
        if (members.length > 0) {
          await tx.insert(teamMembers).values(
            members.map((member) => ({
              id: randomUUID(),
              teamId: id,
              userId: member.userId,
              createdAt: new Date(),
            })),
          );
        }
      }
      for (const source of sourceCustomRoles) {
        const id = randomUUID();
        roleMap.set(source.id, id);
        await tx.insert(roles).values({
          ...source,
          id,
          ownerResourceId: targetOrganizationId,
          name: `${source.name}-${suffix}`,
          createdById: input.actorUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      for (const source of sourceBindings) {
        const principalId =
          source.principalType === "group"
            ? teamMap.get(source.principalId)
            : source.principalId;
        if (!principalId) continue;
        await tx
          .insert(roleBindings)
          .values({
            ...source,
            id: randomUUID(),
            principalId,
            roleId: roleMap.get(source.roleId) ?? source.roleId,
            resourceId: targetOrganizationId,
            createdById: input.actorUserId,
            createdAt: new Date(),
          })
          .onConflictDoNothing();
      }
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
      const adminRole = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.isSystem, true), eq(roles.name, "workspace.admin")))
        .limit(1);
      if (!adminRole[0]) {
        throw new IamOperationError(
          "Project administrator role is missing",
          500,
        );
      }
      const results: { sourceWorkspaceId: string; workspaceId: string }[] = [];
      for (const source of sourceProjects) {
        const workspaceId = randomUUID();
        await tx.insert(workspaces).values({
          ...source,
          id: workspaceId,
          organizationId: targetOrganizationId,
          name: `${source.name} (copy)`,
          slug: `${source.slug}-${suffix}`,
          createdById: input.actorUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
          archivedAt: null,
        });
        await tx
          .insert(workspaceMembers)
          .values({
            workspaceId,
            userId: input.actorUserId,
            status: "active",
          })
          .onConflictDoNothing();
        await tx
          .insert(roleBindings)
          .values({
            principalType: "user",
            principalId: input.actorUserId,
            roleId: adminRole[0].id,
            resourceType: "workspace",
            resourceId: workspaceId,
            createdById: input.actorUserId,
          })
          .onConflictDoNothing();
        await cloneWorkspaceConfiguration(tx, {
          actorUserId: input.actorUserId,
          sourceWorkspaceId: source.id,
          targetWorkspaceId: workspaceId,
          targetOrganizationId,
          secretPolicy: input.secretPolicy,
          groupPrincipalMap: teamMap,
        });
        results.push({ sourceWorkspaceId: source.id, workspaceId });
      }
      return results;
    });

    await audit.emit({
      organizationId: targetOrganizationId,
      workspaceId: preview.destination.workspaceId,
      actorPrincipalType: "user",
      actorPrincipalId: input.actorUserId,
      action: "organization.cloned",
      resourceType: "organization",
      resourceId: targetOrganizationId,
      outcome: "success",
      metadata: {
        sourceOrganizationId,
        targetOrganizationId,
        counts: preview.counts,
        clonedProjects,
        secretPolicy: input.secretPolicy,
      },
    });
    return {
      cloned: preview.counts,
      projects: clonedProjects,
      destination: preview.destination,
    };
  },
);
