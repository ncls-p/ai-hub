import { visibleScopedRoles } from "./standard-role";
import { roleCapabilities, subordinateMemberIds } from "./access-capabilities";
import { and, asc, eq, isNull, or } from "drizzle-orm";

import { ACCESS_RESOURCE_DEFINITIONS } from "@/server/domain/entities/access-resource";
import {
  authorization,
  canDelegatePermissionSet,
  matchesPermission,
} from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  organizationMembers,
  roleBindings,
  roles,
  teamMembers,
  teams,
  users,
  workspaces,
} from "@/server/infrastructure/db/schema";
import {
  expandPermissionGrants,
  isPermissionCompatibleWithScope,
  KNOWN_PERMISSIONS,
  PERMISSION_CATALOG,
} from "./permission-catalog";
import {
  getWorkspaceScope,
  IamOperationError,
  rolePermissions,
} from "./use-cases.iam-operation-error";

export async function getAccessConsoleSnapshot(input: {
  userId: string;
  workspaceId: string;
}) {
  const { workspace, organization } = await getWorkspaceScope(
    input.workspaceId,
  );
  const canView = await authorization.checkPermission(
    { principalType: "user", principalId: input.userId },
    "roles.get",
    "workspace",
    input.workspaceId,
  );
  if (!canView.granted) {
    throw new IamOperationError("You cannot view access for this project", 403);
  }

  const [
    projectRows,
    memberRows,
    teamRows,
    teamMemberRows,
    allRoleRows,
    bindingRows,
    effectivePermissions,
    organizationPermissions,
  ] = await Promise.all([
    db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
      })
      .from(workspaces)
      .where(
        and(
          eq(workspaces.organizationId, organization.id),
          isNull(workspaces.archivedAt),
        ),
      )
      .orderBy(asc(workspaces.name)),
    db
      .select({
        id: organizationMembers.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        status: organizationMembers.status,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .where(eq(organizationMembers.organizationId, organization.id))
      .orderBy(asc(users.name)),
    db
      .select()
      .from(teams)
      .where(eq(teams.organizationId, organization.id))
      .orderBy(asc(teams.name)),
    db
      .select({
        id: teamMembers.id,
        teamId: teamMembers.teamId,
        userId: teamMembers.userId,
        name: users.name,
        email: users.email,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teams.organizationId, organization.id)),
    db
      .select()
      .from(roles)
      .where(
        or(
          eq(roles.isSystem, true),
          and(
            eq(roles.ownerResourceType, "organization"),
            eq(roles.ownerResourceId, organization.id),
          ),
          and(
            eq(roles.ownerResourceType, "workspace"),
            eq(roles.ownerResourceId, input.workspaceId),
          ),
        ),
      )
      .orderBy(asc(roles.scopeType), asc(roles.displayName)),
    db
      .select({ binding: roleBindings, role: roles })
      .from(roleBindings)
      .innerJoin(roles, eq(roleBindings.roleId, roles.id))
      .where(
        or(
          and(
            eq(roleBindings.resourceType, "organization"),
            eq(roleBindings.resourceId, organization.id),
          ),
          and(
            eq(roleBindings.resourceType, "workspace"),
            eq(roleBindings.resourceId, input.workspaceId),
          ),
        ),
      ),
    authorization.listPermissions(
      { principalType: "user", principalId: input.userId },
      "workspace",
      input.workspaceId,
    ),
    authorization.listPermissions(
      { principalType: "user", principalId: input.userId },
      "organization",
      organization.id,
    ),
  ]);

  const roleRows = visibleScopedRoles(allRoleRows);
  const memberNames = new Map(
    memberRows.map((member) => [
      member.userId,
      { name: member.name, email: member.email },
    ]),
  );
  const teamNames = new Map(
    teamRows.map((team) => [team.id, { name: team.name }]),
  );
  const hasWorkspacePermission = (permission: string) =>
    effectivePermissions.some((granted) =>
      matchesPermission(granted, permission),
    );
  const hasOrganizationPermission = (permission: string) =>
    organizationPermissions.some((granted) =>
      matchesPermission(granted, permission),
    );
  const capabilities = {
    canManageProjectAccess: hasWorkspacePermission("roles.assign"),
    canManageOrganizationAccess: hasOrganizationPermission("roles.assign"),
    canCreateProjects: hasOrganizationPermission("workspaces.create"),
    canManageProjectLifecycle: hasWorkspacePermission("workspaces.update"),
    canManageOrganizationLifecycle: hasOrganizationPermission(
      "organization.update",
    ),
    canManageMembers: hasOrganizationPermission("members.create"),
    canManageTeams: hasOrganizationPermission("teams.update"),
  };
  const actions = {
    organization: Object.fromEntries(
      [...KNOWN_PERMISSIONS].map((permission) => [
        permission,
        hasOrganizationPermission(permission),
      ]),
    ),
    workspace: Object.fromEntries(
      [...KNOWN_PERMISSIONS].map((permission) => [
        permission,
        hasWorkspacePermission(permission),
      ]),
    ),
  };
  const [editableRoles, organizationMemberIds, workspaceMemberIds] =
    await Promise.all([
      roleCapabilities(
        input.userId,
        roleRows,
        organizationPermissions,
        effectivePermissions,
        organization.id,
      ),
      subordinateMemberIds(
        input.userId,
        memberRows,
        "organization",
        organization.id,
        organizationPermissions,
      ),
      subordinateMemberIds(
        input.userId,
        memberRows,
        "workspace",
        input.workspaceId,
        effectivePermissions,
      ),
    ]);
  const subordinateIds = {
    organization: organizationMemberIds,
    workspace: workspaceMemberIds,
  };

  const grantablePermissions = {
    organization: [...KNOWN_PERMISSIONS].filter(
      (permission) =>
        isPermissionCompatibleWithScope(permission, "organization") &&
        canDelegatePermissionSet(organizationPermissions, [permission]),
    ),
    workspace: [...KNOWN_PERMISSIONS].filter(
      (permission) =>
        isPermissionCompatibleWithScope(permission, "workspace") &&
        canDelegatePermissionSet(effectivePermissions, [permission]),
    ),
  };
  const assignableRoleIds = roleRows
    .filter((role) => {
      const actorPermissions =
        role.scopeType === "organization"
          ? organizationPermissions
          : effectivePermissions;
      return canDelegatePermissionSet(actorPermissions, rolePermissions(role));
    })
    .map((role) => role.id);

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
    },
    activeProject: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
    },
    projects: projectRows,
    members: memberRows,
    teams: teamRows.map((team) => ({
      ...team,
      members: teamMemberRows.filter((member) => member.teamId === team.id),
    })),
    roles: roleRows.map((role) => ({
      ...role,
      ...editableRoles.get(role.id),
      permissions: expandPermissionGrants(rolePermissions(role)),
    })),
    assignments: bindingRows.map(({ binding, role }) => {
      const memberPrincipal =
        binding.principalType === "user"
          ? memberNames.get(binding.principalId)
          : undefined;
      const teamPrincipal =
        binding.principalType === "group"
          ? teamNames.get(binding.principalId)
          : undefined;
      const principal = memberPrincipal ?? teamPrincipal;
      return {
        id: binding.id,
        principalType:
          binding.principalType === "group" ? "team" : binding.principalType,
        principalId: binding.principalId,
        principalName: principal?.name ?? "Unknown principal",
        principalDetail: memberPrincipal?.email,
        roleId: role.id,
        roleName: role.displayName,
        roleKey: role.name,
        scope:
          binding.resourceType === "organization" ? "organization" : "project",
        inherited: binding.resourceType === "organization",
      };
    }),
    permissionCatalog: PERMISSION_CATALOG,
    resourceDefinitions: ACCESS_RESOURCE_DEFINITIONS,
    effectivePermissions: expandPermissionGrants(effectivePermissions),
    organizationPermissions: expandPermissionGrants(organizationPermissions),
    actions,
    subordinateIds,
    grantablePermissions,
    assignableRoleIds,
    capabilities,
    canManageAccess:
      capabilities.canManageProjectAccess ||
      capabilities.canManageOrganizationAccess,
  };
}
