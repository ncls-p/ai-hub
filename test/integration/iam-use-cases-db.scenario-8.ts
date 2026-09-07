import { and, eq } from "drizzle-orm";
import { expect } from "vitest";

import {
  addOrganizationMember,
  assignRole,
  createCustomRole,
  createOrganizationWithProject,
  createProject,
  createTeam,
  removeOrganizationMember,
  removeRoleAssignment,
  updateCustomRole,
} from "@/modules/iam/use-cases";
import { db } from "@/server/infrastructure/db";
import {
  roleBindings,
  roles,
  workspaces,
} from "@/server/infrastructure/db/schema";
import type { IamDatabaseScenarioContext } from "./iam-use-cases-db.context";

export async function runIamDatabaseScenario8(
  context: IamDatabaseScenarioContext,
) {
  const {
    suffix,
    ownerId,
    memberId,
    outsiderId,
    organizationIds,
    memberEmail,
  } = context;
  const { organizationId, firstProjectId, secondProjectId } = context;
  await expect(
    createOrganizationWithProject({
      userId: outsiderId,
      organizationName: "Duplicate",
      organizationSlug: `iam-org-${suffix}`,
      projectName: "Duplicate",
    }),
  ).rejects.toMatchObject({ status: 409 });

  await addOrganizationMember({
    actorUserId: ownerId,
    workspaceId: firstProjectId,
    email: memberEmail,
  });

  await expect(
    createProject({
      userId: memberId,
      workspaceId: firstProjectId,
      name: "Escalated project",
    }),
  ).rejects.toMatchObject({ status: 403 });

  await expect(
    createCustomRole({
      actorUserId: ownerId,
      workspaceId: firstProjectId,
      displayName: "Invalid project role",
      scopeType: "workspace",
      permissions: ["members.manage"],
    }),
  ).rejects.toMatchObject({ status: 400 });

  const standardSystemRole = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.name, "workspace.viewer"), eq(roles.isSystem, true)))
    .limit(1);
  await expect(
    updateCustomRole({
      actorUserId: memberId,
      workspaceId: firstProjectId,
      roleId: standardSystemRole[0].id,
      displayName: "Unsafe override",
      permissions: ["workspaces.get"],
    }),
  ).rejects.toMatchObject({ status: 403 });

  await expect(
    addOrganizationMember({
      actorUserId: ownerId,
      workspaceId: firstProjectId,
      email: `missing-${suffix}@example.test`,
    }),
  ).rejects.toMatchObject({ status: 404 });

  const otherProject = await createOrganizationWithProject({
    userId: outsiderId,
    organizationName: `Other IAM Organization ${suffix}`,
    organizationSlug: `other-iam-org-${suffix}`,
    projectName: "External",
    projectSlug: "external",
  });
  const [otherScope] = await db
    .select({ organizationId: workspaces.organizationId })
    .from(workspaces)
    .where(eq(workspaces.id, otherProject.id))
    .limit(1);
  organizationIds.push(otherScope.organizationId);

  const externalTeam = await createTeam({
    actorUserId: outsiderId,
    workspaceId: otherProject.id,
    name: "External Team",
  });
  const viewerRole = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.name, "workspace.viewer"), eq(roles.isSystem, true)))
    .limit(1);

  await expect(
    assignRole({
      actorUserId: ownerId,
      workspaceId: firstProjectId,
      principalType: "group",
      principalId: externalTeam.id,
      roleId: viewerRole[0].id,
      scopeType: "workspace",
    }),
  ).rejects.toMatchObject({ status: 400 });

  const localRole = await createCustomRole({
    actorUserId: ownerId,
    workspaceId: firstProjectId,
    displayName: "First project only",
    scopeType: "workspace",
    permissions: ["workflows.view"],
  });

  await expect(
    assignRole({
      actorUserId: ownerId,
      workspaceId: secondProjectId,
      principalType: "user",
      principalId: memberId,
      roleId: localRole.id,
      scopeType: "workspace",
    }),
  ).rejects.toMatchObject({ status: 400 });

  const [ownerBinding] = await db
    .select({ id: roleBindings.id })
    .from(roleBindings)
    .innerJoin(roles, eq(roleBindings.roleId, roles.id))
    .where(
      and(
        eq(roles.name, "organization.owner"),
        eq(roleBindings.resourceType, "organization"),
        eq(roleBindings.resourceId, organizationId),
      ),
    )
    .limit(1);

  await expect(
    removeRoleAssignment({
      actorUserId: ownerId,
      workspaceId: firstProjectId,
      bindingId: ownerBinding.id,
    }),
  ).rejects.toMatchObject({ status: 409 });

  await expect(
    removeOrganizationMember({
      actorUserId: ownerId,
      workspaceId: firstProjectId,
      userId: ownerId,
    }),
  ).rejects.toMatchObject({ status: 409 });
}
