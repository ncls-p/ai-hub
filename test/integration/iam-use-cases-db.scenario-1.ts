import { and, eq } from "drizzle-orm";
import { expect } from "vitest";

import { listAgents } from "@/modules/agent/use-cases";
import { deleteProjectAccessResource } from "@/modules/iam/resource-deletion";
import {
  addOrganizationMember,
  addTeamMember,
  assignResourceRole,
  assignRole,
  createCustomRole,
  createOrganizationWithProject,
  createProject,
  createTeam,
  deleteCustomRole,
  deleteTeam,
  getAccessConsoleSnapshot,
  removeOrganizationMember,
  removeRoleAssignment,
  removeTeamMember,
  updateCustomRole,
} from "@/modules/iam/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  aiModels,
  aiProviders,
  roleBindings,
  workspaces,
} from "@/server/infrastructure/db/schema";
import type { IamDatabaseScenarioContext } from "./iam-use-cases-db.context";

export async function runIamDatabaseScenario1(
  context: IamDatabaseScenarioContext,
) {
  const { suffix, ownerId, memberId, organizationIds, memberEmail } = context;
  let { organizationId, firstProjectId, secondProjectId, sharedAgentId } =
    context;
  const firstProject = await createOrganizationWithProject({
    userId: ownerId,
    organizationName: `IAM Organization ${suffix}`,
    organizationSlug: `iam-org-${suffix}`,
    projectName: "Operations",
    projectSlug: "operations",
  });
  firstProjectId = firstProject.id;

  const [scope] = await db
    .select({ organizationId: workspaces.organizationId })
    .from(workspaces)
    .where(eq(workspaces.id, firstProjectId))
    .limit(1);
  organizationId = scope.organizationId;
  organizationIds.push(organizationId);

  const secondProject = await createProject({
    userId: ownerId,
    workspaceId: firstProjectId,
    name: "Customer Hub",
    slug: "customer-hub",
  });
  secondProjectId = secondProject.id;

  await addOrganizationMember({
    actorUserId: ownerId,
    workspaceId: firstProjectId,
    email: memberEmail,
  });

  const team = await createTeam({
    actorUserId: ownerId,
    workspaceId: firstProjectId,
    name: "Support Leads",
    description: "Shared support access",
  });
  await addTeamMember({
    actorUserId: ownerId,
    workspaceId: firstProjectId,
    teamId: team.id,
    userId: memberId,
  });

  const projectRole = await createCustomRole({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    displayName: "Support Reader",
    description: "Read assistants and workflows",
    scopeType: "workspace",
    permissions: ["agents.get", "workflows.view"],
  });
  const resourceRole = await createCustomRole({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    displayName: "Assistant Reader",
    description: "Read one selected assistant",
    scopeType: "workspace",
    permissions: ["agents.get"],
  });
  const [sharedAgent, privateAgent] = await db
    .insert(agents)
    .values([
      {
        workspaceId: secondProjectId,
        name: "Shared assistant",
        slug: `shared-${suffix}`,
        createdById: ownerId,
      },
      {
        workspaceId: secondProjectId,
        name: "Private assistant",
        slug: `private-${suffix}`,
        createdById: ownerId,
      },
    ])
    .returning();
  const [memberOwnedAgent] = await db
    .insert(agents)
    .values({
      workspaceId: secondProjectId,
      name: "Member private assistant",
      slug: `member-private-${suffix}`,
      createdById: memberId,
    })
    .returning();
  sharedAgentId = sharedAgent.id;
  expect(
    (await listAgents(secondProjectId, ownerId, true)).map(({ id }) => id),
  ).not.toContain(memberOwnedAgent.id);
  await assignResourceRole({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    principalType: "user",
    principalId: ownerId,
    roleId: resourceRole.id,
    resourceType: "agent",
    resourceId: memberOwnedAgent.id,
  });
  expect(
    (await listAgents(secondProjectId, ownerId, true)).map(({ id }) => id),
  ).toContain(memberOwnedAgent.id);
  await deleteProjectAccessResource({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    resourceType: "agent",
    resourceId: memberOwnedAgent.id,
  });
  expect(
    (await listAgents(secondProjectId, ownerId, true)).map(({ id }) => id),
  ).not.toContain(memberOwnedAgent.id);
  await assignResourceRole({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    principalType: "user",
    principalId: memberId,
    roleId: resourceRole.id,
    resourceType: "agent",
    resourceId: sharedAgent.id,
  });
  expect(
    await authorization.hasPermission(
      { principalType: "user", principalId: memberId },
      "agents.get",
      "agent",
      sharedAgent.id,
    ),
  ).toBe(true);
  expect(
    await authorization.hasPermission(
      { principalType: "user", principalId: memberId },
      "agents.get",
      "agent",
      privateAgent.id,
    ),
  ).toBe(false);
  const [provider] = await db
    .insert(aiProviders)
    .values({
      workspaceId: secondProjectId,
      kind: "openai-compatible",
      name: "Scoped provider",
      authType: "bearer",
      createdById: ownerId,
    })
    .returning();
  const [model] = await db
    .insert(aiModels)
    .values({
      providerId: provider.id,
      modelId: "scoped-model",
      displayName: "Scoped model",
    })
    .returning();
  const modelRole = await createCustomRole({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    displayName: "Model User",
    scopeType: "workspace",
    permissions: ["models.view", "models.invoke"],
  });
  await assignResourceRole({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    principalType: "user",
    principalId: memberId,
    roleId: modelRole.id,
    resourceType: "provider",
    resourceId: provider.id,
  });
  expect(
    await authorization.hasPermission(
      { principalType: "user", principalId: memberId },
      "models.invoke",
      "model",
      model.id,
    ),
  ).toBe(true);

  await assignRole({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    principalType: "group",
    principalId: team.id,
    roleId: projectRole.id,
    scopeType: "workspace",
  });
  const updatedProjectRole = await updateCustomRole({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    roleId: projectRole.id,
    displayName: "Support Operator",
    description: "Read assistants and run workflows",
    permissions: ["agents.get", "workflows.view", "workflows.execute"],
  });
  expect(updatedProjectRole).toMatchObject({
    displayName: "Support Operator",
    permissionsJson: ["agents.get", "workflows.view", "workflows.execute"],
  });

  const snapshot = await getAccessConsoleSnapshot({
    userId: ownerId,
    workspaceId: secondProjectId,
  });

  expect(snapshot.organization.id).toBe(organizationId);
  expect(snapshot.projects.map(({ id }) => id)).toEqual(
    expect.arrayContaining([firstProjectId, secondProjectId]),
  );
  expect(snapshot.capabilities).toEqual({
    canManageProjectAccess: true,
    canManageOrganizationAccess: true,
    canCreateProjects: true,
    canManageProjectLifecycle: true,
    canManageOrganizationLifecycle: true,
    canManageMembers: true,
    canManageTeams: true,
  });
  expect(snapshot.assignments).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        principalId: ownerId,
        roleKey: "organization.owner",
        inherited: true,
      }),
      expect.objectContaining({
        principalId: team.id,
        roleId: projectRole.id,
        scope: "project",
      }),
    ]),
  );
  expect(snapshot.roles.find(({ id }) => id === projectRole.id)).toMatchObject({
    displayName: "Support Operator",
    permissions: ["agents.get", "workflows.view", "workflows.execute"],
  });

  const [teamBinding] = await db
    .select({ id: roleBindings.id })
    .from(roleBindings)
    .where(
      and(
        eq(roleBindings.principalType, "group"),
        eq(roleBindings.principalId, team.id),
        eq(roleBindings.roleId, projectRole.id),
      ),
    )
    .limit(1);

  await removeRoleAssignment({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    bindingId: teamBinding.id,
  });
  await deleteCustomRole({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    roleId: projectRole.id,
  });
  const [resourceBinding] = await db
    .select({ id: roleBindings.id })
    .from(roleBindings)
    .where(
      and(
        eq(roleBindings.principalType, "user"),
        eq(roleBindings.principalId, memberId),
        eq(roleBindings.roleId, resourceRole.id),
        eq(roleBindings.resourceType, "agent"),
        eq(roleBindings.resourceId, sharedAgent.id),
      ),
    )
    .limit(1);
  await removeRoleAssignment({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    bindingId: resourceBinding.id,
  });
  await deleteCustomRole({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    roleId: resourceRole.id,
  });
  const [modelBinding] = await db
    .select({ id: roleBindings.id })
    .from(roleBindings)
    .where(
      and(
        eq(roleBindings.principalType, "user"),
        eq(roleBindings.principalId, memberId),
        eq(roleBindings.roleId, modelRole.id),
        eq(roleBindings.resourceType, "provider"),
        eq(roleBindings.resourceId, provider.id),
      ),
    )
    .limit(1);
  await removeRoleAssignment({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    bindingId: modelBinding.id,
  });
  await deleteCustomRole({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    roleId: modelRole.id,
  });
  await removeTeamMember({
    actorUserId: ownerId,
    workspaceId: firstProjectId,
    teamId: team.id,
    userId: memberId,
  });
  await deleteTeam({
    actorUserId: ownerId,
    workspaceId: firstProjectId,
    teamId: team.id,
  });
  await removeOrganizationMember({
    actorUserId: ownerId,
    workspaceId: firstProjectId,
    userId: memberId,
  });

  await expect(
    getAccessConsoleSnapshot({
      userId: memberId,
      workspaceId: firstProjectId,
    }),
  ).rejects.toMatchObject({ status: 403 });

  Object.assign(context, {
    organizationId,
    firstProjectId,
    secondProjectId,
    sharedAgentId,
  });
}
