"use client";

export type AccessMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  status: "active" | "suspended" | "removed";
};

export type PlatformAccessUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  banReason: string | null;
  createdAt: string;
};

export type AccessTeam = {
  id: string;
  updatedAt?: string;
  name: string;
  description: string | null;
  members: Array<{
    id: string;
    userId: string;
    name: string;
    email: string;
  }>;
};

type AccessRole = {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  scopeType: "system" | "organization" | "workspace";
  isSystem: boolean;
  updatedAt: string;
  canUpdate: boolean;
  canDelete: boolean;
  permissions: string[];
};

export type AccessAssignment = {
  id: string;
  principalType: "user" | "team" | "service_account" | "api_key";
  principalId: string;
  principalName: string;
  principalDetail?: string;
  roleId: string;
  roleName: string;
  roleKey: string;
  scope: "organization" | "project" | "resource";
  inherited: boolean;
};

type PermissionGroup = {
  id: string;
  label: string;
  description: string;
  permissions: Array<{
    id: string;
    label: string;
    description: string;
  }>;
};

export type AccessSnapshot = {
  organization: { id: string; name: string; slug: string };
  activeProject: { id: string; name: string; slug: string };
  projects: Array<{ id: string; name: string; slug: string }>;
  members: AccessMember[];
  teams: AccessTeam[];
  roles: AccessRole[];
  assignments: AccessAssignment[];
  permissionCatalog: PermissionGroup[];
  resourceDefinitions: AccessResourceDefinition[];
  effectivePermissions: string[];
  organizationPermissions: string[];
  actions: {
    organization: Record<string, boolean>;
    workspace: Record<string, boolean>;
  };
  subordinateIds: { organization: string[]; workspace: string[] };
  grantablePermissions: {
    organization: string[];
    workspace: string[];
  };
  assignableRoleIds: string[];
  capabilities: {
    canManageProjectAccess: boolean;
    canManageOrganizationAccess: boolean;
    canCreateProjects: boolean;
    canManageProjectLifecycle: boolean;
    canManageOrganizationLifecycle: boolean;
    canManageMembers: boolean;
    canManageTeams: boolean;
  };
  canManageAccess: boolean;
};

export type AccessResourceDefinition = {
  type: string;
  label: string;
  pluralLabel: string;
  permissionDomains: string[];
};

export type AccessResource = {
  id: string;
  type: string;
  name: string;
};

export type ResourceAccessSnapshot = {
  resource: AccessResource & {
    workspaceId: string;
    organizationId: string;
  };
  members: AccessMember[];
  teams: AccessTeam[];
  roles: AccessRole[];
  assignments: AccessAssignment[];
  capabilities: { canManageResourceAccess: boolean };
};

export type TransferDestination = {
  workspaceId: string;
  workspaceName: string;
  organizationId: string;
  organizationName: string;
};

export type MemberTransferDestination = TransferDestination & {
  crossOrganization: boolean;
  roles: Array<{ id: string; name: string; displayName: string }>;
};

export type MemberTransferPreview = {
  destination: MemberTransferDestination;
  mode: "add" | "move";
  members: Array<{ userId: string; name: string; email: string }>;
  changes: {
    destinationMembershipsAdded: number;
    destinationAssignmentsAdded: number;
    sourceAssignmentsRemoved: number;
    sourceTeamMembershipsRemoved: number;
  };
  warnings: Array<
    "crossOrganizationMove" | "crossOrganizationAdd" | "sameOrganizationMove"
  >;
  blockers: string[];
  confirmationToken: string;
};
