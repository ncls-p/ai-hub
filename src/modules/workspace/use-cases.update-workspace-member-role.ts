import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  roleBindings,
  workspaceMembers,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { and, eq } from "drizzle-orm";
import { getSystemWorkspaceRole } from "./use-cases.get-system-workspace-role";
import {
  WORKSPACE_SCOPE,
  WorkspaceRoleName,
} from "./use-cases.workspace-scope";

export async function updateWorkspaceMemberRole(input: {
  workspaceId: string;
  userId: string;
  roleName: WorkspaceRoleName;
  updatedBy: string;
}) {
  const { workspaceId, userId, roleName, updatedBy } = input;

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) throw new Error("Workspace not found");

  const role = await getSystemWorkspaceRole(roleName, workspaceId);
  if (!role) throw new Error(`Role not found: ${roleName}`);

  const [member] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, "active"),
      ),
    )
    .limit(1);
  if (!member) throw new Error("Member not found");

  await db.transaction(async (tx) => {
    await tx
      .delete(roleBindings)
      .where(
        and(
          eq(roleBindings.principalType, "user"),
          eq(roleBindings.principalId, userId),
          eq(roleBindings.resourceType, WORKSPACE_SCOPE),
          eq(roleBindings.resourceId, workspaceId),
        ),
      );

    await tx.insert(roleBindings).values({
      principalType: "user",
      principalId: userId,
      roleId: role.id,
      resourceType: WORKSPACE_SCOPE,
      resourceId: workspaceId,
      createdById: updatedBy,
    });
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
    actorPrincipalId: updatedBy,
    action: "workspace.member.roleUpdated",
    resourceType: WORKSPACE_SCOPE,
    resourceId: workspaceId,
    outcome: "success",
    metadata: { userId, roleName },
  });
}
