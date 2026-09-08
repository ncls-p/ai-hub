import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  agentSkills,
  agentSkillBindings,
  agentVersions,
  customTools,
  mcpServers,
  mcpTools,
  marketplaceItems,
  marketplaceItemVersions,
} from "@/server/infrastructure/db/schema";
import { exportResourcePackage } from "@/modules/resource-package/export";
import { importResourcePackage } from "@/modules/resource-package/import";
import { installMarketplaceItem } from "@/modules/marketplace/use-cases.install-marketplace-item";
import { runWithRequestAuth } from "@/modules/auth/request-auth-context";
import { createSharingFixture } from "./resource-sharing-db.fixture";

const suite = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;
suite("standalone resource packages and scoped installation", () => {
  let fixture: Awaited<ReturnType<typeof createSharingFixture>>;
  beforeAll(async () => {
    fixture = await createSharingFixture();
  }, 60_000);
  afterAll(async () => {
    await fixture?.cleanup();
  });

  it("round trips standalone skills, custom tools, MCP servers and individual MCP tools", async () => {
    const context = {
      workspaceId: fixture.workspaceId,
      createdById: fixture.owner,
    };
    const [skill] = await db
      .insert(agentSkills)
      .values({
        ...context,
        name: "Portable standalone",
        markdownFilesJson: [{ path: "SKILL.md", content: "# Standalone" }],
      })
      .returning();
    const schema = {
      type: "object",
      properties: { token: { type: "string" }, query: { type: "string" } },
      required: ["token"],
    };
    const [custom] = await db
      .insert(customTools)
      .values({
        ...context,
        name: "Portable custom",
        inputSchemaJson: schema,
        status: "active",
      })
      .returning();
    const [server] = await db
      .insert(mcpServers)
      .values({
        ...context,
        name: "Standalone server",
        transport: "stdio",
        command: "npx",
        argsJson: ["-y", "server", "--api-key=stored-value"],
      })
      .returning();
    const tools = await db
      .insert(mcpTools)
      .values(
        ["one", "two"].map((name) => ({
          mcpServerId: server.id,
          name,
          inputSchemaJson: schema,
        })),
      )
      .returning();
    for (const [resourceType, resourceId] of [
      ["skill", skill.id],
      ["custom_tool", custom.id],
      ["mcp_server", server.id],
      ["mcp_tool", tools[0].id],
    ] as const) {
      const value = await exportResourcePackage({
        workspaceId: fixture.workspaceId,
        userId: fixture.owner,
        resourceType,
        resourceId,
      });
      expect(JSON.stringify(value)).not.toContain("stored-value");
      const result = await importResourcePackage({
        workspaceId: fixture.destinationId,
        userId: fixture.owner,
        package: value,
      });
      expect(result.resource!.id).not.toBe(resourceId);
      if (resourceType === "skill") {
        const [copy] = await db
          .select()
          .from(agentSkills)
          .where(eq(agentSkills.id, result.resource!.id));
        expect(copy.markdownFilesJson).toEqual(skill.markdownFilesJson);
      } else if (resourceType === "custom_tool") {
        const [copy] = await db
          .select()
          .from(customTools)
          .where(eq(customTools.id, result.resource!.id));
        expect(copy.inputSchemaJson).toEqual(schema);
        expect(copy.status).toBe("draft");
      } else {
        const [copy] = await db
          .select()
          .from(mcpServers)
          .where(eq(mcpServers.id, result.resource!.id));
        expect(copy.enabled).toBe(false);
        const copiedTools = await db
          .select()
          .from(mcpTools)
          .where(eq(mcpTools.mcpServerId, copy.id));
        expect(copiedTools.map((tool) => tool.name).sort()).toEqual(
          resourceType === "mcp_tool" ? ["one"] : ["one", "two"],
        );
        expect(copiedTools[0].inputSchemaJson).toEqual(schema);
      }
    }
  });

  it("creates an inline bundled skill instead of reusing an unrelated same-name destination skill", async () => {
    const [existing] = await db
      .insert(agentSkills)
      .values({
        workspaceId: fixture.destinationId,
        createdById: fixture.owner,
        name: "Same name",
        markdownFilesJson: [{ path: "SKILL.md", content: "Old content" }],
      })
      .returning();
    const value = {
      format: "maiah.resource",
      schemaVersion: 1,
      manifest: {
        type: "agent",
        name: "Inline bundle",
        agent: {},
        skillBindings: [
          {
            ref: "Same name",
            bundled: {
              markdownFiles: [{ path: "SKILL.md", content: "Bundled content" }],
            },
          },
        ],
      },
    };
    const result = await importResourcePackage({
      workspaceId: fixture.destinationId,
      userId: fixture.owner,
      package: value,
    });
    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, result.resource!.id));
    const [binding] = await db
      .select()
      .from(agentSkillBindings)
      .where(eq(agentSkillBindings.agentVersionId, agent.activeVersionId!));
    expect(binding.skillId).not.toBe(existing.id);
    const [copy] = await db
      .select()
      .from(agentSkills)
      .where(eq(agentSkills.id, binding.skillId));
    expect(copy.markdownFilesJson).toEqual([
      { path: "SKILL.md", content: "Bundled content" },
    ]);
  });

  it("checks dependency creation scopes for JSON and marketplace imports and does not trust source provider IDs", async () => {
    const manifest = {
      type: "agent" as const,
      name: "Scoped import",
      agent: { providerId: randomUUID(), modelId: randomUUID() },
    };
    const [item] = await db
      .insert(marketplaceItems)
      .values({
        publisherUserId: fixture.owner,
        publisherWorkspaceId: fixture.workspaceId,
        type: "agent",
        name: manifest.name,
        slug: randomUUID(),
        visibility: "public",
        status: "published",
      })
      .returning();
    await db
      .insert(marketplaceItemVersions)
      .values({
        itemId: item.id,
        version: "1.0.0",
        manifestJson: manifest,
        createdById: fixture.owner,
      });
    const auth = {
      type: "api_key" as const,
      apiKeyId: randomUUID(),
      workspaceId: fixture.destinationId,
      userId: fixture.owner,
      scopes: ["marketplaceItems.install"],
    };
    const value = { format: "maiah.resource", schemaVersion: 1, manifest };
    await expect(
      runWithRequestAuth(auth, () =>
        importResourcePackage({
          workspaceId: fixture.destinationId,
          userId: fixture.owner,
          package: value,
        }),
      ),
    ).rejects.toThrow("agents.create");
    await expect(
      runWithRequestAuth(auth, () =>
        installMarketplaceItem({
          workspaceId: fixture.destinationId,
          userId: fixture.owner,
          itemId: item.id,
        }),
      ),
    ).rejects.toThrow("agents.create");
    expect(
      await db.select().from(agents).where(eq(agents.name, manifest.name)),
    ).toEqual([]);
    const result = await runWithRequestAuth(
      { ...auth, scopes: [...auth.scopes, "agents.create"] },
      () =>
        importResourcePackage({
          workspaceId: fixture.destinationId,
          userId: fixture.owner,
          package: value,
        }),
    );
    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, result.resource!.id));
    const [version] = await db
      .select()
      .from(agentVersions)
      .where(eq(agentVersions.id, agent.activeVersionId!));
    expect(version).toMatchObject({ providerId: null, modelId: null });
    const exported = await exportResourcePackage({
      workspaceId: fixture.workspaceId,
      userId: fixture.owner,
      resourceType: "marketplace_item",
      resourceId: item.id,
    });
    expect(JSON.stringify(exported)).not.toContain(manifest.agent.providerId);
    await expect(
      runWithRequestAuth(auth, () =>
        exportResourcePackage({
          workspaceId: fixture.workspaceId,
          userId: fixture.owner,
          resourceType: "marketplace_item",
          resourceId: item.id,
        }),
      ),
    ).rejects.toThrow(/cannot export/);
  });
});
