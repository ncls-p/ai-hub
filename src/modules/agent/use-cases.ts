import { and, eq, inArray, isNull, sql, max, or } from "drizzle-orm";
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
	users,
} from "@/server/infrastructure/db/schema";
import { decryptValue } from "@/lib/crypto";
import type {
	ProviderRuntimeConfig,
	ProviderKind,
} from "@/server/infrastructure/providers";
import { audit } from "@/server/domain/services/audit";
import { logger } from "@/lib/logger";
import {
	cloneKnowledgeBindings,
	replaceKnowledgeBindingsForVersion,
} from "@/modules/knowledge/use-cases";
import {
	cloneSkillBindings,
	replaceSkillBindingsForVersion,
} from "@/modules/skills/use-cases";
import {
	cloneToolBindings,
	insertToolBindingsForVersion,
	type ToolBindingInput,
} from "@/modules/tool/use-cases";

// ─── Types ─────────────────────────────────────────────────────────────

export type AgentRow = typeof agents.$inferSelect;
export type AgentVersionRow = typeof agentVersions.$inferSelect;
export type AgentSharingMode = "personal" | "marketplace" | "specific_user";
export type AgentCurationLabel =
	| "recommended"
	| "organization_created"
	| "none";

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
	maxToolCalls?: number;
	toolBindings?: ToolBindingInput[];
	knowledgeBindings?: string[];
	skillBindings?: string[];
	sharingMode?: AgentSharingMode;
	shareTargetEmail?: string;
	isGlobal?: boolean;
	isRecommended?: boolean;
	curationLabel?: AgentCurationLabel;
	canAdminCurate?: boolean;
}

export interface CloneAgentInput {
	agentId: string;
	workspaceId: string;
	userId: string;
	canAdminCurate?: boolean;
	name?: string;
	slug?: string;
}

export type AgentToolChoice = "auto" | "required" | "none";
export type AgentResponseFormat = "text" | "json_object";

export interface AgentGenerationSettings {
	topK?: number;
	presencePenalty?: number;
	frequencyPenalty?: number;
	seed?: number;
	maxRetries?: number;
	stopSequences?: string[];
}

export interface AgentMemoryPolicy {
	enabled?: boolean;
	maxMessages?: number;
}

export interface AgentGuardrails {
	enabled?: boolean;
	blockedTopics?: string[];
}

export interface AgentApprovalPolicy {
	requireApprovalForAllTools?: boolean;
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
	maxToolCalls?: number;
	toolChoice?: AgentToolChoice;
	generationSettings?: AgentGenerationSettings;
	responseFormat?: AgentResponseFormat;
	memoryPolicy?: AgentMemoryPolicy;
	guardrails?: AgentGuardrails;
	approvalPolicy?: AgentApprovalPolicy;
	toolBindings?: ToolBindingInput[];
	knowledgeBindings?: string[];
	skillBindings?: string[];
	sharingMode?: AgentSharingMode;
	shareTargetEmail?: string | null;
	isGlobal?: boolean;
	isRecommended?: boolean;
	curationLabel?: AgentCurationLabel;
	canAdminCurate?: boolean;
}

async function resolveShareTargetUserId(
	email: string | null | undefined,
): Promise<string | null> {
	if (!email) return null;

	const [target] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, email.trim().toLowerCase()))
		.limit(1);

	if (!target) throw new Error("Share target user not found");
	return target.id;
}

async function requireShareTargetUserId(email: string | null | undefined) {
	if (!email?.trim()) throw new Error("Share target user is required");
	return await resolveShareTargetUserId(email);
}

function normalizeCurationLabel(
	label: AgentCurationLabel | undefined,
	isRecommended?: boolean,
) {
	if (label === "none") return null;
	if (label === "organization_created") return label;
	if (isRecommended || label === "recommended") return "recommended";
	return null;
}

function slugifyAgentName(value: string) {
	return (
		value
			.toLowerCase()
			.trim()
			.normalize("NFKD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 96) || "assistant"
	);
}

async function agentSlugExists(workspaceId: string, slug: string) {
	const [existing] = await db
		.select({ id: agents.id })
		.from(agents)
		.where(and(eq(agents.workspaceId, workspaceId), eq(agents.slug, slug)))
		.limit(1);
	return Boolean(existing);
}

async function createAvailableAgentSlug(
	workspaceId: string,
	preferredNameOrSlug: string,
) {
	const base = slugifyAgentName(preferredNameOrSlug).slice(0, 96);
	for (let attempt = 0; attempt < 50; attempt += 1) {
		const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
		const slug = `${base}${suffix}`.slice(0, 128);
		if (!(await agentSlugExists(workspaceId, slug))) return slug;
	}
	return `${base.slice(0, 88)}-${Date.now().toString(36)}`;
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
		maxToolCalls,
		toolBindings,
		knowledgeBindings,
		skillBindings,
		sharingMode = "personal",
		shareTargetEmail,
		isGlobal,
		isRecommended,
		curationLabel,
		canAdminCurate,
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

	const shareTargetUserId =
		sharingMode === "specific_user"
			? await requireShareTargetUserId(shareTargetEmail)
			: null;

	const curated = canAdminCurate
		? {
				isGlobal: Boolean(isGlobal),
				isRecommended: Boolean(isRecommended),
				curationLabel: normalizeCurationLabel(curationLabel, isRecommended),
			}
		: {
				isGlobal: false,
				isRecommended: false,
				curationLabel: null,
			};

	const { agent, version } = await db.transaction(async (tx) => {
		const [agent] = await tx
			.insert(agents)
			.values({
				workspaceId,
				name,
				slug,
				description: description || null,
				createdById: userId,
				visibility: sharingMode === "marketplace" ? "public" : "private",
				sourceType: "custom",
				sharingMode,
				shareTargetUserId,
				...curated,
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
				maxOutputTokens: maxOutputTokens ?? 30_000,
				maxToolCalls: maxToolCalls ?? 6,
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
		metadata: { name, slug, sharingMode },
	});

	await insertToolBindingsForVersion(version.id, toolBindings ?? []);
	await replaceKnowledgeBindingsForVersion(version.id, knowledgeBindings ?? []);
	await replaceSkillBindingsForVersion(
		version.id,
		workspaceId,
		skillBindings ?? [],
	);

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

export async function getVisibleAgentById(
	agentId: string,
	workspaceId: string,
	userId: string,
	canAdminCurate: boolean,
) {
	const agent = await getAgentById(agentId, workspaceId);
	if (!agent) return null;
	if (canAdminCurate || canUseAgent(agent, userId)) return agent;
	return null;
}

export function listAgents(
	workspaceId: string,
	userId: string,
	canAdminCurate: boolean,
) {
	const visibilityFilter = canAdminCurate
		? undefined
		: or(
				eq(agents.createdById, userId),
				eq(agents.isGlobal, true),
				eq(agents.sharingMode, "marketplace"),
				and(
					eq(agents.sharingMode, "specific_user"),
					eq(agents.shareTargetUserId, userId),
				),
			);

	return db
		.select()
		.from(agents)
		.where(
			and(
				eq(agents.workspaceId, workspaceId),
				isNull(agents.archivedAt),
				visibilityFilter,
			),
		)
		.orderBy(
			sql`${agents.isGlobal} DESC`,
			sql`${agents.isRecommended} DESC`,
			sql`${agents.updatedAt} DESC`,
		);
}

export function canUseAgent(agent: AgentRow, userId: string) {
	return (
		agent.createdById === userId ||
		agent.isGlobal ||
		agent.sharingMode === "marketplace" ||
		(agent.sharingMode === "specific_user" &&
			agent.shareTargetUserId === userId)
	);
}

export function canEditAgent(
	agent: AgentRow,
	userId: string,
	canAdminCurate = false,
) {
	return canAdminCurate || agent.createdById === userId;
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

export async function cloneAgent(input: CloneAgentInput) {
	const source = await getVisibleAgentById(
		input.agentId,
		input.workspaceId,
		input.userId,
		Boolean(input.canAdminCurate),
	);
	if (!source) throw new Error("Agent not found");

	const name = input.name?.trim() || `Copy of ${source.name}`;
	const slug = input.slug?.trim()
		? await createAvailableAgentSlug(input.workspaceId, input.slug)
		: await createAvailableAgentSlug(input.workspaceId, name);

	const { agent, version } = await db.transaction(async (tx) => {
		const sourceVersion = await getActiveVersionConfig(
			tx,
			source.activeVersionId,
		);
		const [agent] = await tx
			.insert(agents)
			.values({
				workspaceId: input.workspaceId,
				name,
				slug,
				description: source.description,
				createdById: input.userId,
				visibility: "private",
				sourceType: "fork",
				sharingMode: "personal",
				shareTargetUserId: null,
				isGlobal: false,
				isRecommended: false,
				curationLabel: null,
				forkedFromAgentId: source.id,
			})
			.returning();

		const [version] = await tx
			.insert(agentVersions)
			.values({
				agentId: agent.id,
				versionNumber: 1,
				name: "Initial version",
				systemPrompt: sourceVersion?.systemPrompt ?? null,
				providerId: sourceVersion?.providerId ?? null,
				modelId: sourceVersion?.modelId ?? null,
				temperature: sourceVersion?.temperature ?? null,
				topP: sourceVersion?.topP ?? null,
				maxOutputTokens: sourceVersion?.maxOutputTokens ?? 30_000,
				maxToolCalls: sourceVersion?.maxToolCalls ?? 6,
				toolChoice: sourceVersion?.toolChoice ?? null,
				generationSettingsJson: sourceVersion?.generationSettingsJson ?? null,
				responseFormatJson: sourceVersion?.responseFormatJson ?? null,
				memoryPolicyJson: sourceVersion?.memoryPolicyJson ?? null,
				guardrailsJson: sourceVersion?.guardrailsJson ?? null,
				approvalPolicyJson: sourceVersion?.approvalPolicyJson ?? null,
				createdById: input.userId,
			})
			.returning();

		await tx
			.update(agents)
			.set({ activeVersionId: version.id })
			.where(eq(agents.id, agent.id));

		return { agent, version };
	});

	await cloneToolBindings(source.activeVersionId, version.id);
	await cloneKnowledgeBindings(source.activeVersionId, version.id);
	await cloneSkillBindings(source.activeVersionId, version.id);

	await audit.emit({
		workspaceId: input.workspaceId,
		actorPrincipalType: "user",
		actorPrincipalId: input.userId,
		action: "agent.cloned",
		resourceType: "agent",
		resourceId: agent.id,
		outcome: "success",
		metadata: { sourceAgentId: source.id },
	});

	logger.info("Agent cloned", {
		agentId: agent.id,
		sourceAgentId: source.id,
		userId: input.userId,
	});
	return { agent, version };
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
		maxToolCalls,
		toolBindings,
		knowledgeBindings,
		skillBindings,
		sharingMode,
		shareTargetEmail,
		isGlobal,
		isRecommended,
		curationLabel,
		canAdminCurate,
		toolChoice,
		generationSettings,
		responseFormat,
		memoryPolicy,
		guardrails,
		approvalPolicy,
	} = input;

	const [existing] = await db
		.select()
		.from(agents)
		.where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
		.limit(1);

	if (!existing) {
		throw new Error("Agent not found");
	}

	if (existing.createdById !== userId && !canAdminCurate) {
		throw new Error("Only the creator or an admin can update this agent");
	}

	const nextShareTargetUserId =
		sharingMode === "specific_user"
			? await requireShareTargetUserId(shareTargetEmail)
			: sharingMode
				? null
				: existing.shareTargetUserId;

	const { agent, version } = await db.transaction(async (tx) => {
		const agentUpdates: Record<string, unknown> = { updatedAt: new Date() };
		if (name !== undefined) agentUpdates.name = name;
		if (slug !== undefined) agentUpdates.slug = slug;
		if (description !== undefined) agentUpdates.description = description;
		if (sharingMode !== undefined) {
			agentUpdates.sharingMode = sharingMode;
			agentUpdates.shareTargetUserId = nextShareTargetUserId;
			agentUpdates.visibility =
				sharingMode === "marketplace" ? "public" : "private";
		}
		if (canAdminCurate) {
			if (isGlobal !== undefined) agentUpdates.isGlobal = isGlobal;
			if (isRecommended !== undefined) {
				agentUpdates.isRecommended = isRecommended;
			}
			if (curationLabel !== undefined || isRecommended !== undefined) {
				agentUpdates.curationLabel = normalizeCurationLabel(
					curationLabel,
					isRecommended ?? existing.isRecommended,
				);
			}
		}

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
				maxToolCalls:
					maxToolCalls !== undefined
						? maxToolCalls
						: (activeConfig?.maxToolCalls ?? 6),
				toolChoice:
					toolChoice !== undefined
						? toolChoice
						: (activeConfig?.toolChoice ?? null),
				generationSettingsJson:
					generationSettings !== undefined
						? generationSettings
						: (activeConfig?.generationSettingsJson ?? null),
				responseFormatJson:
					responseFormat !== undefined
						? { type: responseFormat }
						: (activeConfig?.responseFormatJson ?? null),
				memoryPolicyJson:
					memoryPolicy !== undefined
						? memoryPolicy
						: (activeConfig?.memoryPolicyJson ?? null),
				guardrailsJson:
					guardrails !== undefined
						? guardrails
						: (activeConfig?.guardrailsJson ?? null),
				approvalPolicyJson:
					approvalPolicy !== undefined
						? approvalPolicy
						: (activeConfig?.approvalPolicyJson ?? null),
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
		metadata: {
			versionNumber: version.versionNumber,
			sharingMode: sharingMode ?? existing.sharingMode,
		},
	});

	if (toolBindings) {
		await insertToolBindingsForVersion(version.id, toolBindings);
	} else {
		await cloneToolBindings(existing.activeVersionId, version.id);
	}

	if (knowledgeBindings) {
		await replaceKnowledgeBindingsForVersion(version.id, knowledgeBindings);
	} else {
		await cloneKnowledgeBindings(existing.activeVersionId, version.id);
	}

	if (skillBindings) {
		await replaceSkillBindingsForVersion(
			version.id,
			workspaceId,
			skillBindings,
		);
	} else {
		await cloneSkillBindings(existing.activeVersionId, version.id);
	}

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
	canAdminCurate = false,
) {
	const [existing] = await db
		.select()
		.from(agents)
		.where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
		.limit(1);

	if (!existing) {
		throw new Error("Agent not found");
	}

	if (existing.createdById !== userId && !canAdminCurate) {
		throw new Error("Only the creator or an admin can delete this agent");
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

	if (messageRows.length === 0) return [];

	const partsByMessageId = new Map<
		string,
		Array<typeof messageParts.$inferSelect>
	>();
	const parts = await db
		.select()
		.from(messageParts)
		.where(
			inArray(
				messageParts.messageId,
				messageRows.map((message) => message.id),
			),
		)
		.orderBy(messageParts.messageId, messageParts.sortOrder);

	for (const part of parts) {
		const existing = partsByMessageId.get(part.messageId);
		if (existing) {
			existing.push(part);
		} else {
			partsByMessageId.set(part.messageId, [part]);
		}
	}

	async function renderMessagePart(
		part: typeof messageParts.$inferSelect,
	): Promise<{ type: string; content: string }> {
		if (
			(part.type === "text" ||
				part.type === "reasoning" ||
				part.type === "suggestions" ||
				part.type === "citations") &&
			part.contentEncrypted
		) {
			try {
				const content = await decryptValue(part.contentEncrypted);
				return { type: part.type, content };
			} catch {
				return {
					type: part.type,
					content: "[decryption failed]",
				};
			}
		}

		return {
			type: part.type,
			content: part.metadataJson
				? JSON.stringify(part.metadataJson)
				: (part.contentEncrypted ?? ""),
		};
	}

	return Promise.all(
		messageRows.map(async (msg) => ({
			id: msg.id,
			role: msg.role,
			status: msg.status,
			parts: await Promise.all(
				(partsByMessageId.get(msg.id) ?? []).map(renderMessagePart),
			),
			createdAt: msg.createdAt,
		})),
	);
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
