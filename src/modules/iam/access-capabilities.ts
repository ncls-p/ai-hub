import { standardRoleKey } from "./standard-role";
import { isOrganizationOwner } from "./organization-owner";
import { authorization } from "@/server/domain/services/authorization";
import { requireManageableRole } from "./delegation";
import {
  canDelegatePermissionSet,
  isSubordinatePermissionSet,
  matchesPermission,
} from "./permission-matching";
import {
  IamOperationError,
  rolePermissions,
} from "./use-cases.iam-operation-error";

type ScopedRole = {
  id: string;
  scopeType: string;
  isSystem: boolean;
  permissionsJson: unknown;
  name: string;
};
export async function roleCapabilities(
  userId: string,
  roleRows: ScopedRole[],
  organization: string[],
  workspace: string[],
  organizationId: string,
) {
  const owner = await isOrganizationOwner(
    userId,
    "organization",
    organizationId,
  );
  const result = new Map<string, { canUpdate: boolean; canDelete: boolean }>();
  for (const role of roleRows) {
    const permissions =
      role.scopeType === "organization" ? organization : workspace;
    const canDelegate =
      (!role.isSystem || (owner && role.name !== "organization.owner")) &&
      canDelegatePermissionSet(permissions, rolePermissions(role));
    let canManage = canDelegate;
    if (canManage && !role.isSystem) {
      try {
        await requireManageableRole({ actorUserId: userId, roleId: role.id });
      } catch (error) {
        if (!(error instanceof IamOperationError)) throw error;
        canManage = false;
      }
    }
    result.set(role.id, {
      canUpdate:
        canManage &&
        permissions.some((grant) => matchesPermission(grant, "roles.update")),
      canDelete:
        !standardRoleKey(role) &&
        canManage &&
        permissions.some((grant) => matchesPermission(grant, "roles.delete")),
    });
  }
  return result;
}

export async function subordinateMemberIds(
  userId: string,
  members: { userId: string }[],
  scope: "organization" | "workspace",
  resourceId: string,
  actor: string[],
) {
  if (await isOrganizationOwner(userId, scope, resourceId))
    return members.map((member) => member.userId);
  const ids = await Promise.all(
    members.map(async (member) => {
      if (member.userId === userId) return null;
      const target = await authorization.listPermissions(
        { principalType: "user", principalId: member.userId },
        scope,
        resourceId,
      );
      return isSubordinatePermissionSet(actor, target) ? member.userId : null;
    }),
  );
  return ids.filter((id): id is string => id !== null);
}
