import { visibleScopedRoles } from "./standard-role";
import { and, eq, isNull, or } from "drizzle-orm";

import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  organizations,
  roles,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { IamOperationError } from "./use-cases";

export const MEMBER_TRANSFER_MODES = ["add", "move"] as const;
export type MemberTransferMode = (typeof MEMBER_TRANSFER_MODES)[number];

export type ProjectDestination = {
  workspaceId: string;
  workspaceName: string;
  organizationId: string;
  organizationName: string;
  crossOrganization: boolean;
  roles: Array<{ id: string; name: string; displayName: string }>;
};

export type MemberTransferPreview = {
  source: Omit<ProjectDestination, "roles" | "crossOrganization">;
  destination: Omit<ProjectDestination, "roles">;
  mode: MemberTransferMode;
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

export async function getProjectScope(workspaceId: string) {
  const [scope] = await db
    .select({ workspace: workspaces, organization: organizations })
    .from(workspaces)
    .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
    .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.archivedAt)))
    .limit(1);
  if (!scope) throw new IamOperationError("Project not found", 404);
  return scope;
}

export async function hasPermission(
  userId: string,
  permission: string,
  resourceType: "organization" | "workspace",
  resourceId: string,
) {
  return (
    await authorization.checkPermission(
      { principalType: "user", principalId: userId },
      permission,
      resourceType,
      resourceId,
    )
  ).granted;
}

export async function requireTransferPermissions(input: {
  actorUserId: string;
  sourceWorkspaceId: string;
  sourceOrganizationId: string;
  targetWorkspaceId: string;
  targetOrganizationId: string;
  mode: MemberTransferMode;
}) {
  const crossOrganization =
    input.sourceOrganizationId !== input.targetOrganizationId;
  const checks = await Promise.all([
    hasPermission(
      input.actorUserId,
      input.mode === "move" ? "roles.revoke" : "roles.get",
      "workspace",
      input.sourceWorkspaceId,
    ),
    hasPermission(
      input.actorUserId,
      "roles.assign",
      "workspace",
      input.targetWorkspaceId,
    ),
    crossOrganization
      ? hasPermission(
          input.actorUserId,
          "members.create",
          "organization",
          input.targetOrganizationId,
        )
      : Promise.resolve(true),
    crossOrganization && input.mode === "move"
      ? hasPermission(
          input.actorUserId,
          "members.delete",
          "organization",
          input.sourceOrganizationId,
        )
      : Promise.resolve(true),
  ]);
  if (checks.some((allowed) => !allowed)) {
    throw new IamOperationError(
      "You need access administration rights on both the source and destination",
      403,
    );
  }
}

export async function listDestinationRoles(
  workspaceId: string,
  organizationId: string,
) {
  const rows = await db
    .select({
      id: roles.id,
      name: roles.name,
      displayName: roles.displayName,
      isSystem: roles.isSystem,
    })
    .from(roles)
    .where(
      and(
        eq(roles.scopeType, "workspace"),
        or(
          eq(roles.isSystem, true),
          and(
            eq(roles.isSystem, false),
            eq(roles.ownerResourceType, "workspace"),
            eq(roles.ownerResourceId, workspaceId),
          ),
          and(
            eq(roles.isSystem, false),
            eq(roles.ownerResourceType, "organization"),
            eq(roles.ownerResourceId, organizationId),
          ),
        ),
      ),
    );
  return visibleScopedRoles(rows).map(({ id, name, displayName }) => ({
    id,
    name,
    displayName,
  }));
}
