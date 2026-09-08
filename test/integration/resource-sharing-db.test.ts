import { exportResourcePackage } from "@/modules/resource-package/export";
import { importResourcePackage } from "@/modules/resource-package/import";
import { db } from "@/server/infrastructure/db";
import {
  agentDelegationBindings,
  agents,
  agentSkillBindings,
  agentSkills,
  agentToolBindings,
  agentVersions,
  customTools,
  mcpServers,
  mcpTools,
} from "@/server/infrastructure/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSharingFixture } from "./resource-sharing-db.fixture";

const suite = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;
suite("resource package round trips and sharing on PostgreSQL", () => {
  let fixture: Awaited<ReturnType<typeof createSharingFixture>>;
  beforeAll(async () => {
    fixture = await createSharingFixture();
  }, 60_000);
  afterAll(async () => {
    await fixture?.cleanup();
  });

  it("exports and imports an agent, its skill files, custom tool and MCP bindings without credentials", async () => {
    const { owner, workspaceId, destinationId } = fixture;
    const { agent, version } = await fixture.makeAgent("Portable assistant");
    const [skill] = await db
      .insert(agentSkills)
      .values({
        workspaceId,
        createdById: owner,
        name: "Review skill",
        markdownFilesJson: [
          { path: "SKILL.md", content: "# Révision\nCheck permissions." },
          { path: "references/checks.md", content: "Verify revocation." },
        ],
      })
      .returning();
    const [server] = await db
      .insert(mcpServers)
      .values({
        workspaceId,
        createdById: owner,
        name: "Portable MCP",
        transport: "streamable-http",
        url: "https://user:secret-url@example.test/mcp?token=secret-query&tenant=demo",
        encryptedHeadersJson: { Authorization: "secret-encrypted" },
        enabled: true,
        requireApproval: true,
      })
      .returning();
    const [tool] = await db
      .insert(mcpTools)
      .values({
        mcpServerId: server.id,
        name: "search",
        inputSchemaJson: { type: "object" },
        requireApproval: true,
      })
      .returning();
    const [custom] = await db
      .insert(customTools)
      .values({
        workspaceId,
        createdById: owner,
        name: "Custom lookup",
        status: "active",
        inputSchemaJson: { type: "object" },
      })
      .returning();
    await db
      .insert(agentSkillBindings)
      .values({ agentVersionId: version.id, skillId: skill.id });
    await db.insert(agentToolBindings).values([
      {
        agentVersionId: version.id,
        toolSource: "mcp",
        toolId: tool.id,
        requireApproval: true,
      },
      {
        agentVersionId: version.id,
        toolSource: "custom",
        toolId: custom.id,
        requireApproval: false,
      },
    ]);
    const resourcePackage = await exportResourcePackage({
      userId: owner,
      workspaceId,
      resourceType: "agent",
      resourceId: agent.id,
    });
    expect(JSON.stringify(resourcePackage)).not.toMatch(
      /secret-url|secret-query|secret-encrypted/,
    );
    const before = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(agents)
      .where(eq(agents.workspaceId, destinationId));
    const preview = await importResourcePackage({
      workspaceId: destinationId,
      userId: owner,
      package: resourcePackage,
      preview: true,
    });
    expect(preview.preview.resources).toHaveLength(4);
    expect(preview.preview.requiresCredentials).toBe(true);
    expect(
      await db
        .select({ count: sql<number>`count(*)::int` })
        .from(agents)
        .where(eq(agents.workspaceId, destinationId)),
    ).toEqual(before);
    const imported = await importResourcePackage({
      workspaceId: destinationId,
      userId: owner,
      package: resourcePackage,
    });
    expect(imported.resource?.id).not.toBe(agent.id);
    const [copy] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, imported.resource!.id));
    expect(copy).toMatchObject({
      workspaceId: destinationId,
      createdById: owner,
      visibility: "private",
      marketplaceItemId: null,
    });
    const [copyVersion] = await db
      .select()
      .from(agentVersions)
      .where(eq(agentVersions.id, copy.activeVersionId!));
    expect(copyVersion.systemPrompt).toBe(version.systemPrompt);
    const [binding] = await db
      .select()
      .from(agentSkillBindings)
      .where(eq(agentSkillBindings.agentVersionId, copyVersion.id));
    const [copySkill] = await db
      .select()
      .from(agentSkills)
      .where(eq(agentSkills.id, binding.skillId));
    expect(copySkill.markdownFilesJson).toEqual(skill.markdownFilesJson);
    expect(copySkill.workspaceId).toBe(destinationId);
    const bindings = await db
      .select()
      .from(agentToolBindings)
      .where(eq(agentToolBindings.agentVersionId, copyVersion.id));
    expect(bindings).toHaveLength(2);
    expect(bindings.map((item) => item.toolId)).not.toContain(tool.id);
    const [copyServer] = await db
      .select()
      .from(mcpServers)
      .where(eq(mcpServers.workspaceId, destinationId));
    expect(copyServer).toMatchObject({
      encryptedHeadersJson: null,
      encryptedEnvJson: null,
      enabled: false,
      healthStatus: "unknown",
      url: "https://example.test/mcp?tenant=demo",
    });
  });

  it("preserves pinned specialist versions and delegation instructions", async () => {
    const root = await fixture.makeAgent("Coordinator", {
      kind: "orchestrator",
    });
    const child = await fixture.makeAgent("Specialist");
    await db.insert(agentDelegationBindings).values({
      agentVersionId: root.version.id,
      childAgentId: child.agent.id,
      childAgentVersionId: child.version.id,
      instructions: "Review only the selected files",
    });
    const [latest] = await db
      .insert(agentVersions)
      .values({
        agentId: child.agent.id,
        versionNumber: 2,
        createdById: fixture.owner,
        systemPrompt: "New version that is not pinned",
      })
      .returning();
    await db
      .update(agents)
      .set({ activeVersionId: latest.id })
      .where(eq(agents.id, child.agent.id));
    const resourcePackage = await exportResourcePackage({
      workspaceId: fixture.workspaceId,
      userId: fixture.owner,
      resourceType: "agent",
      resourceId: root.agent.id,
    });
    const result = await importResourcePackage({
      workspaceId: fixture.destinationId,
      userId: fixture.owner,
      package: resourcePackage,
    });
    const [copy] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, result.resource!.id));
    const [binding] = await db
      .select()
      .from(agentDelegationBindings)
      .where(eq(agentDelegationBindings.agentVersionId, copy.activeVersionId!));
    const [version] = await db
      .select()
      .from(agentVersions)
      .where(eq(agentVersions.id, binding.childAgentVersionId));
    expect(version.systemPrompt).toBe(child.version.systemPrompt);
    expect(binding.instructions).toBe("Review only the selected files");
    expect(binding.childAgentId).not.toBe(child.agent.id);
  });

  it("rejects inaccessible dependencies and imports by outsiders before creating anything", async () => {
    const root = await fixture.makeAgent("Unauthorized dependency");
    const [privateSkill] = await db
      .insert(agentSkills)
      .values({
        workspaceId: fixture.workspaceId,
        createdById: fixture.member,
        name: "Private skill",
        markdownFilesJson: [{ path: "SKILL.md", content: "Private content" }],
      })
      .returning();
    await db
      .insert(agentSkillBindings)
      .values({ agentVersionId: root.version.id, skillId: privateSkill.id });
    await expect(
      exportResourcePackage({
        userId: fixture.owner,
        workspaceId: fixture.workspaceId,
        resourceType: "agent",
        resourceId: root.agent.id,
      }),
    ).rejects.toThrow(/not available/);
    const value = {
      format: "maiah.resource",
      schemaVersion: 1,
      manifest: { type: "agent", name: "Forbidden import", agent: {} },
    };
    await expect(
      importResourcePackage({
        userId: fixture.outsider,
        workspaceId: fixture.destinationId,
        package: value,
      }),
    ).rejects.toThrow(/permission/);
    expect(
      await db.select().from(agents).where(eq(agents.name, "Forbidden import")),
    ).toEqual([]);
  });
});
