import { and, eq } from "drizzle-orm";
import { hasWorkspacePermissionForRequest } from "@/modules/auth/workspace-access";
import {
  buildAgentManifest,
  buildCustomToolManifest,
  buildMcpPresetManifest,
  buildSkillManifest,
} from "@/modules/marketplace/manifest-builders";
import { sanitizeMarketplaceManifest } from "@/modules/marketplace/manifest-sanitizer";
import type {
  MarketplaceManifest,
  SourceResourceType,
} from "@/modules/marketplace/manifest-types";
import {
  canUserInstallMarketplaceItem,
  getMarketplaceItem,
} from "@/modules/marketplace/use-cases";
import { getLatestVersion } from "@/modules/marketplace/use-cases.get-marketplace-item-detail";
import { db } from "@/server/infrastructure/db";
import {
  agentSkills,
  customTools,
  mcpServers,
  mcpTools,
} from "@/server/infrastructure/db/schema";
import { audit } from "@/server/domain/services/audit";
import { requirePackageResourceAccess } from "./permissions";
import { parseResourcePackage, ResourcePackageError } from "./schema";
import { describeResourcePackage } from "./summary";

export async function exportResourcePackage(input: {
  workspaceId: string;
  userId: string;
  resourceType: SourceResourceType | "marketplace_item";
  resourceId: string;
}) {
  if (
    !(await hasWorkspacePermissionForRequest(
      input.userId,
      input.workspaceId,
      "marketplaceItems.publish",
    ))
  )
    throw new ResourcePackageError(
      "You cannot export resources from this project",
      403,
    );
  let manifest: MarketplaceManifest;
  if (input.resourceType === "marketplace_item") {
    const item = await getMarketplaceItem(input.resourceId);
    if (!item || !(await canUserInstallMarketplaceItem(item, input.userId)))
      throw new ResourcePackageError("Marketplace item not found", 404);
    const version = await getLatestVersion(item.id);
    if (!version)
      throw new ResourcePackageError("Marketplace item has no version", 409);
    manifest = sanitizeMarketplaceManifest(version.manifestJson);
  } else if (input.resourceType === "agent") {
    manifest = await buildAgentManifest(
      input.resourceId,
      input.workspaceId,
      "",
      undefined,
      undefined,
      undefined,
      input.userId,
    );
  } else if (
    input.resourceType === "skill" ||
    input.resourceType === "custom_tool"
  ) {
    await requirePackageResourceAccess({
      ...input,
      resourceType: input.resourceType,
    });
    if (input.resourceType === "skill") {
      const [skill] = await db
        .select()
        .from(agentSkills)
        .where(eq(agentSkills.id, input.resourceId))
        .limit(1);
      if (!skill) throw new ResourcePackageError("Skill not found", 404);
      manifest = buildSkillManifest(skill, skill.name, skill.description);
    } else {
      const [tool] = await db
        .select()
        .from(customTools)
        .where(eq(customTools.id, input.resourceId))
        .limit(1);
      if (!tool) throw new ResourcePackageError("Tool not found", 404);
      manifest = await buildCustomToolManifest(
        tool,
        tool.name,
        tool.description,
      );
    }
  } else {
    const [tool] =
      input.resourceType === "mcp_tool"
        ? await db
            .select()
            .from(mcpTools)
            .where(eq(mcpTools.id, input.resourceId))
            .limit(1)
        : [];
    const serverId =
      input.resourceType === "mcp_tool" ? tool?.mcpServerId : input.resourceId;
    if (!serverId) throw new ResourcePackageError("MCP tool not found", 404);
    await requirePackageResourceAccess({
      ...input,
      resourceType: "mcp_server",
      resourceId: serverId,
    });
    const [server] = await db
      .select()
      .from(mcpServers)
      .where(
        and(
          eq(mcpServers.id, serverId),
          eq(mcpServers.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);
    if (!server) throw new ResourcePackageError("MCP server not found", 404);
    const tools = tool
      ? [tool]
      : await db
          .select()
          .from(mcpTools)
          .where(eq(mcpTools.mcpServerId, server.id));
    manifest = buildMcpPresetManifest(
      tool?.name ?? server.name,
      tool?.description,
      server,
      tools,
      tool ? "tool" : "server",
    );
  }
  manifest = sanitizeMarketplaceManifest(manifest);
  const pending = [manifest];
  while (pending.length) {
    const current = pending.pop()!;
    if (current.type === "agent") {
      delete current.agent.providerId;
      delete current.agent.modelId;
      delete current.permissions;
      pending.push(
        ...(current.specialists ?? []).map((specialist) => specialist.manifest),
      );
    }
  }
  const resourcePackage = parseResourcePackage({
    format: "maiah.resource",
    schemaVersion: 1,
    manifest,
  });
  describeResourcePackage(resourcePackage);
  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "resources.exported",
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    outcome: "success",
  });
  return resourcePackage;
}
