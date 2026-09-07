import type { AccessResourceType } from "@/server/domain/entities/access-resource";
import { SYSTEM_ROLES } from "@/server/domain/entities/iam";
import { db } from "@/server/infrastructure/db";
import {
  organizationMembers,
  workspaceMembers,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { and, eq } from "drizzle-orm";

export const PERMISSION_CACHE_TTL = 60; // 60 seconds
const globalAuthorization = globalThis as typeof globalThis & {
  __maiahPermissionResolutions?: Map<string, Promise<Permission[]>>;
};
export const permissionResolutions =
  (globalAuthorization.__maiahPermissionResolutions ??= new Map());

export type Permission = string;
export type PrincipalType = "user" | "group" | "service_account" | "api_key";
export type ResourceType = "organization" | "workspace" | AccessResourceType;

export interface AuthorizationContext {
  principalType: PrincipalType;
  principalId: string;
}

export interface PermissionCheckResult {
  granted: boolean;
  reason?: string;
}

const SYSTEM_ROLE_PERMISSIONS = new Map(
  SYSTEM_ROLES.map((role) => [role.name, role.permissions]),
);

export {
  matchesPermission,
  canDelegatePermissionSet,
} from "@/modules/iam/permission-matching";

export async function isActiveWorkspaceMember(
  userId: string,
  workspaceId: string,
  knownOrganizationId?: string,
) {
  let organizationId = knownOrganizationId;
  if (!organizationId) {
    const [workspace] = await db
      .select({ organizationId: workspaces.organizationId })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!workspace) return false;
    organizationId = workspace.organizationId;
  }

  const [organizationMember] = await db
    .select({
      id: organizationMembers.id,
      status: organizationMembers.status,
    })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId),
      ),
    )
    .limit(1);

  if (organizationMember) {
    return organizationMember.status === "active";
  }

  const [workspaceMember] = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.status, "active"),
      ),
    )
    .limit(1);

  return Boolean(workspaceMember);
}

export async function isActiveOrganizationMember(
  userId: string,
  organizationId: string,
) {
  const [member] = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.status, "active"),
      ),
    )
    .limit(1);

  return Boolean(member);
}

export function addRolePermissions(
  permissions: Permission[],
  role: { name: string; permissionsJson: unknown; isSystem?: boolean },
) {
  const currentSystemPermissions =
    role.isSystem === true ? SYSTEM_ROLE_PERMISSIONS.get(role.name) : undefined;
  const grants =
    currentSystemPermissions ??
    (Array.isArray(role.permissionsJson) ? role.permissionsJson : []);
  permissions.push(
    ...grants.filter((grant): grant is string => typeof grant === "string"),
  );
}

export function uniquePermissions(permissions: Permission[]) {
  return [...new Set(permissions)];
}
