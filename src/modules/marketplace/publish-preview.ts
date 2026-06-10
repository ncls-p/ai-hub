import { and, eq } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
	agentSkills,
	agents,
	customTools,
	marketplaceItems,
	marketplaceItemVersions,
	mcpServers,
	mcpTools,
} from "@/server/infrastructure/db/schema";
import { findExistingDraft } from "./draft-helpers";
import {
	buildAgentManifest,
	buildCustomToolManifest,
	buildMcpPresetManifest,
	buildSkillManifest,
} from "./manifest-builders";
import type { MarketplaceManifest, SourceResourceType } from "./manifest-types";

export interface PublishPreviewResult {
	name: string;
	description: string | null;
	tags: string[];
	suggestedVersion: string;
	manifestPreview: Record<string, unknown>;
	credentialFields: Array<{
		key: string;
		label: string;
		required?: boolean;
		description?: string | null;
	}>;
	hasExistingDraft: boolean;
	existingItemId: string | null;
	resourceType: SourceResourceType | "marketplace_item";
	canIncludeSecrets: boolean;
}

function manifestSummary(manifest: MarketplaceManifest): Record<string, unknown> {
	switch (manifest.type) {
		case "agent":
			return {
				type: "agent",
				model: manifest.agent.modelName ?? manifest.agent.modelId,
				provider: manifest.agent.providerName ?? manifest.agent.providerId,
				toolBindings: manifest.toolBindings?.length ?? 0,
				skillBindings: manifest.skillBindings?.length ?? 0,
				knowledgeBindings: manifest.knowledgeBindings?.length ?? 0,
				bundledSkills: manifest.bundledResources?.skills.length ?? 0,
				bundledMcp: manifest.bundledResources?.mcpPresets.length ?? 0,
				bundledCustomTools: manifest.bundledResources?.customTools.length ?? 0,
				hasSystemPrompt: Boolean(manifest.agent.systemPrompt),
			};
		case "skill":
			return {
				type: "skill",
				fileCount: manifest.skill.fileCount ?? manifest.skill.markdownFiles.length,
				totalBytes: manifest.skill.totalBytes,
				sourcePackage: manifest.skill.sourcePackage,
			};
		case "custom_tool":
			return {
				type: "custom_tool",
				status: manifest.tool.status,
				hasInputSchema: Boolean(manifest.tool.inputSchema),
				hasOutputSchema: Boolean(manifest.tool.outputSchema),
				n8nWorkflow: Boolean(manifest.tool.n8nWorkflowId),
				requiresCredentials: manifest.tool.requiresCredentials,
			};
		case "mcp_preset":
			return {
				type: "mcp_preset",
				scope: manifest.preset.scope,
				transport: manifest.preset.transport,
				toolCount: manifest.preset.tools.length,
				enabled: manifest.preset.enabled,
				requiresCredentials: manifest.preset.requiresCredentials,
			};
	}
}

function extractCredentialFields(
	manifest: MarketplaceManifest,
): PublishPreviewResult["credentialFields"] {
	if (manifest.type === "custom_tool") {
		return (manifest.tool.credentialSchema ?? []).map((f) => ({
			key: f.key,
			label: f.label,
			required: f.required,
			description: f.description,
		}));
	}
	if (manifest.type === "mcp_preset") {
		return (manifest.preset.credentialSchema ?? []).map((f) => ({
			key: f.key,
			label: f.label,
			required: f.required,
			description: f.description,
		}));
	}
	if (manifest.type === "agent") {
		const fields: PublishPreviewResult["credentialFields"] = [];
		for (const preset of manifest.bundledResources?.mcpPresets ?? []) {
			for (const f of preset.preset.credentialSchema ?? []) {
				fields.push({
					key: `${preset.preset.serverName}:${f.key}`,
					label: `${preset.preset.serverName} — ${f.label}`,
					required: f.required,
					description: f.description,
				});
			}
		}
		for (const tool of manifest.bundledResources?.customTools ?? []) {
			for (const f of tool.tool.credentialSchema ?? []) {
				fields.push({
					key: `${tool.name}:${f.key}`,
					label: `${tool.name} — ${f.label}`,
					required: f.required,
					description: f.description,
				});
			}
		}
		return fields;
	}
	return [];
}

export async function getPublishPreview(input: {
	workspaceId: string;
	userId: string;
	agentId?: string;
	skillId?: string;
	customToolId?: string;
	mcpServerId?: string;
	mcpToolId?: string;
	itemId?: string;
	includeSecrets?: boolean;
}): Promise<PublishPreviewResult> {
	if (input.itemId) {
		const [item] = await db
			.select()
			.from(marketplaceItems)
			.where(eq(marketplaceItems.id, input.itemId))
			.limit(1);
		if (!item) throw new Error("Marketplace item not found");
		const [versionRow] = item.latestVersionId
			? await db
					.select()
					.from(marketplaceItemVersions)
					.where(eq(marketplaceItemVersions.id, item.latestVersionId))
					.limit(1)
			: [null];

		const manifest = (versionRow?.manifestJson ??
			{}) as MarketplaceManifest;
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
			canIncludeSecrets: extractCredentialFields(manifest).length > 0,
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
		if (!agent) throw new Error("Agent not found");
		manifest = await buildAgentManifest(
			input.agentId,
			input.workspaceId,
			agent.name,
			agent.description,
			input.includeSecrets,
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
		if (!skill) throw new Error("Skill not found");
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
		if (!tool) throw new Error("Custom tool not found");
		manifest = await buildCustomToolManifest(
			tool,
			tool.name,
			tool.description,
			input.includeSecrets,
		);
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
		if (!server) throw new Error("MCP server not found");
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
			input.includeSecrets,
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
		if (!server) throw new Error("MCP server not found");
		manifest = buildMcpPresetManifest(
			`${server.name} — ${tool.name}`,
			tool.description,
			server,
			[tool],
			"tool",
			input.includeSecrets,
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
		canIncludeSecrets: extractCredentialFields(manifest).length > 0,
	};
}
