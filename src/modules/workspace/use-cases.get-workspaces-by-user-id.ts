import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  organizationMembers,
  organizations,
  roleBindings,
  roles,
  workspaceMembers,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { and, count, eq, isNull, or } from "drizzle-orm";
import { addWorkspaceMember } from "./use-cases.get-system-workspace-role";
import { updateWorkspaceMemberRole } from "./use-cases.update-workspace-member-role";
import {
  PRIMARY_ORGANIZATION_NAME,
  PRIMARY_ORGANIZATION_SLUG,
  PRIMARY_WORKSPACE_NAME,
  PRIMARY_WORKSPACE_SLUG,
  WORKSPACE_SCOPE,
  WorkspaceRoleName,
  createWorkspace,
} from "./use-cases.workspace-scope";

export async function getWorkspacesByUserId(userId: string) {
  const candidates = await db
    .select({
      workspace: workspaces,
      member: workspaceMembers,
      organizationMember: organizationMembers,
      organization: organizations,
    })
    .from(workspaces)
    .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
    .leftJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, workspaces.id),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .leftJoin(
      organizationMembers,
      and(
        eq(organizationMembers.organizationId, organizations.id),
        eq(organizationMembers.userId, userId),
      ),
    )
    .where(
      and(
        isNull(workspaces.archivedAt),
        or(
          eq(workspaceMembers.status, "active"),
          eq(organizationMembers.status, "active"),
        ),
      ),
    );

  const visibility = await Promise.all(
    candidates.map(({ workspace }) =>
      authorization.hasPermission(
        { principalType: "user", principalId: userId },
        "workspaces.get",
        "workspace",
        workspace.id,
      ),
    ),
  );

  return candidates.filter((_, index) => visibility[index]);
}

export async function countWorkspaces() {
  const [{ value }] = await db.select({ value: count() }).from(workspaces);
  return value;
}

async function getPrimaryWorkspace() {
  const [row] = await db
    .select({ workspace: workspaces })
    .from(workspaces)
    .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
    .where(
      and(
        eq(workspaces.slug, PRIMARY_WORKSPACE_SLUG),
        eq(organizations.slug, PRIMARY_ORGANIZATION_SLUG),
        isNull(workspaces.archivedAt),
      ),
    )
    .limit(1);

  return row?.workspace ?? null;
}

function workspaceRoleForPlatformRole(role?: string | null): WorkspaceRoleName {
  return role === "admin" ? "workspace.admin" : "workspace.member";
}

async function getActiveWorkspaceMember(workspaceId: string, userId: string) {
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

  return member ?? null;
}

async function getActiveOrganizationMember(
  organizationId: string,
  userId: string,
) {
  const [member] = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.status, "active"),
      ),
    )
    .limit(1);

  return member ?? null;
}

async function getWorkspaceRoleNames(workspaceId: string, userId: string) {
  const bindings = await db
    .select({ roleName: roles.name })
    .from(roleBindings)
    .innerJoin(roles, eq(roleBindings.roleId, roles.id))
    .where(
      and(
        eq(roleBindings.principalType, "user"),
        eq(roleBindings.principalId, userId),
        eq(roleBindings.resourceType, WORKSPACE_SCOPE),
        eq(roleBindings.resourceId, workspaceId),
      ),
    )
    .limit(2);
  return bindings.map(({ roleName }) => roleName);
}

export async function ensureWorkspaceForUser(input: {
  userId: string;
  role?: string | null;
  invitedBy?: string;
}) {
  const existingWorkspaces = await getWorkspacesByUserId(input.userId);
  if (existingWorkspaces.length > 0) {
    return existingWorkspaces[0].workspace;
  }
  return ensurePrimaryWorkspaceForUser(input);
}

export async function ensurePrimaryWorkspaceForUser(input: {
  userId: string;
  role?: string | null;
  invitedBy?: string;
}) {
  let workspace = await getPrimaryWorkspace();
  if (!workspace) {
    try {
      return await createWorkspace({
        userId: input.userId,
        organizationName: PRIMARY_ORGANIZATION_NAME,
        organizationSlug: PRIMARY_ORGANIZATION_SLUG,
        workspaceName: PRIMARY_WORKSPACE_NAME,
        workspaceSlug: PRIMARY_WORKSPACE_SLUG,
      });
    } catch (error) {
      workspace = await getPrimaryWorkspace();
      if (!workspace) throw error;
    }
  }

  const desiredRole = workspaceRoleForPlatformRole(input.role);
  const existingMember = await getActiveWorkspaceMember(
    workspace.id,
    input.userId,
  );

  if (!existingMember) {
    const organizationMember = await getActiveOrganizationMember(
      workspace.organizationId,
      input.userId,
    );
    if (organizationMember) return workspace;
    const [managedMembership] = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, input.userId))
      .limit(1);
    if (managedMembership) return workspace;

    await addWorkspaceMember({
      workspaceId: workspace.id,
      userId: input.userId,
      roleName: desiredRole,
      invitedBy: input.invitedBy ?? input.userId,
    });
    return workspace;
  }

  const currentRoles = await getWorkspaceRoleNames(workspace.id, input.userId);
  const platformManagedRole =
    currentRoles.length === 1 &&
    (currentRoles[0] === "workspace.admin" ||
      currentRoles[0] === "workspace.member");

  if (platformManagedRole && currentRoles[0] !== desiredRole) {
    await updateWorkspaceMemberRole({
      workspaceId: workspace.id,
      userId: input.userId,
      roleName: desiredRole,
      updatedBy: input.invitedBy ?? input.userId,
    });
  }

  return workspace;
}
