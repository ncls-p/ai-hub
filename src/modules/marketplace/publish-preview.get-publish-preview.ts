import { db } from "@/server/infrastructure/db";
import {
  agentSkills,
  agents,
  customTools,
  marketplaceItemVersions,
  marketplaceItems,
  mcpServers,
  mcpTools,
} from "@/server/infrastructure/db/schema";
import { and, eq } from "drizzle-orm";
import { findExistingDraft } from "./draft-helpers";
import {
  buildAgentManifest,
  buildCustomToolManifest,
  buildMcpPresetManifest,
  buildSkillManifest,
} from "./manifest-builders";
import { sanitizeMarketplaceManifest } from "./manifest-sanitizer";
import type { MarketplaceManifest, SourceResourceType } from "./manifest-types";
import {
  PublishPreviewResult,
  extractCredentialFields,
  manifestSummary,
} from "./publish-preview.publish-preview-result";

export async function getPublishPreview(input: {
  workspaceId: string;
  userId: string;
  agentId?: string;
  skillId?: string;
  customToolId?: string;
  mcpServerId?: string;
  mcpToolId?: string;
  itemId?: string;
}): Promise<PublishPreviewResult> {
  if (input.itemId) {
    const [item] = await db
      .select()
      .from(marketplaceItems)
      .where(eq(marketplaceItems.id, input.itemId))
      .limit(1);
    if (
      !item ||
      item.publisherUserId !== input.userId ||
      item.publisherWorkspaceId !== input.workspaceId
    )
      throw new Error("Marketplace item not found");
    const [versionRow] = item.latestVersionId
      ? await db
          .select()
          .from(marketplaceItemVersions)
          .where(eq(marketplaceItemVersions.id, item.latestVersionId))
          .limit(1)
      : [null];

    const manifest = sanitizeMarketplaceManifest(
      versionRow?.manifestJson ?? {},
    );
    return {
      name: item.name,
      description: item.description,
      tags: Array.isArray(item.tagsJson) ? (item.tagsJson as string[]) : [],
      suggestedVersion: versionRow?.version ?? "1.0.0",
      manifestPreview: manifestSummary(manifest),
      credentialFields: extractCredentialFields(manifest),
      hasExistingDraft: item.status === "draft",
      existingItemId: item.id,
      resourceType: "marketplace_item",
    };
  }

  let manifest: MarketplaceManifest;
  let name: string;
  let description: string | null;
  let resourceType: SourceResourceType;
  let resourceId: string;

  if (input.agentId) {
    const [agent] = await db
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.id, input.agentId),
          eq(agents.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);
    if (!agent || agent.createdById !== input.userId) {
      throw new Error("Agent not found");
    }
    manifest = await buildAgentManifest(
      input.agentId,
      input.workspaceId,
      agent.name,
      agent.description,
      undefined,
      undefined,
      input.userId,
    );
    name = agent.name;
    description = agent.description;
    resourceType = "agent";
    resourceId = input.agentId;
  } else if (input.skillId) {
    const [skill] = await db
      .select()
      .from(agentSkills)
      .where(
        and(
          eq(agentSkills.id, input.skillId),
          eq(agentSkills.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);
    if (!skill || skill.createdById !== input.userId) {
      throw new Error("Skill not found");
    }
    manifest = buildSkillManifest(skill, skill.name, skill.description);
    name = skill.name;
    description = skill.description;
    resourceType = "skill";
    resourceId = input.skillId;
  } else if (input.customToolId) {
    const [tool] = await db
      .select()
      .from(customTools)
      .where(
        and(
          eq(customTools.id, input.customToolId),
          eq(customTools.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);
    if (!tool || tool.createdById !== input.userId) {
      throw new Error("Custom tool not found");
    }
    manifest = await buildCustomToolManifest(tool, tool.name, tool.description);
    name = tool.name;
    description = tool.description;
    resourceType = "custom_tool";
    resourceId = input.customToolId;
  } else if (input.mcpServerId) {
    const [server] = await db
      .select()
      .from(mcpServers)
      .where(
        and(
          eq(mcpServers.id, input.mcpServerId),
          eq(mcpServers.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);
    if (!server || server.createdById !== input.userId) {
      throw new Error("MCP server not found");
    }
    const tools = await db
      .select()
      .from(mcpTools)
      .where(eq(mcpTools.mcpServerId, server.id));
    manifest = buildMcpPresetManifest(
      server.name,
      null,
      server,
      tools,
      "server",
    );
    name = server.name;
    description = null;
    resourceType = "mcp_server";
    resourceId = input.mcpServerId;
  } else if (input.mcpToolId) {
    const [tool] = await db
      .select()
      .from(mcpTools)
      .where(eq(mcpTools.id, input.mcpToolId))
      .limit(1);
    if (!tool) throw new Error("MCP tool not found");
    const [server] = await db
      .select()
      .from(mcpServers)
      .where(
        and(
          eq(mcpServers.id, tool.mcpServerId),
          eq(mcpServers.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);
    if (!server || server.createdById !== input.userId) {
      throw new Error("MCP server not found");
    }
    manifest = buildMcpPresetManifest(
      `${server.name} — ${tool.name}`,
      tool.description,
      server,
      [tool],
      "tool",
    );
    name = `${server.name} — ${tool.name}`;
    description = tool.description;
    resourceType = "mcp_tool";
    resourceId = input.mcpToolId;
  } else {
    throw new Error("No resource id provided");
  }

  const existing = await findExistingDraft(
    resourceType,
    resourceId,
    input.userId,
  );

  return {
    name,
    description,
    tags: existing?.tagsJson ? (existing.tagsJson as string[]) : [],
    suggestedVersion: "1.0.0",
    manifestPreview: manifestSummary(manifest),
    credentialFields: extractCredentialFields(manifest),
    hasExistingDraft: Boolean(existing),
    existingItemId: existing?.id ?? null,
    resourceType,
  };
}
