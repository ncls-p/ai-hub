import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/infrastructure/db";
import {
  agentDelegationBindings,
  agentSkills,
  agentSkillBindings,
  agentToolBindings,
  mcpServers,
  mcpTools,
  workflows,
  workflowVersions,
} from "@/server/infrastructure/db/schema";
import { exportResourcePackage } from "@/modules/resource-package/export";
import { createStarterDefinition } from "@/modules/workflows/contracts";
import type { ResourcePackage } from "@/modules/resource-package/schema";
import type { ResourcePackageSource } from "@/modules/resource-package/types";
import { createSharingFixture } from "./resource-sharing-db.fixture";

function child(args: string[], env: NodeJS.ProcessEnv, input = "") {
  return new Promise<string>((resolve, reject) => {
    const process = spawn(globalThis.process.execPath, args, {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    process.stdout.on("data", (data) => {
      output += data;
    });
    process.stderr.on("data", (data) => {
      output += data;
    });
    const timeout = setTimeout(() => process.kill("SIGKILL"), 90_000);
    process.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    process.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(output);
      else reject(new Error(output.slice(-8_000)));
    });
    process.stdin.end(input);
  });
}

const suite = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;
suite("resource packages between independent installations", () => {
  let fixture: Awaited<ReturnType<typeof createSharingFixture>>;
  beforeAll(async () => {
    fixture = await createSharingFixture();
  }, 60_000);
  afterAll(async () => {
    await fixture?.cleanup();
  });

  it("imports assistants, orchestrators, skills, MCP servers, individual tools and workflows into a separately migrated database with another encryption key", async () => {
    const agent = await fixture.makeAgent("Cross-system assistant");
    const orchestrator = await fixture.makeAgent("Cross-system coordinator", {
      kind: "orchestrator",
    });
    await db.insert(agentDelegationBindings).values({
      agentVersionId: orchestrator.version.id,
      childAgentId: agent.agent.id,
      childAgentVersionId: agent.version.id,
    });
    const [skill] = await db
      .insert(agentSkills)
      .values({
        workspaceId: fixture.workspaceId,
        createdById: fixture.owner,
        name: "Cross-system skill",
        markdownFilesJson: [
          {
            path: "SKILL.md",
            content: "# Review\nCompare the provided documents.",
          },
        ],
      })
      .returning();
    await db
      .insert(agentSkillBindings)
      .values({ agentVersionId: agent.version.id, skillId: skill.id });
    const [server] = await db
      .insert(mcpServers)
      .values({
        workspaceId: fixture.workspaceId,
        createdById: fixture.owner,
        name: "Cross-system MCP",
        transport: "sse",
        url: "https://example.invalid/mcp?token=source-only-secret",
        enabled: false,
      })
      .returning();
    const [tool] = await db
      .insert(mcpTools)
      .values({
        mcpServerId: server.id,
        name: "find_document",
        inputSchemaJson: {
          type: "object",
          properties: { query: { type: "string" } },
        },
      })
      .returning();
    await db.insert(agentToolBindings).values({
      agentVersionId: agent.version.id,
      toolSource: "mcp",
      toolId: tool.id,
      requireApproval: true,
    });
    const definition = createStarterDefinition();
    definition.nodes.push({
      ...definition.nodes[0],
      id: "review",
      type: "agent.run",
      label: "Review",
      parameters: { agentId: agent.agent.id, prompt: "Review {{ input }}" },
    });
    definition.edges = [{ id: "start", source: "trigger", target: "review" }];
    const [workflow] = await db
      .insert(workflows)
      .values({
        workspaceId: fixture.workspaceId,
        createdById: fixture.owner,
        name: "Cross-system workflow",
      })
      .returning();
    await db.insert(workflowVersions).values({
      workflowId: workflow.id,
      version: 1,
      createdById: fixture.owner,
      definitionJson: definition,
    });
    const roots: Array<[ResourcePackageSource, string]> = [
      ["agent", agent.agent.id],
      ["agent", orchestrator.agent.id],
      ["skill", skill.id],
      ["mcp_server", server.id],
      ["mcp_tool", tool.id],
      ["workflow", workflow.id],
    ];
    const packages: ResourcePackage[] = [];
    for (const [resourceType, resourceId] of roots)
      packages.push(
        await exportResourcePackage({
          workspaceId: fixture.workspaceId,
          userId: fixture.owner,
          resourceType,
          resourceId,
        }),
      );
    expect(JSON.stringify(packages)).not.toContain("source-only-secret");
    const databaseName = `package_target_${randomUUID().replaceAll("-", "")}`;
    const admin = new Client({
      connectionString: process.env.IAM_INTEGRATION_DATABASE_URL,
    });
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE "${databaseName}"`);
      const targetUrl = new URL(process.env.IAM_INTEGRATION_DATABASE_URL!);
      targetUrl.pathname = "/" + databaseName;
      const env = {
        ...process.env,
        DATABASE_URL: targetUrl.toString(),
        IAM_INTEGRATION_DATABASE_URL: targetUrl.toString(),
        APP_ENCRYPTION_KEY: "2".repeat(64),
      };
      await child(["node_modules/tsx/dist/cli.mjs", "scripts/migrate.ts"], env);
      const output = await child(
        [
          "node_modules/tsx/dist/cli.mjs",
          "test/integration/resource-package-target-system.fixture.ts",
        ],
        env,
        JSON.stringify({
          packages,
          sourceIds: [
            fixture.owner,
            fixture.workspaceId,
            agent.agent.id,
            agent.version.id,
            orchestrator.agent.id,
            orchestrator.version.id,
            skill.id,
            server.id,
            tool.id,
            workflow.id,
          ],
        }),
      );
      const result = output.match(/RESOURCE_SYSTEM_RESULT=(.+)/)?.[1];
      expect(result).toBeDefined();
      expect(JSON.parse(result!)).toEqual({
        databaseName,
        imported: 6,
        types: [
          "agent",
          "agent",
          "skill",
          "mcp_preset",
          "mcp_preset",
          "workflow",
        ],
        foreignIds: 0,
      });
    } finally {
      await admin.query(
        `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
      );
      await admin.end();
    }
  }, 120_000);
});
