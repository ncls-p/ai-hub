import { resolveStandardRole } from "./standard-role";
import { requireDelegableMembership } from "./membership-grants";
import { requireManageableOrganizationMember } from "./organization-member-delegation";
import {
  requireDelegablePermissions,
  rolePermissions,
} from "./use-cases.iam-operation-error";
import { requireSubordinatePrincipal } from "./delegation";
import { and, count, eq, inArray } from "drizzle-orm";

import { db } from "@/server/infrastructure/db";
import {
  organizationMembers,
  roleBindings,
  roles,
  teamMembers,
  teams,
  users,
} from "@/server/infrastructure/db/schema";
import {
  fingerprint,
  listSourceBindings,
} from "./member-transfer.list-member-transfer-destinations";
import {
  MemberTransferMode,
  MemberTransferPreview,
  getProjectScope,
  requireTransferPermissions,
} from "./member-transfer.member-transfer-modes";
import { IamOperationError } from "./use-cases";

export async function previewMemberTransfer(input: {
  actorUserId: string;
  sourceWorkspaceId: string;
  targetWorkspaceId: string;
  userIds: string[];
  roleId: string;
  mode: MemberTransferMode;
}): Promise<MemberTransferPreview> {
  if (input.sourceWorkspaceId === input.targetWorkspaceId) {
    throw new IamOperationError("Choose a different destination project");
  }
  const userIds = [...new Set(input.userIds)];
  const [source, target] = await Promise.all([
    getProjectScope(input.sourceWorkspaceId),
    getProjectScope(input.targetWorkspaceId),
  ]);
  await requireTransferPermissions({
    actorUserId: input.actorUserId,
    sourceWorkspaceId: input.sourceWorkspaceId,
    sourceOrganizationId: source.organization.id,
    targetWorkspaceId: input.targetWorkspaceId,
    targetOrganizationId: target.organization.id,
    mode: input.mode,
  });
  const crossOrganization = source.organization.id !== target.organization.id;
  if (crossOrganization)
    await requireDelegableMembership({
      actorUserId: input.actorUserId,
      organizationId: target.organization.id,
    });

  const [destinationRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.id, input.roleId))
    .limit(1);
  if (
    destinationRole &&
    (
      await resolveStandardRole(
        destinationRole,
        "workspace",
        input.targetWorkspaceId,
      )
    ).id !== destinationRole.id
  )
    throw new IamOperationError(
      "This role was customized. Reload access and select the current role.",
      409,
    );
  const roleIsCompatible =
    destinationRole?.scopeType === "workspace" &&
    (destinationRole.isSystem ||
      (destinationRole.ownerResourceType === "workspace" &&
        destinationRole.ownerResourceId === target.workspace.id) ||
      (destinationRole.ownerResourceType === "organization" &&
        destinationRole.ownerResourceId === target.organization.id));
  if (!roleIsCompatible) {
    throw new IamOperationError(
      "The selected role cannot be used in the destination project",
    );
  }

  await requireDelegablePermissions({
    actorUserId: input.actorUserId,
    resourceType: "workspace",
    resourceId: target.workspace.id,
    permissions: rolePermissions(destinationRole),
  });
  for (const userId of userIds) {
    await requireSubordinatePrincipal({
      actorUserId: input.actorUserId,
      principalType: "user",
      principalId: userId,
      resourceType: "workspace",
      resourceId: target.workspace.id,
    });
    if (input.mode === "move" && crossOrganization) {
      await requireManageableOrganizationMember({
        actorUserId: input.actorUserId,
        userId,
        workspaceId: source.workspace.id,
        organizationId: source.organization.id,
      });
    }
    if (input.mode === "move") {
      await requireSubordinatePrincipal({
        actorUserId: input.actorUserId,
        principalType: "user",
        principalId: userId,
        resourceType: crossOrganization ? "organization" : "workspace",
        resourceId: crossOrganization
          ? source.organization.id
          : source.workspace.id,
      });
    }
  }

  const members = await db
    .select({ userId: users.id, name: users.name, email: users.email })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(
      and(
        eq(organizationMembers.organizationId, source.organization.id),
        eq(organizationMembers.status, "active"),
        inArray(organizationMembers.userId, userIds),
      ),
    );
  const blockers: string[] = [];
  if (members.length !== userIds.length) {
    blockers.push(
      "At least one selected person is no longer an active member of the source organization.",
    );
  }
  if (
    crossOrganization &&
    input.mode === "move" &&
    userIds.includes(input.actorUserId)
  ) {
    blockers.push("You cannot move your own account out of this organization.");
  }

  const [sourceBindings, sourceTeams, destinationMemberships] =
    await Promise.all([
      listSourceBindings({
        userIds,
        sourceWorkspaceId: source.workspace.id,
        sourceOrganizationId: source.organization.id,
        includeWholeOrganization: crossOrganization && input.mode === "move",
      }),
      crossOrganization && input.mode === "move"
        ? db
            .select({ id: teamMembers.id })
            .from(teamMembers)
            .innerJoin(teams, eq(teams.id, teamMembers.teamId))
            .where(
              and(
                eq(teams.organizationId, source.organization.id),
                inArray(teamMembers.userId, userIds),
              ),
            )
        : Promise.resolve([]),
      crossOrganization
        ? db
            .select({
              id: organizationMembers.id,
              userId: organizationMembers.userId,
              status: organizationMembers.status,
            })
            .from(organizationMembers)
            .where(
              and(
                eq(organizationMembers.organizationId, target.organization.id),
                inArray(organizationMembers.userId, userIds),
              ),
            )
        : Promise.resolve([]),
    ]);

  if (crossOrganization && input.mode === "move") {
    const [ownerRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(
        and(eq(roles.name, "organization.owner"), eq(roles.isSystem, true)),
      )
      .limit(1);
    if (ownerRole) {
      const [{ value: ownerCount }] = await db
        .select({ value: count() })
        .from(roleBindings)
        .where(
          and(
            eq(roleBindings.roleId, ownerRole.id),
            eq(roleBindings.principalType, "user"),
            eq(roleBindings.resourceType, "organization"),
            eq(roleBindings.resourceId, source.organization.id),
          ),
        );
      const selectedOwners = sourceBindings.filter(
        (binding) => binding.roleId === ownerRole.id,
      ).length;
      if (ownerCount - selectedOwners < 1) {
        blockers.push(
          "Assign another organization owner before moving the last owner.",
        );
      }
    }
  }

  const activeDestinationMembers = new Set(
    destinationMemberships
      .filter(({ status }) => status === "active")
      .map(({ userId }) => userId),
  );
  const warnings: MemberTransferPreview["warnings"] = [];
  if (crossOrganization && input.mode === "move") {
    warnings.push("crossOrganizationMove");
  } else if (crossOrganization) {
    warnings.push("crossOrganizationAdd");
  } else if (input.mode === "move") {
    warnings.push("sameOrganizationMove");
  }

  return {
    source: {
      workspaceId: source.workspace.id,
      workspaceName: source.workspace.name,
      organizationId: source.organization.id,
      organizationName: source.organization.name,
    },
    destination: {
      workspaceId: target.workspace.id,
      workspaceName: target.workspace.name,
      organizationId: target.organization.id,
      organizationName: target.organization.name,
      crossOrganization,
    },
    mode: input.mode,
    members,
    changes: {
      destinationMembershipsAdded: crossOrganization
        ? userIds.filter((id) => !activeDestinationMembers.has(id)).length
        : 0,
      destinationAssignmentsAdded: userIds.length,
      sourceAssignmentsRemoved:
        input.mode === "move" ? sourceBindings.length : 0,
      sourceTeamMembershipsRemoved:
        input.mode === "move" ? sourceTeams.length : 0,
    },
    warnings,
    blockers,
    confirmationToken: fingerprint({
      ...input,
      userIds,
      stateIds: [
        ...sourceBindings.map(({ id }) => id),
        ...sourceTeams.map(({ id }) => id),
        ...destinationMemberships.map(({ id, status }) => `${id}:${status}`),
      ],
    }),
  };
}
