import { resolveStandardRole } from "./standard-role";
import { SYSTEM_ROLES } from "@/server/domain/entities/iam";
import type { ResourceType } from "@/server/domain/services/authorization";
import { and, eq, isNull } from "drizzle-orm";

import { createWorkspace } from "@/modules/workspace/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { canDelegatePermissionSet } from "./permission-matching";
import { db } from "@/server/infrastructure/db";
import {
  organizations,
  roles,
  workspaces,
} from "@/server/infrastructure/db/schema";

export class IamOperationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "IamOperationError";
  }
}

export type ScopeType = "organization" | "workspace";
export type AssignmentPrincipalType = "user" | "group";

export function normalizedSlug(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128);
}

export function customRoleName(displayName: string) {
  const slug = normalizedSlug(displayName);
  return `custom.${slug || crypto.randomUUID().slice(0, 8)}`;
}

export function rolePermissions(role: {
  permissionsJson: unknown;
  name?: string;
  isSystem?: boolean;
}) {
  if (role.isSystem) {
    const definition = SYSTEM_ROLES.find((item) => item.name === role.name);
    if (definition) return [...definition.permissions];
  }
  return Array.isArray(role.permissionsJson)
    ? (role.permissionsJson as string[])
    : [];
}

export async function requireDelegablePermissions(input: {
  actorUserId: string;
  resourceType: ResourceType;
  resourceId: string;
  permissions: string[];
}) {
  const actorPermissions = await authorization.listPermissions(
    { principalType: "user", principalId: input.actorUserId },
    input.resourceType,
    input.resourceId,
  );
  if (!canDelegatePermissionSet(actorPermissions, input.permissions)) {
    throw new IamOperationError(
      "You cannot grant permissions that you do not hold at this scope",
      403,
    );
  }
}

export async function getWorkspaceScope(workspaceId: string) {
  const [row] = await db
    .select({ workspace: workspaces, organization: organizations })
    .from(workspaces)
    .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
    .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.archivedAt)))
    .limit(1);

  if (!row) throw new IamOperationError("Project not found", 404);
  return row;
}

export async function requirePermission(input: {
  userId: string;
  permission: string;
  resourceType: ResourceType;
  resourceId: string;
  errorMessage: string;
}) {
  const result = await authorization.checkPermission(
    { principalType: "user", principalId: input.userId },
    input.permission,
    input.resourceType,
    input.resourceId,
  );
  if (!result.granted) {
    throw new IamOperationError(input.errorMessage, 403);
  }
}

export async function invalidateUserOrganizationAccess(
  userId: string,
  organizationId: string,
) {
  void organizationId;
  await authorization.invalidatePrincipalPermissionCache(userId);
}

export async function findSystemRole(name: string, scopeId?: string) {
  const [role] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.name, name), eq(roles.isSystem, true)))
    .limit(1);
  if (!role) throw new IamOperationError(`System role unavailable: ${name}`);
  return scopeId
    ? resolveStandardRole(
        role,
        role.scopeType === "organization" ? "organization" : "workspace",
        scopeId,
      )
    : role;
}

export async function createOrganizationWithProject(input: {
  userId: string;
  organizationName: string;
  organizationSlug?: string;
  projectName: string;
  projectSlug?: string;
}) {
  const organizationSlug =
    normalizedSlug(input.organizationSlug ?? input.organizationName) ||
    crypto.randomUUID().slice(0, 8);
  const projectSlug =
    normalizedSlug(input.projectSlug ?? input.projectName) || "main";

  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, organizationSlug))
    .limit(1);
  if (existing.length > 0) {
    throw new IamOperationError("This organization URL is already in use", 409);
  }

  return createWorkspace({
    userId: input.userId,
    organizationName: input.organizationName.trim(),
    organizationSlug,
    workspaceName: input.projectName.trim(),
    workspaceSlug: projectSlug,
  });
}

export async function createProject(input: {
  userId: string;
  workspaceId: string;
  name: string;
  slug?: string;
}) {
  const { organization } = await getWorkspaceScope(input.workspaceId);
  const permission = await authorization.checkPermission(
    { principalType: "user", principalId: input.userId },
    "workspaces.create",
    "organization",
    organization.id,
  );
  if (!permission.granted) {
    throw new IamOperationError(
      "You do not have permission to create projects in this organization",
      403,
    );
  }

  const slug =
    normalizedSlug(input.slug ?? input.name) || crypto.randomUUID().slice(0, 8);
  const [existingProject] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.organizationId, organization.id),
        eq(workspaces.slug, slug),
      ),
    )
    .limit(1);
  if (existingProject) {
    throw new IamOperationError(
      "A project with this URL already exists in the organization",
      409,
    );
  }

  return createWorkspace({
    userId: input.userId,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    workspaceName: input.name.trim(),
    workspaceSlug: slug,
  });
}
