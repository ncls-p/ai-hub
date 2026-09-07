import { eq } from "drizzle-orm";
import { expect } from "vitest";

import {
  deleteOrganization,
  deleteProject,
  renameOrganization,
  renameProject,
} from "@/modules/iam/scope-lifecycle";
import {
  assignResourceRole,
  assignRole,
  createCustomRole,
  createOrganizationWithProject,
  createProject,
  createTeam,
} from "@/modules/iam/use-cases";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  organizations,
  roleBindings,
  roles,
  teams,
  workspaces,
} from "@/server/infrastructure/db/schema";
import type { IamDatabaseScenarioContext } from "./iam-use-cases-db.context";

export async function runIamDatabaseScenario7(
  context: IamDatabaseScenarioContext,
) {
  const { suffix, ownerId, outsiderId, organizationIds } = context;
  const lifecycleProject = await createOrganizationWithProject({
    userId: ownerId,
    organizationName: `Lifecycle source ${suffix}`,
    organizationSlug: `lifecycle-source-${suffix}`,
    projectName: "Lifecycle main",
    projectSlug: "lifecycle-main",
  });
  const removableProject = await createProject({
    userId: ownerId,
    workspaceId: lifecycleProject.id,
    name: "Removable project",
    slug: "removable-project",
  });
  const fallbackProject = await createOrganizationWithProject({
    userId: ownerId,
    organizationName: `Lifecycle fallback ${suffix}`,
    organizationSlug: `lifecycle-fallback-${suffix}`,
    projectName: "Fallback project",
    projectSlug: "fallback-project",
  });
  const [lifecycleScope, fallbackScope] = await Promise.all([
    db
      .select({ organizationId: workspaces.organizationId })
      .from(workspaces)
      .where(eq(workspaces.id, lifecycleProject.id))
      .then((rows) => rows[0]),
    db
      .select({ organizationId: workspaces.organizationId })
      .from(workspaces)
      .where(eq(workspaces.id, fallbackProject.id))
      .then((rows) => rows[0]),
  ]);
  organizationIds.push(
    lifecycleScope.organizationId,
    fallbackScope.organizationId,
  );

  await renameOrganization({
    actorUserId: ownerId,
    workspaceId: lifecycleProject.id,
    name: "Renamed organization",
    slug: `renamed-organization-${suffix}`,
  });
  await renameProject({
    actorUserId: ownerId,
    workspaceId: removableProject.id,
    name: "Renamed removable project",
    slug: "renamed-removable-project",
  });
  const removableRole = await createCustomRole({
    actorUserId: ownerId,
    workspaceId: removableProject.id,
    displayName: "Removable project role",
    scopeType: "workspace",
    permissions: ["agents.get"],
  });
  const [removableAgent] = await db
    .insert(agents)
    .values({
      workspaceId: removableProject.id,
      name: "Removable project assistant",
      slug: `removable-project-assistant-${suffix}`,
      createdById: ownerId,
    })
    .returning();
  await expect(
    assignResourceRole({
      actorUserId: ownerId,
      workspaceId: removableProject.id,
      principalType: "user",
      principalId: ownerId,
      roleId: removableRole.id,
      resourceType: "agent",
      resourceId: removableAgent.id,
    }),
  ).resolves.toBeDefined();
  await expect(
    deleteProject({
      actorUserId: ownerId,
      workspaceId: removableProject.id,
      confirmationName: "wrong name",
    }),
  ).rejects.toMatchObject({ status: 400 });
  const projectDeletion = await deleteProject({
    actorUserId: ownerId,
    workspaceId: removableProject.id,
    confirmationName: "Renamed removable project",
  });
  expect(projectDeletion.nextWorkspaceId).toBe(lifecycleProject.id);
  expect(
    await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, removableProject.id)),
  ).toEqual([]);
  expect(
    await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.id, removableRole.id)),
  ).toEqual([]);
  expect(
    await db
      .select({ id: roleBindings.id })
      .from(roleBindings)
      .where(eq(roleBindings.resourceId, removableAgent.id)),
  ).toEqual([]);

  const organizationTeam = await createTeam({
    actorUserId: ownerId,
    workspaceId: lifecycleProject.id,
    name: "Removable organization team",
  });
  const organizationRole = await createCustomRole({
    actorUserId: ownerId,
    workspaceId: lifecycleProject.id,
    displayName: "Removable organization role",
    scopeType: "organization",
    permissions: ["organization.get"],
  });
  await expect(
    assignRole({
      actorUserId: ownerId,
      workspaceId: lifecycleProject.id,
      principalType: "user",
      principalId: ownerId,
      roleId: organizationRole.id,
      scopeType: "organization",
    }),
  ).resolves.toBeUndefined();

  const organizationDeletion = await deleteOrganization({
    actorUserId: ownerId,
    workspaceId: lifecycleProject.id,
    confirmationName: "Renamed organization",
  });
  expect(organizationDeletion.nextWorkspaceId).toBeTruthy();
  const [fallbackAfterDeletion] = await db
    .select({ organizationId: workspaces.organizationId })
    .from(workspaces)
    .where(eq(workspaces.id, organizationDeletion.nextWorkspaceId!));
  expect(fallbackAfterDeletion.organizationId).not.toBe(
    lifecycleScope.organizationId,
  );
  expect(
    await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, lifecycleScope.organizationId)),
  ).toEqual([]);
  expect(
    await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.id, organizationTeam.id)),
  ).toEqual([]);
  expect(
    await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.id, organizationRole.id)),
  ).toEqual([]);

  const onlyProject = await createOrganizationWithProject({
    userId: outsiderId,
    organizationName: `Only organization ${suffix}`,
    organizationSlug: `only-organization-${suffix}`,
    projectName: "Only project",
    projectSlug: "only-project",
  });
  const [onlyScope] = await db
    .select({ organizationId: workspaces.organizationId })
    .from(workspaces)
    .where(eq(workspaces.id, onlyProject.id));
  organizationIds.push(onlyScope.organizationId);
  await expect(
    deleteOrganization({
      actorUserId: outsiderId,
      workspaceId: onlyProject.id,
      confirmationName: `Only organization ${suffix}`,
    }),
  ).resolves.toEqual({ nextWorkspaceId: null });
}
