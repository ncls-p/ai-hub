import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  agentSkills,
  agentSkillBindings,
  roleBindings,
} from "@/server/infrastructure/db/schema";
import { replaceDirectResourceSharing } from "@/modules/iam/resource-direct-sharing";
import { executeWorkspaceClone } from "@/modules/iam/workspace-clone.execute-workspace-clone";
import { previewWorkspaceClone } from "@/modules/iam/workspace-clone.executor";
import { createSharingFixture } from "./resource-sharing-db.fixture";

const suite = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;
suite("shared dependency provenance after cloning a project", () => {
  let fixture: Awaited<ReturnType<typeof createSharingFixture>>;
  beforeAll(async () => {
    fixture = await createSharingFixture();
  }, 60000);
  afterAll(async () => {
    await fixture?.cleanup();
  });
  it("revokes the cloned agent's dependency grants independently of the source project", async () => {
    const { agent, version } = await fixture.makeAgent("Shared before cloning");
    const [skill] = await db
      .insert(agentSkills)
      .values({
        workspaceId: fixture.workspaceId,
        createdById: fixture.owner,
        name: "Shared skill",
        markdownFilesJson: [{ path: "SKILL.md", content: "Instructions" }],
      })
      .returning();
    await db
      .insert(agentSkillBindings)
      .values({ agentVersionId: version.id, skillId: skill.id });
    await replaceDirectResourceSharing({
      actorUserId: fixture.owner,
      workspaceId: fixture.workspaceId,
      resourceType: "agent",
      resourceId: agent.id,
      userIds: [fixture.member],
    });
    const input = {
      actorUserId: fixture.owner,
      sourceWorkspaceId: fixture.workspaceId,
      targetWorkspaceId: fixture.destinationId,
      secretPolicy: "disable" as const,
    };
    const preview = await previewWorkspaceClone(input);
    await executeWorkspaceClone({
      ...input,
      confirmationToken: preview.confirmationToken,
    });
    const [copy] = await db
      .select()
      .from(agents)
      .where(eq(agents.workspaceId, fixture.destinationId));
    const [copySkill] = await db
      .select()
      .from(agentSkills)
      .where(eq(agentSkills.workspaceId, fixture.destinationId));
    const grants = (resourceId: string) =>
      db
        .select()
        .from(roleBindings)
        .where(
          and(
            eq(roleBindings.resourceId, resourceId),
            eq(roleBindings.principalId, fixture.member),
          ),
        );
    expect(await grants(copy.id)).toMatchObject([
      {
        grantSource: "direct",
        conditionJson: { source: "agent_direct_share", rootAgentId: copy.id },
      },
    ]);
    expect(await grants(copySkill.id)).toMatchObject([
      {
        grantSource: `agent:${copy.id}`,
        conditionJson: { rootAgentId: copy.id },
      },
    ]);
    await replaceDirectResourceSharing({
      actorUserId: fixture.owner,
      workspaceId: fixture.destinationId,
      resourceType: "agent",
      resourceId: copy.id,
      userIds: [],
    });
    expect(await grants(copy.id)).toEqual([]);
    expect(await grants(copySkill.id)).toEqual([]);
    expect(await grants(skill.id)).toMatchObject([
      { grantSource: `agent:${agent.id}` },
    ]);
    expect(await grants(agent.id)).toHaveLength(1);
  });
});
