import { and, eq, isNull, sql, max } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
	agents,
	agentVersions,
	aiModels,
	aiProviders,
	conversations,
	messages,
	messageParts,
	usageEvents,
} from "@/server/infrastructure/db/schema";
import { decryptValue } from "@/lib/crypto";
import type {
	ProviderRuntimeConfig,
	ProviderKind,
} from "@/server/infrastructure/providers";
import { audit } from "@/server/domain/services/audit";
import { logger } from "@/lib/logger";

// ─── Types ─────────────────────────────────────────────────────────────

export type AgentRow = typeof agents.$inferSelect;
export type AgentVersionRow = typeof agentVersions.$inferSelect;

export interface CreateAgentInput {
	workspaceId: string;
	userId: string;
	name: string;
	slug: string;
	description?: string;
	systemPrompt?: string;
	providerId?: string;
	modelId?: string;
	temperature?: string;
	topP?: string;
	maxOutputTokens?: number;
}

export interface UpdateAgentInput {
	agentId: string;
	workspaceId: string;
	userId: string;
	name?: string;
	slug?: string;
	description?: string;
	systemPrompt?: string;
	providerId?: string;
	modelId?: string;
	temperature?: string;
	topP?: string;
	maxOutputTokens?: number;
}

// ─── Agent CRUD ────────────────────────────────────────────────────────

export async function createAgent(input: CreateAgentInput) {
	const {
		workspaceId,
		userId,
		name,
		slug,
		description,
		systemPrompt,
		providerId,
		modelId,
		temperature,
		topP,
		maxOutputTokens,
	} = input;

	if (providerId) {
		const [provider] = await db
			.select({ id: aiProviders.id })
			.from(aiProviders)
			.where(
				and(
					eq(aiProviders.id, providerId),
					eq(aiProviders.workspaceId, workspaceId),
					isNull(aiProviders.archivedAt),
				),
			)
			.limit(1);
		if (!provider) throw new Error("Provider not found");
	}

	if (modelId) {
		if (!providerId) throw new Error("Model requires a provider");
		const [model] = await db
			.select({ id: aiModels.id })
			.from(aiModels)
			.where(
				and(
					eq(aiModels.id, modelId),
					eq(aiModels.providerId, providerId),
					eq(aiModels.enabled, true),
				),
			)
			.limit(1);
		if (!model) throw new Error("Model not found");
	}

	const { agent, version } = await db.transaction(async (tx) => {
		const [agent] = await tx
			.insert(agents)
			.values({
				workspaceId,
				name,
				slug,
				description: description || null,
				createdById: userId,
				visibility: "private",
				sourceType: "custom",
			})
			.returning();

		const [version] = await tx
			.insert(agentVersions)
			.values({
				agentId: agent.id,
				versionNumber: 1,
				name: "Initial version",
				systemPrompt: systemPrompt || null,
				providerId: providerId || null,
				modelId: modelId || null,
				temperature: temperature || null,
				topP: topP || null,
				maxOutputTokens: maxOutputTokens || null,
				createdById: userId,
			})
			.returning();

		await tx
			.update(agents)
			.set({ activeVersionId: version.id })
			.where(eq(agents.id, agent.id));

		return { agent, version };
	});

	await audit.emit({
		workspaceId,
		actorPrincipalType: "user",
		actorPrincipalId: userId,
		action: "agent.created",
		resourceType: "agent",
		resourceId: agent.id,
		outcome: "success",
		metadata: { name, slug },
	});

	logger.info("Agent created", { agentId: agent.id, userId });
	return { agent, version };
}

export async function getAgentById(
	agentId: string,
	workspaceId: string,
): Promise<typeof agents.$inferSelect | null> {
	const [agent] = await db
		.select()
		.from(agents)
		.where(
			and(
				eq(agents.id, agentId),
				eq(agents.workspaceId, workspaceId),
				isNull(agents.archivedAt),
			),
		)
		.limit(1);

	return agent || null;
}

export async function listAgents(workspaceId: string) {
	return db
		.select()
		.from(agents)
		.where(and(eq(agents.workspaceId, workspaceId), isNull(agents.archivedAt)))
		.orderBy(sql`${agents.updatedAt} DESC`);
}

async function getActiveVersionConfig(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	activeVersionId: string | null,
) {
	if (!activeVersionId) return null;
	const [v] = await tx
		.select()
		.from(agentVersions)
		.where(eq(agentVersions.id, activeVersionId))
		.limit(1);
	return v || null;
}

export async function updateAgent(input: UpdateAgentInput) {
	const {
		agentId,
		workspaceId,
		userId,
		name,
		slug,
		description,
		systemPrompt,
		providerId,
		modelId,
		temperature,
		topP,
		maxOutputTokens,
	} = input;

	const [existing] = await db
		.select()
		.from(agents)
		.where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
		.limit(1);

	if (!existing) {
		throw new Error("Agent not found");
	}

	const { agent, version } = await db.transaction(async (tx) => {
		const agentUpdates: Record<string, unknown> = { updatedAt: new Date() };
		if (name !== undefined) agentUpdates.name = name;
		if (slug !== undefined) agentUpdates.slug = slug;
		if (description !== undefined) agentUpdates.description = description;

		if (Object.keys(agentUpdates).length > 1) {
			await tx.update(agents).set(agentUpdates).where(eq(agents.id, agentId));
		}

		// Get active version config for inheritance
		const activeConfig = await getActiveVersionConfig(
			tx,
			existing.activeVersionId,
		);

		const nextProviderId =
			providerId !== undefined
				? providerId
				: (activeConfig?.providerId ?? null);
		const nextModelId =
			modelId !== undefined
				? modelId
				: providerId !== undefined
					? null
					: (activeConfig?.modelId ?? null);

		if (nextProviderId) {
			const [provider] = await tx
				.select({ id: aiProviders.id })
				.from(aiProviders)
				.where(
					and(
						eq(aiProviders.id, nextProviderId),
						eq(aiProviders.workspaceId, workspaceId),
						isNull(aiProviders.archivedAt),
					),
				)
				.limit(1);
			if (!provider) throw new Error("Provider not found");
		}

		if (nextModelId) {
			if (!nextProviderId) throw new Error("Model requires a provider");
			const [model] = await tx
				.select({ id: aiModels.id })
				.from(aiModels)
				.where(
					and(
						eq(aiModels.id, nextModelId),
						eq(aiModels.providerId, nextProviderId),
						eq(aiModels.enabled, true),
					),
				)
				.limit(1);
			if (!model) throw new Error("Model not found");
		}

		// Get next version number
		const [row] = await tx
			.select({ maxVersion: max(agentVersions.versionNumber) })
			.from(agentVersions)
			.where(eq(agentVersions.agentId, agentId));

		const nextVersion = (row?.maxVersion ?? 0) + 1;

		const [version] = await tx
			.insert(agentVersions)
			.values({
				agentId,
				versionNumber: nextVersion,
				name: `Version ${nextVersion}`,
				systemPrompt:
					systemPrompt !== undefined
						? systemPrompt
						: (activeConfig?.systemPrompt ?? null),
				providerId: nextProviderId,
				modelId: nextModelId,
				temperature:
					temperature !== undefined
						? temperature
						: (activeConfig?.temperature ?? null),
				topP: topP !== undefined ? topP : (activeConfig?.topP ?? null),
				maxOutputTokens:
					maxOutputTokens !== undefined
						? maxOutputTokens
						: (activeConfig?.maxOutputTokens ?? null),
				createdById: userId,
			})
			.returning();

		await tx
			.update(agents)
			.set({ activeVersionId: version.id })
			.where(eq(agents.id, agentId));

		const [updatedAgent] = await tx
			.select()
			.from(agents)
			.where(eq(agents.id, agentId))
			.limit(1);

		return { agent: updatedAgent, version };
	});

	await audit.emit({
		workspaceId,
		actorPrincipalType: "user",
		actorPrincipalId: userId,
		action: "agent.updated",
		resourceType: "agent",
		resourceId: agentId,
		outcome: "success",
		metadata: { versionNumber: version.versionNumber },
	});

	logger.info("Agent updated", {
		agentId,
		versionNumber: version.versionNumber,
		userId,
	});
	return { agent, version };
}

export async function archiveAgent(
	agentId: string,
	workspaceId: string,
	userId: string,
) {
	const [existing] = await db
		.select()
		.from(agents)
		.where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
		.limit(1);

	if (!existing) {
		throw new Error("Agent not found");
	}

	await db
		.update(agents)
		.set({ archivedAt: new Date(), updatedAt: new Date() })
		.where(eq(agents.id, agentId));

	await audit.emit({
		workspaceId,
		actorPrincipalType: "user",
		actorPrincipalId: userId,
		action: "agent.archived",
		resourceType: "agent",
		resourceId: agentId,
		outcome: "success",
	});

	logger.info("Agent archived", { agentId, userId });
}

// ─── Agent Versions ────────────────────────────────────────────────────

export async function getAgentVersionById(
	versionId: string,
): Promise<AgentVersionRow | null> {
	const [version] = await db
		.select()
		.from(agentVersions)
		.where(eq(agentVersions.id, versionId))
		.limit(1);

	return version || null;
}

export async function getAgentVersions(agentId: string) {
	return db
		.select()
		.from(agentVersions)
		.where(eq(agentVersions.agentId, agentId))
		.orderBy(sql`${agentVersions.versionNumber} DESC`);
}

export async function getActiveVersion(
	agentId: string,
): Promise<AgentVersionRow | null> {
	const [agent] = await db
		.select({ activeVersionId: agents.activeVersionId })
		.from(agents)
		.where(eq(agents.id, agentId))
		.limit(1);

	if (!agent?.activeVersionId) return null;

	return getAgentVersionById(agent.activeVersionId);
}

// ─── Provider Resolution for Chat ──────────────────────────────────────

export interface ResolvedProviderConfig {
	runtimeConfig: ProviderRuntimeConfig;
	modelId: string;
	modelRecordId?: string;
	providerKind: ProviderKind;
	providerId: string;
}

export async function resolveProviderForVersion(
	version: AgentVersionRow,
): Promise<ResolvedProviderConfig | null> {
	if (!version.providerId) return null;

	const [provider] = await db
		.select()
		.from(aiProviders)
		.where(
			and(
				eq(aiProviders.id, version.providerId),
				eq(aiProviders.enabled, true),
				isNull(aiProviders.archivedAt),
			),
		)
		.limit(1);

	if (!provider) return null;

	// Decrypt secrets
	let apiKey: string | undefined;
	if (provider.encryptedApiKey) {
		apiKey = await decryptValue(provider.encryptedApiKey);
	}

	let headers: Record<string, string> | undefined;
	if (provider.encryptedHeadersJson) {
		headers = {};
		for (const [k, v] of Object.entries(
			provider.encryptedHeadersJson as Record<string, string>,
		)) {
			headers[k] = await decryptValue(v);
		}
	}

	let runtimeModelId = "";
	let modelRecordId: string | undefined;
	if (version.modelId) {
		const [model] = await db
			.select()
			.from(aiModels)
			.where(
				and(
					eq(aiModels.id, version.modelId),
					eq(aiModels.providerId, provider.id),
					eq(aiModels.enabled, true),
				),
			)
			.limit(1);

		if (model) {
			runtimeModelId = model.modelId;
			modelRecordId = model.id;
		}
	}

	return {
		runtimeConfig: {
			kind: provider.kind as ProviderKind,
			name: provider.name,
			baseUrl: provider.baseUrl || undefined,
			authType: provider.authType,
			apiKey,
			headers,
			queryParams: provider.queryParamsJson as
				| Record<string, string>
				| undefined,
		},
		modelId: runtimeModelId,
		modelRecordId,
		providerKind: provider.kind as ProviderKind,
		providerId: provider.id,
	};
}

// ─── Conversations ─────────────────────────────────────────────────────

export async function getConversationsByAgent(agentId: string, userId: string) {
	return db
		.select()
		.from(conversations)
		.where(
			and(
				eq(conversations.agentId, agentId),
				eq(conversations.userId, userId),
				eq(conversations.status, "active"),
				isNull(conversations.archivedAt),
			),
		)
		.orderBy(sql`${conversations.updatedAt} DESC`);
}

export async function getConversationMessages(conversationId: string) {
	const messageRows = await db
		.select()
		.from(messages)
		.where(eq(messages.conversationId, conversationId))
		.orderBy(messages.createdAt);

	const enriched: Array<{
		id: string;
		role: string;
		status: string;
		parts: Array<{ type: string; content: string }>;
		createdAt: Date;
	}> = [];

	for (const msg of messageRows) {
		const parts = await db
			.select()
			.from(messageParts)
			.where(eq(messageParts.messageId, msg.id))
			.orderBy(messageParts.sortOrder);

		const decryptedParts: Array<{ type: string; content: string }> = [];
		for (const part of parts) {
			if (part.type === "text" && part.contentEncrypted) {
				try {
					const content = await decryptValue(part.contentEncrypted);
					decryptedParts.push({ type: part.type, content });
				} catch {
					decryptedParts.push({
						type: part.type,
						content: "[decryption failed]",
					});
				}
			} else {
				decryptedParts.push({
					type: part.type,
					content: part.contentEncrypted || "",
				});
			}
		}

		enriched.push({
			id: msg.id,
			role: msg.role,
			status: msg.status,
			parts: decryptedParts,
			createdAt: msg.createdAt,
		});
	}

	return enriched;
}

// ─── Usage Tracking ────────────────────────────────────────────────────

export async function recordUsageEvent(input: {
	workspaceId: string;
	userId: string;
	providerId?: string;
	modelId?: string;
	agentId?: string;
	conversationId?: string;
	operation: string;
	inputTokens?: number;
	outputTokens?: number;
	costUsd?: string;
	latencyMs?: number;
	status?: string;
}) {
	await db.insert(usageEvents).values({
		workspaceId: input.workspaceId,
		userId: input.userId,
		providerId: input.providerId || null,
		modelId: input.modelId || null,
		agentId: input.agentId || null,
		conversationId: input.conversationId || null,
		operation: input.operation,
		inputTokens: input.inputTokens || null,
		outputTokens: input.outputTokens || null,
		costUsd: input.costUsd || null,
		latencyMs: input.latencyMs || null,
		status: input.status || null,
	});
}
