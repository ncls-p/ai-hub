import { and, eq, or } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
	agentKnowledgeBindings,
	agents,
	agentSkillBindings,
	agentSkills,
	agentToolBindings,
	agentVersions,
	aiModels,
	aiProviders,
	customToolCredentialRefs,
	customTools,
	knowledgeBases,
	mcpServers,
	mcpTools,
} from "@/server/infrastructure/db/schema";
import type {
	AgentMarketplaceManifest,
	MarketplaceManifest,
	McpPresetMarketplaceManifest,
	ToolMarketplaceManifest,
} from "./manifest-types";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function slugify(value: string) {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

async function resolveProviderId(
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
	return providerId ?? null;
}

async function resolveModelId(
	tx: Tx,
	providerId: string | null,
	modelId: string | null | undefined,
	modelName: string | null | undefined,
) {
	if (!providerId) return modelId ?? null;
	if (modelId) {
		const [byId] = await tx
			.select({ id: aiModels.id })
			.from(aiModels)
			.where(
				and(eq(aiModels.id, modelId), eq(aiModels.providerId, providerId)),
			)
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
	return modelId ?? null;
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
			encryptedHeadersJson: preset.encryptedHeadersJson ?? null,
			encryptedEnvJson: preset.encryptedEnvJson ?? null,
			healthStatus:
				preset.requiresCredentials && !preset.secretsIncluded
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
		requiresCredentials:
			preset.requiresCredentials && !preset.secretsIncluded,
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

	if (tool.encryptedCredentialRefs?.length) {
		for (const ref of tool.encryptedCredentialRefs) {
			await tx.insert(customToolCredentialRefs).values({
				workspaceId: input.workspaceId,
				userId: input.userId,
				provider: ref.provider,
				label: ref.label,
				n8nCredentialId: ref.n8nCredentialId ?? null,
				encryptedPayload: ref.encryptedPayload,
				metadataJson: ref.metadata ?? null,
			});
		}
	}

	return {
		tool: installedTool,
		requiresCredentials:
			Boolean(tool.requiresCredentials) && !tool.secretsIncluded,
	};
}

export async function installAgentManifest(
	tx: Tx,
	input: {
		workspaceId: string;
		userId: string;
		itemId: string;
		versionId: string;
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
					mcpRefToToolId.set(`${preset.preset.serverName}/${tool.name}`, row.id);
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
			slug: `${slugify(input.manifest.name)}-${Date.now().toString(36)}`,
			description: input.manifest.description ?? input.itemDescription,
			visibility: "workspace",
			sourceType: "marketplace_install",
			marketplaceItemId: input.itemId,
			marketplaceVersionId: input.versionId,
			createdById: input.userId,
		})
		.returning();

	const providerId = await resolveProviderId(
		tx,
		input.workspaceId,
		input.manifest.agent.providerId,
		input.manifest.agent.providerName,
	);
	const modelId = await resolveModelId(
		tx,
		providerId,
		input.manifest.agent.modelId,
		input.manifest.agent.modelName,
	);

	const [agentVersion] = await tx
		.insert(agentVersions)
		.values({
			agentId: installedAgent.id,
			versionNumber: 1,
			name: `Installed from marketplace ${input.versionLabel}`,
			systemPrompt: input.manifest.agent.systemPrompt ?? null,
			providerId,
			modelId,
			temperature: input.manifest.agent.temperature ?? null,
			topP: input.manifest.agent.topP ?? null,
			maxOutputTokens: input.manifest.agent.maxOutputTokens ?? 30_000,
			maxToolCalls: input.manifest.agent.maxToolCalls ?? 6,
			toolChoice: input.manifest.agent.toolChoice ?? null,
			generationSettingsJson: input.manifest.agent.generationSettings ?? null,
			responseFormatJson: input.manifest.agent.responseFormat ?? null,
			memoryPolicyJson: input.manifest.agent.memoryPolicy ?? null,
			guardrailsJson: input.manifest.agent.guardrails ?? null,
			approvalPolicyJson: input.manifest.agent.approvalPolicy ?? null,
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
		if (!skillId) {
			const [skill] = await tx
				.select({ id: agentSkills.id })
				.from(agentSkills)
				.where(
					and(
						eq(agentSkills.workspaceId, input.workspaceId),
						eq(agentSkills.name, binding.ref),
					),
				)
				.limit(1);
			skillId = skill?.id;
		}
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
				),
			)
			.limit(1);
		if (!kb) continue;
		await tx.insert(agentKnowledgeBindings).values({
			agentVersionId: agentVersion.id,
			knowledgeBaseId: kb.id,
		});
	}

	return installedAgent;
}

export function installPostInstallFlags(manifest: MarketplaceManifest) {
	if (manifest.type === "mcp_preset") {
		return {
			requiresCredentials:
				manifest.preset.requiresCredentials && !manifest.preset.secretsIncluded,
		};
	}
	if (manifest.type === "custom_tool") {
		return {
			requiresCredentials:
				Boolean(manifest.tool.requiresCredentials) &&
				!manifest.tool.secretsIncluded,
		};
	}
	return { requiresCredentials: false };
}
