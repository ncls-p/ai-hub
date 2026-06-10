import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import { BUILTIN_TOOL_SUMMARIES } from "@/modules/tool/builtin-tools-catalog";
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
	customToolSecretRequests,
	customTools,
	knowledgeBases,
	mcpServers,
	mcpTools,
} from "@/server/infrastructure/db/schema";
import type {
	AgentMarketplaceManifest,
	CredentialFieldSchema,
	McpPresetMarketplaceManifest,
	PortableKnowledgeBinding,
	PortableSkillBinding,
	PortableToolBinding,
	SkillContentManifest,
	SkillMarketplaceManifest,
	ToolMarketplaceManifest,
} from "./manifest-types";
import { skillFileStats } from "./manifest-types";

function jsonRecord(
	value: unknown,
): Record<string, unknown> | null | undefined {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return null;
}

function parseCredentialFields(
	fieldsJson: unknown,
): CredentialFieldSchema[] {
	if (!Array.isArray(fieldsJson)) return [];
	return fieldsJson
		.filter((f) => f && typeof f === "object")
		.map((f) => {
			const field = f as Record<string, unknown>;
			return {
				key: String(field.key ?? field.name ?? ""),
				label: String(field.label ?? field.key ?? field.name ?? ""),
				type: field.type ? String(field.type) : undefined,
				required: Boolean(field.required),
				description:
					typeof field.description === "string" ? field.description : null,
			};
		})
		.filter((f) => f.key.length > 0);
}

function mcpCredentialSchema(
	server: typeof mcpServers.$inferSelect,
): CredentialFieldSchema[] {
	const fields: CredentialFieldSchema[] = [];
	const headers = server.encryptedHeadersJson;
	const env = server.encryptedEnvJson;
	if (headers && typeof headers === "object" && !Array.isArray(headers)) {
		for (const key of Object.keys(headers as Record<string, unknown>)) {
			fields.push({ key: `header:${key}`, label: `Header: ${key}`, required: true });
		}
	}
	if (env && typeof env === "object" && !Array.isArray(env)) {
		for (const key of Object.keys(env as Record<string, unknown>)) {
			fields.push({ key: `env:${key}`, label: `Env: ${key}`, required: true });
		}
	}
	return fields;
}

export function buildSkillContentManifest(
	skill: typeof agentSkills.$inferSelect,
): SkillContentManifest {
	const markdownFiles = Array.isArray(skill.markdownFilesJson)
		? (skill.markdownFilesJson as Array<{ path: string; content: string }>)
		: [];
	const stats = skillFileStats(markdownFiles);
	return {
		markdownFiles,
		sourcePackage: skill.sourcePackage ?? undefined,
		sourceSkillName: skill.sourceSkillName ?? undefined,
		installCommand: skill.installCommand ?? undefined,
		metadata: jsonRecord(skill.metadataJson) ?? undefined,
		fileCount: stats.fileCount,
		totalBytes: stats.totalBytes,
	};
}

export function buildSkillManifest(
	skill: typeof agentSkills.$inferSelect,
	name: string,
	description?: string | null,
): SkillMarketplaceManifest {
	return {
		type: "skill",
		name,
		description: description ?? skill.description ?? undefined,
		skill: buildSkillContentManifest(skill),
	};
}

export async function buildCustomToolManifest(
	tool: typeof customTools.$inferSelect,
	name: string,
	description?: string | null,
	includeSecrets = false,
): Promise<ToolMarketplaceManifest> {
	const secretRequests = await db
		.select()
		.from(customToolSecretRequests)
		.where(eq(customToolSecretRequests.customToolId, tool.id));

	const credentialSchema = secretRequests.flatMap((req) =>
		parseCredentialFields(req.fieldsJson),
	);

	let encryptedCredentialRefs:
		| ToolMarketplaceManifest["tool"]["encryptedCredentialRefs"]
		| undefined;
	if (includeSecrets) {
		const refs = await db
			.select()
			.from(customToolCredentialRefs)
			.where(
				and(
					eq(customToolCredentialRefs.workspaceId, tool.workspaceId),
					eq(customToolCredentialRefs.userId, tool.createdById),
				),
			);
		if (refs.length > 0) {
			encryptedCredentialRefs = refs.map((ref) => ({
				provider: ref.provider,
				label: ref.label,
				n8nCredentialId: ref.n8nCredentialId,
				encryptedPayload: ref.encryptedPayload,
				metadata: jsonRecord(ref.metadataJson),
			}));
		}
	}

	return {
		type: "custom_tool",
		name,
		description: description ?? tool.description ?? undefined,
		tool: {
			status: tool.status,
			inputSchema: jsonRecord(tool.inputSchemaJson) ?? undefined,
			outputSchema: jsonRecord(tool.outputSchemaJson) ?? undefined,
			n8nWorkflowId: tool.n8nWorkflowId ?? undefined,
			n8nWorkflowUrl: tool.n8nWorkflowUrl ?? undefined,
			metadata: jsonRecord(tool.metadataJson) ?? undefined,
			credentialSchema:
				credentialSchema.length > 0 ? credentialSchema : undefined,
			encryptedCredentialRefs,
			requiresCredentials: credentialSchema.length > 0,
			secretsIncluded: includeSecrets && Boolean(encryptedCredentialRefs?.length),
		},
	};
}

export function buildMcpPresetManifest(
	name: string,
	description: string | null | undefined,
	server: typeof mcpServers.$inferSelect,
	tools: Array<typeof mcpTools.$inferSelect>,
	scope: "server" | "tool",
	includeSecrets = false,
): McpPresetMarketplaceManifest {
	const args = Array.isArray(server.argsJson)
		? (server.argsJson as string[])
		: undefined;
	const credentialSchema = mcpCredentialSchema(server);
	const hasCredentials = credentialSchema.length > 0;

	return {
		type: "mcp_preset",
		name,
		description: description ?? undefined,
		preset: {
			scope,
			serverName: server.name,
			transport: server.transport,
			command: server.command ?? undefined,
			args,
			url: server.url ?? undefined,
			enabled: server.enabled,
			requireApproval: server.requireApproval,
			healthStatus: server.healthStatus ?? undefined,
			requiresCredentials: hasCredentials,
			secretsIncluded: includeSecrets && hasCredentials,
			credentialSchema: hasCredentials ? credentialSchema : undefined,
			encryptedHeadersJson:
				includeSecrets && server.encryptedHeadersJson
					? server.encryptedHeadersJson
					: undefined,
			encryptedEnvJson:
				includeSecrets && server.encryptedEnvJson
					? server.encryptedEnvJson
					: undefined,
			tools: tools.map((tool) => ({
				name: tool.name,
				description: tool.description,
				inputSchema: jsonRecord(tool.inputSchemaJson),
				outputSchema: jsonRecord(tool.outputSchemaJson),
				requireApproval: tool.requireApproval,
				enabled: tool.enabled,
			})),
		},
	};
}

async function resolveAgentVersion(agentId: string) {
	const [agent] = await db
		.select()
		.from(agents)
		.where(eq(agents.id, agentId))
		.limit(1);
	if (!agent) return null;

	const versionQuery = agent.activeVersionId
		? db
				.select()
				.from(agentVersions)
				.where(eq(agentVersions.id, agent.activeVersionId))
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

async function resolveToolBindingRef(
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

export async function buildAgentManifest(
	agentId: string,
	workspaceId: string,
	name: string,
	description?: string | null,
	includeSecrets = false,
): Promise<AgentMarketplaceManifest> {
	const resolved = await resolveAgentVersion(agentId);
	if (!resolved) throw new Error("Agent not found");
	const { agent, agentVersion, providerName, modelName } = resolved;
	if (!agentVersion) throw new Error("Agent has no version");

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
		if (portable) portableToolBindings.push(portable);
	}

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
					includeSecrets,
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
			seenCustomTools.add(tool.id);
			bundledCustomTools.push(
				await buildCustomToolManifest(tool, tool.name, tool.description, includeSecrets),
			);
		}
	}

	return {
		type: "agent",
		name,
		description: description ?? agent.description ?? undefined,
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
		},
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
