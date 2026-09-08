import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  agentSkills,
  agentSkillBindings,
  workflows,
  workflowVersions,
} from "@/server/infrastructure/db/schema";
import { exportResourcePackage } from "@/modules/resource-package/export";
import { importResourcePackage } from "@/modules/resource-package/import";
import { createStarterDefinition } from "@/modules/workflows/contracts";
import { runWithRequestAuth } from "@/modules/auth/request-auth-context";
import { createSharingFixture } from "./resource-sharing-db.fixture";

const suite = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;
suite("portable workflows on PostgreSQL", () => {
  let fixture: Awaited<ReturnType<typeof createSharingFixture>>;
  beforeAll(async () => {
    fixture = await createSharingFixture();
  }, 60_000);
  afterAll(async () => {
    await fixture?.cleanup();
  });

  async function createSource() {
    const child = await fixture.makeAgent(`Workflow assistant ${randomUUID()}`);
    const [skill] = await db
      .insert(agentSkills)
      .values({
        workspaceId: fixture.workspaceId,
        createdById: fixture.owner,
        name: `Workflow skill ${randomUUID()}`,
        markdownFilesJson: [
          { path: "SKILL.md", content: "Inspect original documents." },
        ],
      })
      .returning();
    await db
      .insert(agentSkillBindings)
      .values({ agentVersionId: child.version.id, skillId: skill.id });
    const definition = createStarterDefinition();
    for (const id of ["review", "check"]) {
      definition.nodes.push({
        ...definition.nodes[0],
        id,
        type: "agent.run",
        label: id,
        parameters: { agentId: child.agent.id, prompt: "Review {{ input }}" },
      });
    }
    definition.edges = [
      { id: "start", source: "trigger", target: "review" },
      { id: "next", source: "review", target: "check" },
    ];
    const [workflow] = await db
      .insert(workflows)
      .values({
        workspaceId: fixture.workspaceId,
        createdById: fixture.owner,
        name: `Portable workflow ${randomUUID()}`,
        status: "active",
        activeVersion: 1,
      })
      .returning();
    await db.insert(workflowVersions).values({
      workflowId: workflow.id,
      version: 1,
      createdById: fixture.owner,
      definitionJson: definition,
    });
    const resourcePackage = await exportResourcePackage({
      workspaceId: fixture.workspaceId,
      userId: fixture.owner,
      resourceType: "workflow",
      resourceId: workflow.id,
    });
    return { child, skill, workflow, definition, resourcePackage };
  }

  it("exports the saved graph, previews without writes and remaps repeated assistant nodes to one independent copy", async () => {
    const source = await createSource();
    const manifest = source.resourcePackage.manifest;
    if (manifest.type !== "workflow") throw new Error("Expected workflow");
    expect(manifest.agentBindings).toHaveLength(1);
    expect(manifest.definition.nodes[1].parameters.agentId).not.toBe(
      source.child.agent.id,
    );
    expect(
      manifest.agentBindings[0].manifest.bundledResources?.skills[0].name,
    ).toBe(source.skill.name);
    const context = {
      workspaceId: fixture.destinationId,
      userId: fixture.owner,
      package: source.resourcePackage,
    };
    const before = await db
      .select()
      .from(workflows)
      .where(eq(workflows.workspaceId, fixture.destinationId));
    const preview = await importResourcePackage({ ...context, preview: true });
    expect(preview.preview.resources.map(({ type }) => type)).toEqual([
      "workflow",
      "agent",
      "skill",
    ]);
    expect(
      await db
        .select()
        .from(workflows)
        .where(eq(workflows.workspaceId, fixture.destinationId)),
    ).toEqual(before);
    const imported = await importResourcePackage(context);
    const [workflow] = await db
      .select()
      .from(workflows)
      .where(eq(workflows.id, imported.resource!.id));
    expect(workflow).toMatchObject({
      workspaceId: fixture.destinationId,
      createdById: fixture.owner,
      status: "draft",
      activeVersion: null,
      latestVersion: 1,
    });
    const [version] = await db
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.workflowId, workflow.id));
    const definition = version.definitionJson as typeof source.definition;
    const importedAgentId = String(definition.nodes[1].parameters.agentId);
    expect(importedAgentId).not.toBe(source.child.agent.id);
    expect(definition.nodes[2].parameters.agentId).toBe(importedAgentId);
    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, importedAgentId));
    const [binding] = await db
      .select()
      .from(agentSkillBindings)
      .where(eq(agentSkillBindings.agentVersionId, agent.activeVersionId!));
    expect(binding.skillId).not.toBe(source.skill.id);
    expect(definition.edges).toEqual(source.definition.edges);
    const [original] = await db
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.workflowId, source.workflow.id));
    expect(original.definitionJson).toEqual(source.definition);
  });

  it("rejects foreign projects, inaccessible dependencies and API keys lacking any dependency creation scope", async () => {
    const source = await createSource();
    await expect(
      exportResourcePackage({
        workspaceId: fixture.destinationId,
        userId: fixture.owner,
        resourceType: "workflow",
        resourceId: source.workflow.id,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      exportResourcePackage({
        workspaceId: fixture.workspaceId,
        userId: fixture.member,
        resourceType: "workflow",
        resourceId: source.workflow.id,
      }),
    ).rejects.toThrow(/not available/);
    const auth = {
      type: "api_key" as const,
      apiKeyId: randomUUID(),
      workspaceId: fixture.destinationId,
      userId: fixture.owner,
      scopes: ["marketplaceItems.install"],
    };
    for (const permission of [
      "workflows.create",
      "agents.create",
      "tools.configure",
    ]) {
      await expect(
        runWithRequestAuth(auth, () =>
          importResourcePackage({
            workspaceId: fixture.destinationId,
            userId: fixture.owner,
            package: source.resourcePackage,
          }),
        ),
      ).rejects.toThrow(permission);
      auth.scopes.push(permission);
    }
    const imported = await runWithRequestAuth(auth, () =>
      importResourcePackage({
        workspaceId: fixture.destinationId,
        userId: fixture.owner,
        package: source.resourcePackage,
      }),
    );
    expect(imported.resource?.type).toBe("workflow");
    await db
      .update(workflows)
      .set({ status: "archived", archivedAt: new Date() })
      .where(eq(workflows.id, source.workflow.id));
    await expect(
      exportResourcePackage({
        workspaceId: fixture.workspaceId,
        userId: fixture.owner,
        resourceType: "workflow",
        resourceId: source.workflow.id,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rolls back copied assistants and skills when persisting the workflow version fails", async () => {
    const source = await createSource();
    const trigger = `workflow_import_${randomUUID().replaceAll("-", "")}`;
    const snapshot = async () => ({
      workflows: await db
        .select({ id: workflows.id })
        .from(workflows)
        .where(eq(workflows.workspaceId, fixture.destinationId)),
      agents: await db
        .select({ id: agents.id })
        .from(agents)
        .where(eq(agents.workspaceId, fixture.destinationId)),
      skills: await db
        .select({ id: agentSkills.id })
        .from(agentSkills)
        .where(eq(agentSkills.workspaceId, fixture.destinationId)),
    });
    const before = await snapshot();
    await db.execute(
      sql.raw(
        `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS (SELECT 1 FROM workflows WHERE id = NEW.workflow_id AND workspace_id = '${fixture.destinationId}'::uuid) THEN RAISE EXCEPTION 'Test workflow version failure'; END IF; RETURN NEW; END $$`,
      ),
    );
    await db.execute(
      sql.raw(
        `CREATE TRIGGER ${trigger} BEFORE INSERT ON workflow_versions FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
      ),
    );
    try {
      await expect(
        importResourcePackage({
          workspaceId: fixture.destinationId,
          userId: fixture.owner,
          package: source.resourcePackage,
        }),
      ).rejects.toThrow();
      expect(await snapshot()).toEqual(before);
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER ${trigger} ON workflow_versions`));
      await db.execute(sql.raw(`DROP FUNCTION ${trigger}()`));
    }
  });
});
