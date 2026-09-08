import { resolveInstalledAgentModel } from "./install-agent-model";
import { hasResourcePermissionForRequest } from "@/modules/auth/workspace-access";
import {
  agentKnowledgeBindings,
  agents,
  agentSkillBindings,
  agentSkills,
  agentToolBindings,
  agentVersions,
  customTools,
  knowledgeBases,
  mcpServers,
  mcpTools,
} from "@/server/infrastructure/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { installAgentSpecialists } from "./install-helpers.install-agent-specialists";
import {
  installCustomTool,
  installMcpPreset,
  slugify,
  Tx,
} from "./install-helpers.tx";
import type { AgentMarketplaceManifest } from "./manifest-types";

export async function installAgentManifest(
  tx: Tx,
  input: {
    workspaceId: string;
    userId: string;
    itemId?: string;
    versionId?: string;
    versionLabel: string;
    manifest: AgentMarketplaceManifest;
    itemDescription?: string | null;
  },
) {
  const mcpRefToToolId = new Map<string, string>();
  const customRefToId = new Map<string, string>();
  const skillRefToId = new Map<string, string>();

  if (input.manifest.bundledResources) {
    for (const bundled of input.manifest.bundledResources.skills) {
      const [skill] = await tx
        .insert(agentSkills)
        .values({
          workspaceId: input.workspaceId,
          createdById: input.userId,
          name: bundled.name,
          description: null,
          markdownFilesJson: bundled.skill.markdownFiles,
          sourcePackage: bundled.skill.sourcePackage ?? null,
          sourceSkillName: bundled.skill.sourceSkillName ?? null,
          installCommand: bundled.skill.installCommand ?? null,
          metadataJson: bundled.skill.metadata ?? null,
        })
        .returning();
      skillRefToId.set(bundled.name, skill.id);
    }
    for (const preset of input.manifest.bundledResources.mcpPresets) {
      const { server } = await installMcpPreset(tx, {
        workspaceId: input.workspaceId,
        userId: input.userId,
        manifest: preset,
      });
      for (const tool of preset.preset.tools) {
        const [row] = await tx
          .select({ id: mcpTools.id })
          .from(mcpTools)
          .where(
            and(
              eq(mcpTools.mcpServerId, server.id),
              eq(mcpTools.name, tool.name),
            ),
          )
          .limit(1);
        if (row) {
          mcpRefToToolId.set(
            `${preset.preset.serverName}/${tool.name}`,
            row.id,
          );
        }
      }
    }
    for (const toolManifest of input.manifest.bundledResources.customTools) {
      const { tool } = await installCustomTool(tx, {
        workspaceId: input.workspaceId,
        userId: input.userId,
        manifest: toolManifest,
      });
      customRefToId.set(toolManifest.name, tool.id);
    }
  }

  const [installedAgent] = await tx
    .insert(agents)
    .values({
      workspaceId: input.workspaceId,
      name: input.manifest.name,
      slug: `${slugify(input.manifest.name)}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
      description: input.manifest.description ?? input.itemDescription,
      visibility: input.itemId ? "workspace" : "private",
      sourceType: input.itemId ? "marketplace_install" : "custom",
      marketplaceItemId: input.itemId,
      marketplaceVersionId: input.versionId,
      createdById: input.userId,
      kind: input.manifest.kind ?? "assistant",
    })
    .returning();

  const { providerId, modelId } = await resolveInstalledAgentModel(tx, input);

  const [agentVersion] = await tx
    .insert(agentVersions)
    .values({
      agentId: installedAgent.id,
      versionNumber: 1,
      name: input.itemId
        ? `Installed from marketplace ${input.versionLabel}`
        : "Imported from JSON",
      systemPrompt: input.manifest.agent.systemPrompt ?? null,
      providerId,
      modelId,
      temperature: input.manifest.agent.temperature ?? null,
      topP: input.manifest.agent.topP ?? null,
      maxOutputTokens: input.manifest.agent.maxOutputTokens ?? 0,
      maxToolCalls: input.manifest.agent.maxToolCalls ?? 20,
      toolChoice: input.manifest.agent.toolChoice ?? null,
      generationSettingsJson: input.manifest.agent.generationSettings ?? null,
      responseFormatJson: input.manifest.agent.responseFormat ?? null,
      memoryPolicyJson: input.manifest.agent.memoryPolicy ?? null,
      guardrailsJson: input.manifest.agent.guardrails ?? null,
      approvalPolicyJson: input.manifest.agent.approvalPolicy ?? null,
      orchestrationPolicyJson: input.manifest.agent.orchestrationPolicy ?? null,
      createdById: input.userId,
    })
    .returning();

  await tx
    .update(agents)
    .set({ activeVersionId: agentVersion.id })
    .where(eq(agents.id, installedAgent.id));

  for (const binding of input.manifest.toolBindings ?? []) {
    let toolId: string | null = null;
    if (binding.source === "builtin") {
      toolId = binding.ref;
    } else if (binding.source === "mcp") {
      toolId = mcpRefToToolId.get(binding.ref) ?? null;
      if (!toolId) {
        const [serverName, toolName] = binding.ref.split("/");
        const [server] = await tx
          .select({ id: mcpServers.id })
          .from(mcpServers)
          .where(
            and(
              eq(mcpServers.workspaceId, input.workspaceId),
              eq(mcpServers.name, serverName),
              isNull(mcpServers.archivedAt),
              or(
                eq(mcpServers.createdById, input.userId),
                eq(mcpServers.isGlobal, true),
              ),
            ),
          )
          .limit(1);
        if (server) {
          const [tool] = await tx
            .select({ id: mcpTools.id })
            .from(mcpTools)
            .where(
              and(
                eq(mcpTools.mcpServerId, server.id),
                eq(mcpTools.name, toolName),
              ),
            )
            .limit(1);
          toolId = tool?.id ?? null;
        }
      }
    } else if (binding.source === "custom") {
      toolId = customRefToId.get(binding.ref) ?? null;
      if (!toolId) {
        const [tool] = await tx
          .select({ id: customTools.id })
          .from(customTools)
          .where(
            and(
              eq(customTools.workspaceId, input.workspaceId),
              eq(customTools.name, binding.ref),
              isNull(customTools.archivedAt),
              or(
                eq(customTools.createdById, input.userId),
                eq(customTools.isGlobal, true),
              ),
            ),
          )
          .limit(1);
        toolId = tool?.id ?? null;
      }
    }
    if (!toolId) continue;
    await tx.insert(agentToolBindings).values({
      agentVersionId: agentVersion.id,
      toolSource: binding.source,
      toolId,
      requireApproval: binding.requireApproval,
      riskLevel: binding.riskLevel ?? null,
    });
  }

  for (const binding of input.manifest.skillBindings ?? []) {
    let skillId = skillRefToId.get(binding.ref);
    if (!skillId && binding.bundled) {
      const [skill] = await tx
        .insert(agentSkills)
        .values({
          workspaceId: input.workspaceId,
          createdById: input.userId,
          name: binding.ref,
          markdownFilesJson: binding.bundled.markdownFiles,
          sourcePackage: binding.bundled.sourcePackage ?? null,
          sourceSkillName: binding.bundled.sourceSkillName ?? null,
          installCommand: binding.bundled.installCommand ?? null,
          metadataJson: binding.bundled.metadata ?? null,
        })
        .returning();
      skillId = skill.id;
    }
    if (!skillId) {
      const [skill] = await tx
        .select({ id: agentSkills.id })
        .from(agentSkills)
        .where(
          and(
            eq(agentSkills.workspaceId, input.workspaceId),
            eq(agentSkills.name, binding.ref),
            isNull(agentSkills.archivedAt),
            or(
              eq(agentSkills.createdById, input.userId),
              eq(agentSkills.isGlobal, true),
            ),
          ),
        )
        .limit(1);
      skillId = skill?.id;
    }
    if (!skillId) continue;
    await tx.insert(agentSkillBindings).values({
      agentVersionId: agentVersion.id,
      skillId,
    });
  }

  for (const kbBinding of input.manifest.knowledgeBindings ?? []) {
    const [kb] = await tx
      .select({ id: knowledgeBases.id })
      .from(knowledgeBases)
      .where(
        and(
          eq(knowledgeBases.workspaceId, input.workspaceId),
          eq(knowledgeBases.name, kbBinding.name),
          isNull(knowledgeBases.archivedAt),
          or(
            eq(knowledgeBases.createdById, input.userId),
            eq(knowledgeBases.isGlobal, true),
          ),
        ),
      )
      .limit(1);
    if (
      !kb ||
      !(await hasResourcePermissionForRequest(
        input.userId,
        input.workspaceId,
        "knowledgeBases.viewAllowed",
        "knowledge_base",
        kb.id,
      ))
    )
      continue;
    await tx.insert(agentKnowledgeBindings).values({
      agentVersionId: agentVersion.id,
      knowledgeBaseId: kb.id,
    });
  }
  await installAgentSpecialists({
    tx,
    agentVersionId: agentVersion.id,
    specialists: input.manifest.specialists ?? [],
    install: (manifest) =>
      installAgentManifest(tx, {
        ...input,
        manifest,
        itemDescription: manifest.description,
      }),
  });

  return installedAgent;
}
