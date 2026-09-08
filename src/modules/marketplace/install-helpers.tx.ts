import { db } from "@/server/infrastructure/db";
import {
  aiModels,
  aiProviders,
  customTools,
  mcpServers,
  mcpTools,
} from "@/server/infrastructure/db/schema";
import { and, eq, or } from "drizzle-orm";
import type {
  McpPresetMarketplaceManifest,
  ToolMarketplaceManifest,
} from "./manifest-types";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function resolveProviderId(
  tx: Tx,
  workspaceId: string,
  providerId: string | null | undefined,
  providerName: string | null | undefined,
) {
  if (providerId) {
    const [byId] = await tx
      .select({ id: aiProviders.id })
      .from(aiProviders)
      .where(
        and(
          eq(aiProviders.id, providerId),
          eq(aiProviders.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (byId) return byId.id;
  }
  if (providerName) {
    const [byName] = await tx
      .select({ id: aiProviders.id })
      .from(aiProviders)
      .where(
        and(
          eq(aiProviders.name, providerName),
          eq(aiProviders.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (byName) return byName.id;
  }
  return null;
}

export async function resolveModelId(
  tx: Tx,
  providerId: string | null,
  modelId: string | null | undefined,
  modelName: string | null | undefined,
) {
  if (!providerId) return null;
  if (modelId) {
    const [byId] = await tx
      .select({ id: aiModels.id })
      .from(aiModels)
      .where(and(eq(aiModels.id, modelId), eq(aiModels.providerId, providerId)))
      .limit(1);
    if (byId) return byId.id;
  }
  if (modelName) {
    const [byName] = await tx
      .select({ id: aiModels.id })
      .from(aiModels)
      .where(
        and(
          eq(aiModels.providerId, providerId),
          or(
            eq(aiModels.displayName, modelName),
            eq(aiModels.modelId, modelName),
          ),
        ),
      )
      .limit(1);
    if (byName) return byName.id;
  }
  return null;
}

export async function installMcpPreset(
  tx: Tx,
  input: {
    workspaceId: string;
    userId: string;
    manifest: McpPresetMarketplaceManifest;
    itemDescription?: string | null;
  },
) {
  const { preset } = input.manifest;
  const serverName =
    preset.scope === "tool" ? input.manifest.name : preset.serverName;

  const [installedServer] = await tx
    .insert(mcpServers)
    .values({
      workspaceId: input.workspaceId,
      createdById: input.userId,
      name: serverName,
      transport: preset.transport,
      command: preset.command ?? null,
      argsJson: preset.args ?? null,
      url: preset.url ?? null,
      enabled: preset.enabled ?? true,
      requireApproval: preset.requireApproval,
      encryptedHeadersJson: null,
      encryptedEnvJson: null,
      healthStatus: preset.requiresCredentials
        ? "unknown"
        : (preset.healthStatus ?? "healthy"),
    })
    .returning();

  if (preset.tools.length > 0) {
    await tx.insert(mcpTools).values(
      preset.tools.map((tool) => ({
        mcpServerId: installedServer.id,
        name: tool.name,
        description: tool.description ?? null,
        inputSchemaJson: tool.inputSchema ?? null,
        outputSchemaJson: tool.outputSchema ?? null,
        enabled: tool.enabled,
        requireApproval: tool.requireApproval,
      })),
    );
  }

  return {
    server: installedServer,
    requiresCredentials: preset.requiresCredentials,
  };
}

export async function installCustomTool(
  tx: Tx,
  input: {
    workspaceId: string;
    userId: string;
    manifest: ToolMarketplaceManifest;
    itemDescription?: string | null;
  },
) {
  const { tool } = input.manifest;
  const [installedTool] = await tx
    .insert(customTools)
    .values({
      workspaceId: input.workspaceId,
      createdById: input.userId,
      name: input.manifest.name,
      description: input.manifest.description ?? input.itemDescription,
      n8nWorkflowId: tool.n8nWorkflowId ?? null,
      n8nWorkflowUrl: tool.n8nWorkflowUrl ?? null,
      status: (tool.status ?? "active") as
        | "active"
        | "draft"
        | "failed"
        | "awaiting_secrets"
        | "workflow_created"
        | "disabled",
      inputSchemaJson: tool.inputSchema ?? null,
      outputSchemaJson: tool.outputSchema ?? null,
      metadataJson: tool.metadata ?? null,
    })
    .returning();

  return {
    tool: installedTool,
    requiresCredentials: Boolean(tool.requiresCredentials),
  };
}
