import { and, eq } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  organizationMembers,
  workspaces,
  teams,
  teamMembers,
  roles,
  roleBindings,
  agents,
} from "@/server/infrastructure/db/schema";
import {
  createOrganizationOnly,
  createOrganizationProject,
} from "@/modules/organization/organization-management";
import { authorization } from "@/server/domain/services/authorization";
import type { createSharingFixture } from "./resource-sharing-db.fixture";
export async function prepareProjectTransfer(
  f: Awaited<ReturnType<typeof createSharingFixture>>,
) {
  const target = (
    await createOrganizationOnly(f.owner, "Project transfer target")
  ).id;
  await createOrganizationProject({
    userId: f.owner,
    organizationId: target,
    name: "Existing source",
    platformAdmin: false,
  });
  // Deliberate collisions exercise the preview's stable, unique renaming.
  await db
    .update(workspaces)
    .set({ slug: "source" })
    .where(eq(workspaces.organizationId, target));
  const [team] = await db
    .insert(teams)
    .values({
      organizationId: f.organizationId,
      name: "Reviewers",
      slug: "reviewers",
      createdById: f.owner,
    })
    .returning();
  const teamId = team.id;
  await db.insert(teams).values({
    organizationId: target,
    name: "Existing reviewers",
    slug: "reviewers",
    createdById: f.owner,
  });
  await db.insert(teamMembers).values({ teamId, userId: f.member });
  const [role] = await db
    .insert(roles)
    .values({
      scopeType: "organization",
      ownerResourceType: "organization",
      ownerResourceId: f.organizationId,
      name: "project-reviewer",
      displayName: "Project reviewer",
      permissionsJson: ["workspaces.get", "agents.list", "agents.get"],
      createdById: f.owner,
    })
    .returning();
  const roleId = role.id;
  await db.insert(roleBindings).values({
    principalType: "group",
    principalId: teamId,
    roleId,
    resourceType: "workspace",
    resourceId: f.workspaceId,
    createdById: f.owner,
  });
  // Existing project-local role with the same name must remain intact.
  await db.insert(roles).values({
    scopeType: "workspace",
    ownerResourceType: "workspace",
    ownerResourceId: f.workspaceId,
    name: "project-reviewer",
    displayName: "Existing reviewer",
    permissionsJson: ["workspaces.get"],
    createdById: f.owner,
  });
  const agentId = (await f.makeAgent("Moved assistant")).agent.id;
  await db
    .update(agents)
    .set({ visibility: "organization" })
    .where(eq(agents.id, agentId));
  const [reader] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.isSystem, true), eq(roles.name, "workspace.viewer")));
  await db.insert(roleBindings).values({
    principalType: "group",
    principalId: f.organizationId,
    roleId: reader.id,
    resourceType: "agent",
    resourceId: agentId,
    createdById: f.owner,
    grantSource: "agent_scope",
    conditionJson: { source: "agent_scope", rootAgentId: agentId },
  });
  await db.insert(organizationMembers).values({
    organizationId: f.organizationId,
    userId: f.outsider,
    status: "active",
  });
  const [admin] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.isSystem, true), eq(roles.name, "organization.admin")));
  await db.insert(roleBindings).values({
    principalType: "user",
    principalId: f.outsider,
    roleId: admin.id,
    resourceType: "organization",
    resourceId: f.organizationId,
    createdById: f.owner,
  });
  await authorization.invalidateAllPermissionCaches();
  return { target, agentId, teamId, roleId };
}
