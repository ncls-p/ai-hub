import { policyMutation } from "./policy-mutation";
import { and, eq } from "drizzle-orm";

import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import { roles } from "@/server/infrastructure/db/schema";
import {
  isKnownPermission,
  isPermissionCompatibleWithScope,
} from "./permission-catalog";
import {
  customRoleName,
  getWorkspaceScope,
  IamOperationError,
  requireDelegablePermissions,
  requirePermission,
  ScopeType,
} from "./use-cases.iam-operation-error";

export const createCustomRole = policyMutation(
  async function createCustomRole(input: {
    actorUserId: string;
    workspaceId: string;
    displayName: string;
    description?: string;
    scopeType: ScopeType;
    permissions: string[];
  }) {
    const { organization } = await getWorkspaceScope(input.workspaceId);
    await requirePermission({
      userId: input.actorUserId,
      permission: "roles.create",
      resourceType: input.scopeType,
      resourceId:
        input.scopeType === "organization"
          ? organization.id
          : input.workspaceId,
      errorMessage:
        input.scopeType === "organization"
          ? "You do not have permission to manage organization roles"
          : "You do not have permission to manage project roles",
    });
    const permissions = [...new Set(input.permissions)];
    if (permissions.length === 0) {
      throw new IamOperationError("Select at least one permission");
    }
    if (permissions.some((permission) => !isKnownPermission(permission))) {
      throw new IamOperationError(
        "The role contains an unsupported permission",
      );
    }
    if (
      permissions.some(
        (permission) =>
          !isPermissionCompatibleWithScope(permission, input.scopeType),
      )
    ) {
      throw new IamOperationError(
        "One or more permissions cannot be used in a project role",
      );
    }
    await requireDelegablePermissions({
      actorUserId: input.actorUserId,
      resourceType: input.scopeType,
      resourceId:
        input.scopeType === "organization"
          ? organization.id
          : input.workspaceId,
      permissions,
    });

    const name = customRoleName(input.displayName);
    const ownerResourceType = input.scopeType;
    const ownerResourceId =
      input.scopeType === "organization" ? organization.id : input.workspaceId;
    const [existingRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(
        and(
          eq(roles.ownerResourceType, ownerResourceType),
          eq(roles.ownerResourceId, ownerResourceId),
          eq(roles.name, name),
        ),
      )
      .limit(1);
    if (existingRole) {
      throw new IamOperationError(
        "A custom role with this name already exists",
        409,
      );
    }

    const [role] = await db
      .insert(roles)
      .values({
        scopeType: input.scopeType,
        ownerResourceType,
        ownerResourceId,
        name,
        displayName: input.displayName.trim(),
        description: input.description?.trim() || null,
        permissionsJson: permissions,
        isSystem: false,
        createdById: input.actorUserId,
      })
      .returning();

    await audit.emit({
      organizationId: organization.id,
      workspaceId: input.workspaceId,
      actorPrincipalType: "user",
      actorPrincipalId: input.actorUserId,
      action: "iam.role.created",
      resourceType: input.scopeType,
      resourceId: ownerResourceId,
      outcome: "success",
      metadata: {
        roleId: role.id,
        scopeType: input.scopeType,
        permissionCount: permissions.length,
      },
    });
    return role;
  },
);
