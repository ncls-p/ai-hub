import { resolveStandardRole } from "./standard-role";
import { eq } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import { roles } from "@/server/infrastructure/db/schema";
import { requireSubordinatePrincipal } from "./delegation";
import {
  IamOperationError,
  requireDelegablePermissions,
  requirePermission,
  rolePermissions,
} from "./use-cases.iam-operation-error";

export async function validateInitialProjectRole(input: {
  actorUserId: string;
  workspaceId: string;
  userId: string;
  projectRoleId?: string;
}) {
  if (!input.projectRoleId) return null;
  let [role] = await db
    .select()
    .from(roles)
    .where(eq(roles.id, input.projectRoleId))
    .limit(1);
  if (role)
    role = await resolveStandardRole(role, "workspace", input.workspaceId);
  if (
    !role ||
    role.scopeType !== "workspace" ||
    (!role.isSystem &&
      (role.ownerResourceType !== "workspace" ||
        role.ownerResourceId !== input.workspaceId))
  )
    throw new IamOperationError(
      "This role cannot be used in this project",
      400,
    );
  await requirePermission({
    userId: input.actorUserId,
    permission: "roles.assign",
    resourceType: "workspace",
    resourceId: input.workspaceId,
    errorMessage: "You cannot grant project access",
  });
  await requireDelegablePermissions({
    ...input,
    resourceType: "workspace",
    resourceId: input.workspaceId,
    permissions: rolePermissions(role),
  });
  await requireSubordinatePrincipal({
    ...input,
    principalType: "user",
    principalId: input.userId,
    resourceType: "workspace",
    resourceId: input.workspaceId,
  });
  return role;
}
