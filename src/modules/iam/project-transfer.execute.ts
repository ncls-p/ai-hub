import { and, eq } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  organizationMembers,
  roleBindings,
  roles,
  teams,
  teamMembers,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { policyMutation } from "./policy-mutation";
import { IamOperationError } from "./use-cases";
import {
  planProjectTransfer,
  type ProjectTransferInput,
} from "./project-transfer.preview";

export const executeProjectTransfer = policyMutation(
  async (input: ProjectTransferInput & { confirmationToken: string }) => {
    const plan = await planProjectTransfer(input);
    if (plan.confirmationToken !== input.confirmationToken)
      throw new IamOperationError(
        "The project or its access changed. Preview the transfer again.",
        409,
      );
    const now = new Date();
    const nextValue = (type: string, id: string, fallback: string) =>
      plan.conflictResolutions.find(
        (r) => r.resourceType === type && r.resourceId === id,
      )?.to ?? fallback;
    await db.transaction(async (tx) => {
      const [memberRole] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(
          and(eq(roles.isSystem, true), eq(roles.name, "organization.user")),
        );
      if (!memberRole) throw new Error("Organization member role is missing");
      for (const userId of plan.memberIds) {
        await tx
          .insert(organizationMembers)
          .values({
            organizationId: plan.destination.id,
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
        await tx
          .insert(roleBindings)
          .values({
            principalType: "user",
            principalId: userId,
            roleId: memberRole.id,
            resourceType: "organization",
            resourceId: plan.destination.id,
            createdById: input.actorUserId,
          })
          .onConflictDoNothing();
      }
      // Copy linked teams: their source organization and other project assignments stay intact.
      const teamMap = new Map<string, string>();
      for (const team of plan.linkedTeams) {
        const [copy] = await tx
          .insert(teams)
          .values({
            organizationId: plan.destination.id,
            name: team.name,
            slug: nextValue("team", team.id, team.slug),
            createdById: input.actorUserId,
          })
          .returning({ id: teams.id });
        teamMap.set(team.id, copy.id);
        const members = plan.memberships.filter(
          (m) => m.teamId === team.id && plan.memberIds.includes(m.userId),
        );
        if (members.length)
          await tx
            .insert(teamMembers)
            .values(
              members.map((m) => ({ teamId: copy.id, userId: m.userId })),
            );
      }
      const roleMap = new Map<string, string>();
      for (const role of plan.customRoles) {
        const [copy] = await tx
          .insert(roles)
          .values({
            scopeType: "workspace",
            ownerResourceType: "workspace",
            ownerResourceId: plan.project.id,
            name: nextValue("role", role.id, role.name),
            displayName: role.displayName,
            description: role.description,
            permissionsJson: role.permissionsJson,
            createdById: input.actorUserId,
          })
          .returning({ id: roles.id });
        roleMap.set(role.id, copy.id);
      }
      for (const binding of plan.bindings) {
        const principalId =
          binding.principalType === "group"
            ? (teamMap.get(binding.principalId) ??
              (binding.principalId === plan.source.organizationId
                ? plan.destination.id
                : binding.principalId))
            : binding.principalId;
        await tx
          .update(roleBindings)
          .set({
            principalId,
            roleId: roleMap.get(binding.roleId) ?? binding.roleId,
          })
          .where(eq(roleBindings.id, binding.id));
      }
      const moved = await tx
        .update(workspaces)
        .set({
          organizationId: plan.destination.id,
          slug: nextValue("project", plan.project.id, plan.project.slug),
          updatedAt: now,
        })
        .where(
          and(
            eq(workspaces.id, plan.project.id),
            eq(workspaces.organizationId, plan.source.organizationId),
          ),
        )
        .returning({ id: workspaces.id });
      if (!moved.length)
        throw new IamOperationError(
          "The project changed. Preview the transfer again.",
          409,
        );
    });
    await authorization.invalidateAllPermissionCaches();
    await audit.emit({
      actorPrincipalType: "user",
      actorPrincipalId: input.actorUserId,
      organizationId: plan.destination.id,
      workspaceId: plan.project.id,
      resourceType: "workspace",
      resourceId: plan.project.id,
      action: "workspace.organization.transferred",
      outcome: "success",
      metadata: {
        sourceOrganizationId: plan.source.organizationId,
        targetOrganizationId: plan.destination.id,
        counts: plan.counts,
      },
    });
    return {
      workspaceId: plan.project.id,
      organizationId: plan.destination.id,
      counts: plan.counts,
    };
  },
);
