import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  addOrganizationMember,
  createOrganizationWithProject,
  createProject,
} from "@/modules/iam/use-cases";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  agentVersions,
  auditEvents,
  marketplaceItems,
  conversations,
  organizations,
  roleBindings,
  roles,
  users,
  workspaces,
} from "@/server/infrastructure/db/schema";

export async function createSharingFixture() {
  const suffix = randomUUID();
  const owner = randomUUID(),
    member = randomUUID(),
    outsider = randomUUID();
  await db
    .insert(users)
    .values(
      [owner, member, outsider].map((id) => ({
        id,
        name: id,
        email: `${id}@example.test`,
        emailVerified: true,
      })),
    );
  const project = await createOrganizationWithProject({
    userId: owner,
    organizationName: `Sharing ${suffix}`,
    organizationSlug: `sharing-${suffix}`,
    projectName: "Source",
    projectSlug: "source",
  });
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, project.id));
  const destination = await createProject({
    userId: owner,
    workspaceId: project.id,
    name: "Destination",
    slug: "destination",
  });
  const [memberRole] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.name, "workspace.member"), eq(roles.isSystem, true)))
    .limit(1);
  await addOrganizationMember({
    actorUserId: owner,
    workspaceId: project.id,
    email: `${member}@example.test`,
    projectRoleId: memberRole.id,
  });
  const makeAgent = async (
    name: string,
    options: { creator?: string; kind?: "assistant" | "orchestrator" } = {},
  ) => {
    const [agent] = await db
      .insert(agents)
      .values({
        workspaceId: project.id,
        createdById: options.creator ?? owner,
        name,
        slug: randomUUID(),
        kind: options.kind ?? "assistant",
      })
      .returning();
    const [version] = await db
      .insert(agentVersions)
      .values({
        agentId: agent.id,
        versionNumber: 1,
        createdById: options.creator ?? owner,
        systemPrompt: `Prompt for ${name}`,
      })
      .returning();
    await db
      .update(agents)
      .set({ activeVersionId: version.id })
      .where(eq(agents.id, agent.id));
    return { agent: { ...agent, activeVersionId: version.id }, version };
  };
  return {
    owner,
    member,
    outsider,
    workspaceId: project.id,
    destinationId: destination.id,
    organizationId: workspace.organizationId,
    makeAgent,
    async cleanup() {
      const ids = [owner, member, outsider];
      await db
        .delete(marketplaceItems)
        .where(inArray(marketplaceItems.publisherUserId, ids));
      await db
        .delete(auditEvents)
        .where(eq(auditEvents.organizationId, workspace.organizationId));
      await db
        .delete(auditEvents)
        .where(inArray(auditEvents.workspaceId, [project.id, destination.id]));
      await db
        .delete(roleBindings)
        .where(inArray(roleBindings.createdById, ids));
      await db
        .delete(roles)
        .where(and(inArray(roles.createdById, ids), eq(roles.isSystem, false)));
      await db
        .update(roles)
        .set({ createdById: null })
        .where(inArray(roles.createdById, ids));
      await db
        .delete(conversations)
        .where(
          inArray(conversations.workspaceId, [project.id, destination.id]),
        );
      await db
        .delete(agentVersions)
        .where(inArray(agentVersions.createdById, ids));
      await db
        .delete(workspaces)
        .where(inArray(workspaces.id, [project.id, destination.id]));
      await db
        .delete(organizations)
        .where(eq(organizations.id, workspace.organizationId));
      await db.delete(users).where(inArray(users.id, ids));
    },
  };
}
