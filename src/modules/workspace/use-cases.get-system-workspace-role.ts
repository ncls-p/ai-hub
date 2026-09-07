import { resolveStandardRole } from "@/modules/iam/standard-role";
import { logger } from "@/lib/logger";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  organizationMembers,
  roleBindings,
  roles,
  workspaceMembers,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { WORKSPACE_SCOPE } from "./use-cases.workspace-scope";

export async function getSystemWorkspaceRole(
  roleName: string,
  workspaceId?: string,
) {
  const [role] = await db
    .select()
    .from(roles)
    .where(
      and(
        eq(roles.scopeType, WORKSPACE_SCOPE),
        eq(roles.name, roleName),
        eq(roles.isSystem, true),
      ),
    )
    .limit(1);

  return role && workspaceId
    ? resolveStandardRole(role, "workspace", workspaceId)
    : (role ?? null);
}

export async function addWorkspaceMember(input: {
  workspaceId: string;
  userId: string;
  roleName?: string;
  invitedBy: string;
}) {
  const { workspaceId, userId, invitedBy } = input;
  const roleName = input.roleName ?? "workspace.member";

  try {
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.archivedAt)))
      .limit(1);

    if (!workspace) {
      throw new Error("Workspace not found");
    }

    const [existingMember] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .limit(1);

    if (existingMember?.status === "active") {
      throw new Error("User is already a workspace member");
    }

    const [existingOrganizationMember] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, workspace.organizationId),
          eq(organizationMembers.userId, userId),
        ),
      )
      .limit(1);

    const role = await getSystemWorkspaceRole(roleName, workspaceId);
    if (!role) {
      throw new Error(`Role not found: ${roleName}`);
    }

    await db.transaction(async (tx) => {
      if (existingOrganizationMember) {
        await tx
          .update(organizationMembers)
          .set({ status: "active", updatedAt: new Date() })
          .where(eq(organizationMembers.id, existingOrganizationMember.id));
      } else {
        await tx.insert(organizationMembers).values({
          organizationId: workspace.organizationId,
          userId,
          status: "active",
        });
      }

      if (existingMember) {
        await tx
          .update(workspaceMembers)
          .set({ status: "active", updatedAt: new Date() })
          .where(eq(workspaceMembers.id, existingMember.id));
      } else {
        await tx.insert(workspaceMembers).values({
          workspaceId,
          userId,
          status: "active",
        });
      }

      const [existingBinding] = await tx
        .select()
        .from(roleBindings)
        .where(
          and(
            eq(roleBindings.principalType, "user"),
            eq(roleBindings.principalId, userId),
            eq(roleBindings.resourceType, WORKSPACE_SCOPE),
            eq(roleBindings.resourceId, workspaceId),
          ),
        )
        .limit(1);

      if (existingBinding) {
        await tx
          .update(roleBindings)
          .set({ roleId: role.id })
          .where(eq(roleBindings.id, existingBinding.id));
      } else {
        await tx.insert(roleBindings).values({
          principalType: "user",
          principalId: userId,
          roleId: role.id,
          resourceType: WORKSPACE_SCOPE,
          resourceId: workspaceId,
          createdById: invitedBy,
        });
      }
    });

    await authorization.invalidatePermissionCache(
      userId,
      WORKSPACE_SCOPE,
      workspaceId,
    );

    await audit.emit({
      organizationId: workspace.organizationId,
      workspaceId,
      actorPrincipalType: "user",
      actorPrincipalId: invitedBy,
      action: "workspace.member.added",
      resourceType: WORKSPACE_SCOPE,
      resourceId: workspaceId,
      outcome: "success",
      metadata: { userId, roleName },
    });

    logger.info("Workspace member added", { workspaceId, userId, invitedBy });
  } catch (error) {
    logger.error(
      "Failed to add workspace member",
      { workspaceId, userId },
      error as Error,
    );
    throw error;
  }
}
