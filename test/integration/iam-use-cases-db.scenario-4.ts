import { and, eq } from "drizzle-orm";
import { expect } from "vitest";

import {
  executeMemberTransfer,
  listMemberTransferDestinations,
  previewMemberTransfer,
} from "@/modules/iam/member-transfer";
import {
  addOrganizationMember,
  addTeamMember,
  assignResourceRole,
  assignRole,
  createCustomRole,
  createOrganizationWithProject,
  createTeam,
} from "@/modules/iam/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  organizationMembers,
  roleBindings,
  roles,
  teamMembers,
  workspaces,
} from "@/server/infrastructure/db/schema";
import type { IamDatabaseScenarioContext } from "./iam-use-cases-db.context";

export async function runIamDatabaseScenario4(
  context: IamDatabaseScenarioContext,
) {
  const { suffix, ownerId, memberId, organizationIds, memberEmail } = context;
  const { organizationId, firstProjectId } = context;
  await addOrganizationMember({
    actorUserId: ownerId,
    workspaceId: firstProjectId,
    email: memberEmail,
  });
  const destination = await createOrganizationWithProject({
    userId: ownerId,
    organizationName: `Member transfer ${suffix}`,
    organizationSlug: `member-transfer-${suffix}`,
    projectName: "Destination",
    projectSlug: "destination",
  });
  const [destinationScope] = await db
    .select({ organizationId: workspaces.organizationId })
    .from(workspaces)
    .where(eq(workspaces.id, destination.id))
    .limit(1);
  organizationIds.push(destinationScope.organizationId);

  const [viewerRole, adminRole] = await Promise.all([
    db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.name, "workspace.viewer"), eq(roles.isSystem, true)))
      .limit(1),
    db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.name, "workspace.admin"), eq(roles.isSystem, true)))
      .limit(1),
  ]);
  await expect(
    previewMemberTransfer({
      actorUserId: ownerId,
      sourceWorkspaceId: firstProjectId,
      targetWorkspaceId: destination.id,
      userIds: [ownerId],
      roleId: viewerRole[0].id,
      mode: "move",
    }),
  ).resolves.toMatchObject({
    blockers: expect.arrayContaining([
      "You cannot move your own account out of this organization.",
    ]),
  });
  await assignRole({
    actorUserId: ownerId,
    workspaceId: firstProjectId,
    principalType: "user",
    principalId: memberId,
    roleId: viewerRole[0].id,
    scopeType: "workspace",
  });
  const sourceResourceRole = await createCustomRole({
    actorUserId: ownerId,
    workspaceId: firstProjectId,
    displayName: `Transfer resource reader ${suffix}`,
    scopeType: "workspace",
    permissions: ["agents.get"],
  });
  const [sourceAgent] = await db
    .insert(agents)
    .values({
      workspaceId: firstProjectId,
      name: `Transfer protected assistant ${suffix}`,
      slug: `transfer-protected-${suffix}`,
      createdById: ownerId,
    })
    .returning();
  await assignResourceRole({
    actorUserId: ownerId,
    workspaceId: firstProjectId,
    principalType: "user",
    principalId: memberId,
    roleId: sourceResourceRole.id,
    resourceType: "agent",
    resourceId: sourceAgent.id,
  });
  const sourceTeam = await createTeam({
    actorUserId: ownerId,
    workspaceId: firstProjectId,
    name: `Transfer team ${suffix}`,
  });
  await addTeamMember({
    actorUserId: ownerId,
    workspaceId: firstProjectId,
    teamId: sourceTeam.id,
    userId: memberId,
  });

  const destinations = await listMemberTransferDestinations({
    userId: ownerId,
    sourceWorkspaceId: firstProjectId,
  });
  expect(destinations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        workspaceId: destination.id,
        crossOrganization: true,
      }),
    ]),
  );

  const addPreview = await previewMemberTransfer({
    actorUserId: ownerId,
    sourceWorkspaceId: firstProjectId,
    targetWorkspaceId: destination.id,
    userIds: [memberId, memberId],
    roleId: viewerRole[0].id,
    mode: "add",
  });
  expect(addPreview).toMatchObject({
    blockers: [],
    changes: {
      destinationMembershipsAdded: 1,
      destinationAssignmentsAdded: 1,
      sourceAssignmentsRemoved: 0,
      sourceTeamMembershipsRemoved: 0,
    },
  });
  await executeMemberTransfer({
    actorUserId: ownerId,
    sourceWorkspaceId: firstProjectId,
    targetWorkspaceId: destination.id,
    userIds: [memberId],
    roleId: viewerRole[0].id,
    mode: "add",
    confirmationToken: addPreview.confirmationToken,
  });
  expect(
    await authorization.hasPermission(
      { principalType: "user", principalId: memberId },
      "workspaces.get",
      "workspace",
      firstProjectId,
    ),
  ).toBe(true);
  expect(
    await authorization.hasPermission(
      { principalType: "user", principalId: memberId },
      "workspaces.get",
      "workspace",
      destination.id,
    ),
  ).toBe(true);

  const stalePreview = await previewMemberTransfer({
    actorUserId: ownerId,
    sourceWorkspaceId: firstProjectId,
    targetWorkspaceId: destination.id,
    userIds: [memberId],
    roleId: viewerRole[0].id,
    mode: "move",
  });
  await assignRole({
    actorUserId: ownerId,
    workspaceId: firstProjectId,
    principalType: "user",
    principalId: memberId,
    roleId: adminRole[0].id,
    scopeType: "workspace",
  });
  await expect(
    executeMemberTransfer({
      actorUserId: ownerId,
      sourceWorkspaceId: firstProjectId,
      targetWorkspaceId: destination.id,
      userIds: [memberId],
      roleId: viewerRole[0].id,
      mode: "move",
      confirmationToken: stalePreview.confirmationToken,
    }),
  ).rejects.toMatchObject({ status: 409 });

  const movePreview = await previewMemberTransfer({
    actorUserId: ownerId,
    sourceWorkspaceId: firstProjectId,
    targetWorkspaceId: destination.id,
    userIds: [memberId],
    roleId: viewerRole[0].id,
    mode: "move",
  });
  expect(movePreview.changes).toMatchObject({
    sourceAssignmentsRemoved: 4,
    sourceTeamMembershipsRemoved: 1,
  });
  await executeMemberTransfer({
    actorUserId: ownerId,
    sourceWorkspaceId: firstProjectId,
    targetWorkspaceId: destination.id,
    userIds: [memberId],
    roleId: viewerRole[0].id,
    mode: "move",
    confirmationToken: movePreview.confirmationToken,
  });

  const [
    sourceMembership,
    destinationMembership,
    remainingTeamMembership,
    remainingResourceAccess,
  ] = await Promise.all([
    db
      .select({ status: organizationMembers.status })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, memberId),
        ),
      )
      .limit(1),
    db
      .select({ status: organizationMembers.status })
      .from(organizationMembers)
      .where(
        and(
          eq(
            organizationMembers.organizationId,
            destinationScope.organizationId,
          ),
          eq(organizationMembers.userId, memberId),
        ),
      )
      .limit(1),
    db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, sourceTeam.id),
          eq(teamMembers.userId, memberId),
        ),
      ),
    db
      .select({ id: roleBindings.id })
      .from(roleBindings)
      .where(
        and(
          eq(roleBindings.principalType, "user"),
          eq(roleBindings.principalId, memberId),
          eq(roleBindings.resourceType, "agent"),
          eq(roleBindings.resourceId, sourceAgent.id),
        ),
      ),
  ]);
  expect(sourceMembership[0]?.status).toBe("removed");
  expect(destinationMembership[0]?.status).toBe("active");
  expect(remainingTeamMembership).toEqual([]);
  expect(remainingResourceAccess).toEqual([]);
}
