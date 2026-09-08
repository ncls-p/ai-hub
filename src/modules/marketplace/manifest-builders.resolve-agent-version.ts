import { BUILTIN_TOOL_SUMMARIES } from "@/modules/tool/builtin-tools-catalog";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  agentToolBindings,
  agentVersions,
  aiModels,
  aiProviders,
  customTools,
  mcpServers,
  mcpTools,
} from "@/server/infrastructure/db/schema";
import { and, desc, eq } from "drizzle-orm";
import type { PortableToolBinding } from "./manifest-types";

export async function resolveAgentVersion(
  agentId: string,
  pinnedVersionId?: string,
) {
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  if (!agent) return null;

  const versionQuery = pinnedVersionId
    ? db
        .select()
        .from(agentVersions)
        .where(
          and(
            eq(agentVersions.id, pinnedVersionId),
            eq(agentVersions.agentId, agentId),
          ),
        )
        .limit(1)
    : agent.activeVersionId
      ? db
          .select()
          .from(agentVersions)
          .where(
            and(
              eq(agentVersions.id, agent.activeVersionId),
              eq(agentVersions.agentId, agentId),
            ),
          )
          .limit(1)
      : db
          .select()
          .from(agentVersions)
          .where(eq(agentVersions.agentId, agentId))
          .orderBy(desc(agentVersions.versionNumber))
          .limit(1);

  const [agentVersion] = await versionQuery;
  if (!agentVersion) return { agent, agentVersion: null };

  let providerName: string | null = null;
  let modelName: string | null = null;
  if (agentVersion.providerId) {
    const [provider] = await db
      .select({ name: aiProviders.name })
      .from(aiProviders)
      .where(eq(aiProviders.id, agentVersion.providerId))
      .limit(1);
    providerName = provider?.name ?? null;
  }
  if (agentVersion.modelId) {
    const [model] = await db
      .select({
        displayName: aiModels.displayName,
        modelId: aiModels.modelId,
      })
      .from(aiModels)
      .where(eq(aiModels.id, agentVersion.modelId))
      .limit(1);
    modelName = model?.displayName ?? model?.modelId ?? null;
  }

  return { agent, agentVersion, providerName, modelName };
}

export async function resolveToolBindingRef(
  binding: typeof agentToolBindings.$inferSelect,
  workspaceId: string,
): Promise<PortableToolBinding | null> {
  if (binding.toolSource === "builtin") {
    const builtin = BUILTIN_TOOL_SUMMARIES.find((t) => t.id === binding.toolId);
    return {
      source: "builtin",
      ref: binding.toolId,
      label: builtin?.displayName ?? builtin?.name ?? binding.toolId,
      requireApproval: binding.requireApproval,
      riskLevel: binding.riskLevel,
    };
  }
  if (binding.toolSource === "mcp") {
    const [tool] = await db
      .select({ name: mcpTools.name, serverId: mcpTools.mcpServerId })
      .from(mcpTools)
      .where(eq(mcpTools.id, binding.toolId))
      .limit(1);
    if (!tool) return null;
    const [server] = await db
      .select({ name: mcpServers.name })
      .from(mcpServers)
      .where(
        and(
          eq(mcpServers.id, tool.serverId),
          eq(mcpServers.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (!server) return null;
    const ref = `${server.name}/${tool.name}`;
    return {
      source: "mcp",
      ref,
      label: ref,
      requireApproval: binding.requireApproval,
      riskLevel: binding.riskLevel,
    };
  }
  if (binding.toolSource === "custom") {
    const [tool] = await db
      .select({ name: customTools.name })
      .from(customTools)
      .where(
        and(
          eq(customTools.id, binding.toolId),
          eq(customTools.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (!tool) return null;
    return {
      source: "custom",
      ref: tool.name,
      label: tool.name,
      requireApproval: binding.requireApproval,
      riskLevel: binding.riskLevel,
    };
  }
  return null;
}
