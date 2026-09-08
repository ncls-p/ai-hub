import { requirePackageResourceAccess } from "@/modules/resource-package/permissions";
import { db } from "@/server/infrastructure/db";
import {
  agentKnowledgeBindings,
  agentDelegationBindings,
  agentSkillBindings,
  agentSkills,
  agentToolBindings,
  customTools,
  knowledgeBases,
  mcpServers,
  mcpTools,
} from "@/server/infrastructure/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  buildCustomToolManifest,
  buildMcpPresetManifest,
  buildSkillContentManifest,
  jsonRecord,
} from "./manifest-builders.json-record";
import {
  resolveAgentVersion,
  resolveToolBindingRef,
} from "./manifest-builders.resolve-agent-version";
import type {
  AgentMarketplaceManifest,
  McpPresetMarketplaceManifest,
  PortableKnowledgeBinding,
  PortableSkillBinding,
  PortableSpecialistManifest,
  PortableToolBinding,
  ToolMarketplaceManifest,
} from "./manifest-types";

export async function buildAgentManifest(
  agentId: string,
  workspaceId: string,
  name: string,
  description?: string | null,
  pinnedVersionId?: string,
  ancestry: ReadonlySet<string> = new Set(),
  actorUserId?: string,
  budget = { agents: 0 },
): Promise<AgentMarketplaceManifest> {
  if (ancestry.has(agentId)) {
    throw new Error("Delegation cycle detected while packaging orchestrator");
  }
  if (++budget.agents > 256 || ancestry.size >= 20) {
    throw new Error("Delegation graph is too large to publish safely");
  }
  const requireAccess = async (
    resourceType: Parameters<
      typeof requirePackageResourceAccess
    >[0]["resourceType"],
    resourceId: string,
  ) => {
    if (actorUserId)
      await requirePackageResourceAccess({
        workspaceId,
        userId: actorUserId,
        resourceType,
        resourceId,
      });
  };
  await requireAccess("agent", agentId);
  const resolved = await resolveAgentVersion(agentId, pinnedVersionId);
  if (!resolved) throw new Error("Agent not found");
  const { agent, agentVersion, providerName, modelName } = resolved;
  if (agent.workspaceId !== workspaceId) throw new Error("Agent not found");
  if (!agentVersion) throw new Error("Agent has no version");

  const delegationBindings =
    agent.kind === "orchestrator"
      ? await db
          .select({
            childAgentId: agentDelegationBindings.childAgentId,
            childAgentVersionId: agentDelegationBindings.childAgentVersionId,
            instructions: agentDelegationBindings.instructions,
          })
          .from(agentDelegationBindings)
          .where(eq(agentDelegationBindings.agentVersionId, agentVersion.id))
      : [];
  const nextAncestry = new Set(ancestry).add(agentId);
  const specialists: PortableSpecialistManifest[] = [];
  for (const binding of delegationBindings) {
    const child = await buildAgentManifest(
      binding.childAgentId,
      workspaceId,
      "",
      null,
      binding.childAgentVersionId,
      nextAncestry,
      actorUserId,
      budget,
    );
    specialists.push({
      instructions: binding.instructions,
      manifest: child,
    });
  }

  const toolBindings = await db
    .select()
    .from(agentToolBindings)
    .where(eq(agentToolBindings.agentVersionId, agentVersion.id));

  const skillBindingsRows = await db
    .select()
    .from(agentSkillBindings)
    .where(eq(agentSkillBindings.agentVersionId, agentVersion.id));

  const knowledgeBindingsRows = await db
    .select()
    .from(agentKnowledgeBindings)
    .where(eq(agentKnowledgeBindings.agentVersionId, agentVersion.id));

  const portableToolBindings: PortableToolBinding[] = [];
  for (const binding of toolBindings) {
    const portable = await resolveToolBindingRef(binding, workspaceId);
    if (!portable && actorUserId)
      throw new Error("A tool dependency is not available for export");
    if (portable) portableToolBindings.push(portable);
  }

  for (const binding of skillBindingsRows)
    await requireAccess("skill", binding.skillId);
  for (const binding of knowledgeBindingsRows)
    await requireAccess("knowledge_base", binding.knowledgeBaseId);
  if (agentVersion.providerId)
    await requireAccess("provider", agentVersion.providerId);
  if (agentVersion.modelId) await requireAccess("model", agentVersion.modelId);
  const skillIds = skillBindingsRows.map((b) => b.skillId);
  const skills =
    skillIds.length > 0
      ? await db
          .select()
          .from(agentSkills)
          .where(
            and(
              inArray(agentSkills.id, skillIds),
              eq(agentSkills.workspaceId, workspaceId),
            ),
          )
      : [];

  const skillBindings: PortableSkillBinding[] = skills.map((skill) => ({
    ref: skill.name,
    bundled: buildSkillContentManifest(skill),
  }));

  const kbIds = knowledgeBindingsRows.map((b) => b.knowledgeBaseId);
  const kbs =
    kbIds.length > 0
      ? await db
          .select()
          .from(knowledgeBases)
          .where(
            and(
              inArray(knowledgeBases.id, kbIds),
              eq(knowledgeBases.workspaceId, workspaceId),
            ),
          )
      : [];

  const knowledgeBindings: PortableKnowledgeBinding[] = kbs.map((kb) => ({
    name: kb.name,
    description: kb.description,
  }));

  const bundledMcpPresets: McpPresetMarketplaceManifest[] = [];
  const bundledCustomTools: ToolMarketplaceManifest[] = [];
  const seenMcpServers = new Set<string>();
  const seenCustomTools = new Set<string>();

  for (const binding of toolBindings) {
    if (binding.toolSource === "mcp") {
      const [tool] = await db
        .select()
        .from(mcpTools)
        .where(eq(mcpTools.id, binding.toolId))
        .limit(1);
      if (!tool || seenMcpServers.has(tool.mcpServerId)) continue;
      const [server] = await db
        .select()
        .from(mcpServers)
        .where(
          and(
            eq(mcpServers.id, tool.mcpServerId),
            eq(mcpServers.workspaceId, workspaceId),
          ),
        )
        .limit(1);
      if (!server) continue;
      await requireAccess("mcp_server", server.id);
      seenMcpServers.add(server.id);
      const serverTools = await db
        .select()
        .from(mcpTools)
        .where(eq(mcpTools.mcpServerId, server.id));
      bundledMcpPresets.push(
        buildMcpPresetManifest(
          server.name,
          null,
          server,
          serverTools,
          "server",
        ),
      );
    }
    if (binding.toolSource === "custom") {
      if (seenCustomTools.has(binding.toolId)) continue;
      const [tool] = await db
        .select()
        .from(customTools)
        .where(
          and(
            eq(customTools.id, binding.toolId),
            eq(customTools.workspaceId, workspaceId),
          ),
        )
        .limit(1);
      if (!tool) continue;
      await requireAccess("custom_tool", tool.id);
      seenCustomTools.add(tool.id);
      bundledCustomTools.push(
        await buildCustomToolManifest(tool, tool.name, tool.description),
      );
    }
  }

  return {
    type: "agent",
    name: name || agent.name,
    description: description ?? agent.description ?? undefined,
    kind: agent.kind,
    agent: {
      systemPrompt: agentVersion.systemPrompt,
      providerId: agentVersion.providerId,
      modelId: agentVersion.modelId,
      providerName,
      modelName,
      temperature: agentVersion.temperature,
      topP: agentVersion.topP,
      maxOutputTokens: agentVersion.maxOutputTokens,
      maxToolCalls: agentVersion.maxToolCalls,
      toolChoice: agentVersion.toolChoice,
      generationSettings: jsonRecord(agentVersion.generationSettingsJson),
      responseFormat: jsonRecord(agentVersion.responseFormatJson),
      memoryPolicy: jsonRecord(agentVersion.memoryPolicyJson),
      guardrails: jsonRecord(agentVersion.guardrailsJson),
      approvalPolicy: jsonRecord(agentVersion.approvalPolicyJson),
      orchestrationPolicy: jsonRecord(agentVersion.orchestrationPolicyJson),
    },
    specialists,
    toolBindings: portableToolBindings,
    skillBindings,
    knowledgeBindings,
    bundledResources: {
      skills: skills.map((skill) => ({
        name: skill.name,
        skill: buildSkillContentManifest(skill),
      })),
      mcpPresets: bundledMcpPresets,
      customTools: bundledCustomTools,
    },
  };
}
