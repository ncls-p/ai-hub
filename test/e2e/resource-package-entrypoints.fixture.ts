import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createStarterDefinition } from "@/modules/workflows/contracts";
import { databaseUrl, ensureE2EAssistant } from "./fixtures";

export async function createPackageEntrypointsFixture() {
  const { workspaceId } = await ensureE2EAssistant();
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  const prefix = `Portable ${randomUUID().slice(0, 8)}`;
  const owner = (
    await client.query(
      `select id from "user" where email = 'e2e-admin@example.test'`,
    )
  ).rows[0].id;
  const assistant = randomUUID(),
    orchestrator = randomUUID(),
    assistantVersion = randomUUID(),
    orchestratorVersion = randomUUID(),
    skill = randomUUID(),
    server = randomUUID(),
    tool = randomUUID(),
    workflow = randomUUID();
  for (const [id, version, kind] of [
    [assistant, assistantVersion, "assistant"],
    [orchestrator, orchestratorVersion, "orchestrator"],
  ]) {
    await client.query(
      `insert into agents (id, workspace_id, name, slug, kind, created_by_user_id) values ($1,$2,$3,$6,$4,$5)`,
      [id, workspaceId, `${prefix} ${kind}`, kind, owner, id],
    );
    await client.query(
      `insert into agent_versions (id, agent_id, version_number, name, system_prompt, created_by_user_id) values ($1,$2,1,$3,'Review the supplied documents.',$4)`,
      [version, id, `${prefix} ${kind}`, owner],
    );
    await client.query(
      `update agents set active_version_id = $1 where id = $2`,
      [version, id],
    );
  }
  await client.query(
    `insert into agent_skills (id,workspace_id,created_by_user_id,name,markdown_files_json) values ($1,$2,$3,$4,$5)`,
    [
      skill,
      workspaceId,
      owner,
      `${prefix} skill`,
      JSON.stringify([
        {
          path: "SKILL.md",
          content: "# Document review\nCompare the supplied documents.",
        },
      ]),
    ],
  );
  await client.query(
    `insert into agent_skill_bindings (agent_version_id,skill_id) values ($1,$2)`,
    [assistantVersion, skill],
  );
  await client.query(
    `insert into mcp_servers (id,workspace_id,created_by_user_id,name,transport,url,enabled,health_status) values ($1,$2,$3,$4,'sse','https://example.invalid/mcp?token=source-secret',false,'healthy')`,
    [server, workspaceId, owner, `${prefix} MCP`],
  );
  await client.query(
    `insert into mcp_tools (id,mcp_server_id,name,input_schema_json) values ($1,$2,'find_document','{"type":"object","properties":{"query":{"type":"string"}}}')`,
    [tool, server],
  );
  await client.query(
    `insert into agent_tool_bindings (agent_version_id,tool_source,tool_id,require_approval) values ($1,'mcp',$2,true)`,
    [assistantVersion, tool],
  );
  await client.query(
    `insert into agent_delegation_bindings (agent_version_id,child_agent_id,child_agent_version_id) values ($1,$2,$3)`,
    [orchestratorVersion, assistant, assistantVersion],
  );
  const definition = createStarterDefinition();
  definition.nodes.push({
    ...definition.nodes[0],
    id: "review",
    type: "agent.run",
    label: "Review",
    parameters: { agentId: orchestrator, prompt: "Review {{ input }}" },
  });
  definition.edges = [{ id: "start", source: "trigger", target: "review" }];
  await client.query(
    `insert into workflows (id,workspace_id,created_by_user_id,name) values ($1,$2,$3,$4)`,
    [workflow, workspaceId, owner, `${prefix} workflow`],
  );
  await client.query(
    `insert into workflow_versions (workflow_id,version,definition_json,created_by_user_id) values ($1,1,$2,$3)`,
    [workflow, JSON.stringify(definition), owner],
  );
  const standaloneServerIds: string[] = [];
  return {
    standaloneServerIds,
    client,
    prefix,
    workspaceId,
    assistant,
    orchestrator,
    skill,
    server,
    tool,
    workflow,
    async cleanup() {
      await client.query("delete from mcp_servers where id = any($1::uuid[])", [
        standaloneServerIds,
      ]);
      await client.query(
        `delete from agent_delegation_bindings where agent_version_id in (select v.id from agent_versions v join agents a on a.id=v.agent_id where a.name like $1)`,
        [`${prefix}%`],
      );
      await client.query(
        `delete from agent_versions where agent_id in (select id from agents where name like $1)`,
        [`${prefix}%`],
      );
      for (const table of [
        "workflows",
        "agents",
        "agent_skills",
        "mcp_servers",
      ])
        await client.query(`delete from ${table} where name like $1`, [
          `${prefix}%`,
        ]);
      await client.end();
    },
  };
}
