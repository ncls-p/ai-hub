import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  agentDelegationBindings,
  agentVersions,
  agentSkillBindings,
  agentSkills,
  agentToolBindings,
  mcpServers,
  mcpTools,
  workflows,
  workflowVersions,
} from "@/server/infrastructure/db/schema";
import { importResourcePackage } from "@/modules/resource-package/import";
import { exportResourcePackage } from "@/modules/resource-package/export";
import { describeResourcePackage } from "@/modules/resource-package/summary";
import type { ResourcePackage } from "@/modules/resource-package/schema";
import type { ResourcePackageSource } from "@/modules/resource-package/types";
import { createSharingFixture } from "./resource-sharing-db.fixture";

async function run() {
  const input = JSON.parse(readFileSync(0, "utf8")) as {
    packages: ResourcePackage[];
    sourceIds: string[];
  };
  const databaseName = (
    await db.execute(sql`select current_database() as name`)
  ).rows[0].name;
  assert.equal(
    databaseName,
    new URL(process.env.DATABASE_URL!).pathname.slice(1),
  );
  const fixture = await createSharingFixture();
  const resources = [];
  for (const resourcePackage of input.packages) {
    const imported = await importResourcePackage({
      workspaceId: fixture.destinationId,
      userId: fixture.owner,
      package: resourcePackage,
    });
    assert(imported.resource);
    const type: ResourcePackageSource =
      imported.resource.type === "mcp_preset"
        ? "mcp_server"
        : imported.resource.type;
    const reexported = await exportResourcePackage({
      workspaceId: fixture.destinationId,
      userId: fixture.owner,
      resourceType: type,
      resourceId: imported.resource.id,
    });
    assert.deepEqual(
      describeResourcePackage(reexported).resources,
      describeResourcePackage(resourcePackage).resources,
    );
    resources.push(imported.resource);
  }
  const importedAgents = await db
    .select()
    .from(agents)
    .where(eq(agents.workspaceId, fixture.destinationId));
  const ids = importedAgents.map(({ id }) => id);
  const versions = await db
    .select()
    .from(agentVersions)
    .where(inArray(agentVersions.agentId, ids));
  const versionIds = versions.map(({ id }) => id);
  const delegations = await db
    .select()
    .from(agentDelegationBindings)
    .where(inArray(agentDelegationBindings.agentVersionId, versionIds));
  assert(delegations.length > 0, "Orchestrator specialists must be recreated");
  for (const binding of delegations) {
    assert(ids.includes(binding.childAgentId));
    assert(
      versions.some(
        (version) =>
          version.id === binding.childAgentVersionId &&
          version.agentId === binding.childAgentId,
      ),
    );
  }
  const skills = await db
    .select()
    .from(agentSkills)
    .where(eq(agentSkills.workspaceId, fixture.destinationId));
  const skillBindings = await db
    .select()
    .from(agentSkillBindings)
    .where(inArray(agentSkillBindings.agentVersionId, versionIds));
  assert(skillBindings.length > 0);
  assert(
    skillBindings.every((binding) =>
      skills.some((skill) => skill.id === binding.skillId),
    ),
  );
  const servers = await db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.workspaceId, fixture.destinationId));
  assert(
    servers.length > 0 &&
      servers.every(
        (server) =>
          !server.enabled &&
          !server.encryptedHeadersJson &&
          !server.encryptedEnvJson,
      ),
  );
  const tools = await db
    .select()
    .from(mcpTools)
    .where(
      inArray(
        mcpTools.mcpServerId,
        servers.map(({ id }) => id),
      ),
    );
  const toolBindings = await db
    .select()
    .from(agentToolBindings)
    .where(inArray(agentToolBindings.agentVersionId, versionIds));
  assert(toolBindings.some((binding) => binding.toolSource === "mcp"));
  assert(
    toolBindings
      .filter((binding) => binding.toolSource === "mcp")
      .every((binding) => tools.some((tool) => tool.id === binding.toolId)),
  );
  const importedWorkflows = await db
    .select()
    .from(workflows)
    .where(eq(workflows.workspaceId, fixture.destinationId));
  assert(
    importedWorkflows.length > 0 &&
      importedWorkflows.every(
        (workflow) =>
          workflow.status === "draft" && workflow.activeVersion === null,
      ),
  );
  const workflowDefinitions = await db
    .select()
    .from(workflowVersions)
    .where(
      inArray(
        workflowVersions.workflowId,
        importedWorkflows.map(({ id }) => id),
      ),
    );
  for (const version of workflowDefinitions) {
    const definition = version.definitionJson as {
      nodes: Array<{ type: string; parameters: { agentId?: string } }>;
    };
    assert(
      definition.nodes
        .filter((node) => node.type === "agent.run")
        .every((node) => ids.includes(node.parameters.agentId!)),
    );
  }
  const persisted = JSON.stringify({
    importedAgents,
    versions,
    delegations,
    skills,
    skillBindings,
    servers,
    tools,
    toolBindings,
    importedWorkflows,
    workflowDefinitions,
  });
  for (const sourceId of input.sourceIds)
    assert(
      !persisted.includes(sourceId),
      `Source identifier retained: ${sourceId}`,
    );
  console.log(
    "RESOURCE_SYSTEM_RESULT=" +
      JSON.stringify({
        databaseName,
        imported: resources.length,
        types: resources.map(({ type }) => type),
        foreignIds: 0,
      }),
  );
}
void run().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
