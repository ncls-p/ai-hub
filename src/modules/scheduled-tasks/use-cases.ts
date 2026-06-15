import { and, asc, eq, isNull, lte } from "drizzle-orm";
import { generateText } from "ai";

import { encryptValue } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import {
	getActiveVersion,
	getAgentById,
	resolveProviderForVersion,
	recordUsageEvent,
} from "@/modules/agent/use-cases";
import { getBuiltInToolByName } from "@/modules/tool/builtin-tools";
import { db } from "@/server/infrastructure/db";
import {
	conversations,
	messageParts,
	messages,
	scheduledTasks,
} from "@/server/infrastructure/db/schema";
import { getAdapter } from "@/server/infrastructure/providers";

export type ScheduledTaskFrequency = "daily" | "interval";

export type ScheduledTaskInput = {
	workspaceId: string;
	userId: string;
	agentId: string;
	conversationId?: string | null;
	title: string;
	prompt: string;
	frequency: ScheduledTaskFrequency;
	timezone?: string;
	timeOfDay?: string | null;
	intervalMinutes?: number | null;
	enabled?: boolean;
};

export type UpdateScheduledTaskInput = Partial<
	Pick<
		ScheduledTaskInput,
		| "agentId"
		| "conversationId"
		| "title"
		| "prompt"
		| "frequency"
		| "timezone"
		| "timeOfDay"
		| "intervalMinutes"
		| "enabled"
	>
>;

const MAX_DUE_TASKS_PER_TICK = 10;

function assertValidTimeOfDay(value: string | null | undefined) {
	if (!value || !/^\d{2}:\d{2}$/.test(value)) {
		throw new Error("timeOfDay must use HH:mm format");
	}
	const [hour = 0, minute = 0] = value.split(":").map(Number);
	if (hour > 23 || minute > 59) throw new Error("timeOfDay is invalid");
}

function normalizeTaskInput(input: ScheduledTaskInput) {
	const title = input.title.trim();
	const prompt = input.prompt.trim();
	if (!title) throw new Error("Title is required");
	if (!prompt) throw new Error("Prompt is required");

	if (input.frequency === "daily") {
		assertValidTimeOfDay(input.timeOfDay);
		return {
			...input,
			title,
			prompt,
			timezone: input.timezone || "UTC",
			intervalMinutes: null,
		};
	}

	const intervalMinutes = input.intervalMinutes ?? 0;
	if (!Number.isInteger(intervalMinutes) || intervalMinutes < 5) {
		throw new Error("intervalMinutes must be at least 5");
	}

	return {
		...input,
		title,
		prompt,
		timezone: input.timezone || "UTC",
		timeOfDay: null,
		intervalMinutes,
	};
}

function getZonedParts(date: Date, timeZone: string) {
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
	const parts = Object.fromEntries(
		formatter.formatToParts(date).map((part) => [part.type, part.value]),
	);
	return {
		year: Number(parts.year),
		month: Number(parts.month),
		day: Number(parts.day),
		hour: Number(parts.hour),
		minute: Number(parts.minute),
		second: Number(parts.second),
	};
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
	const parts = getZonedParts(date, timeZone);
	const asUtc = Date.UTC(
		parts.year,
		parts.month - 1,
		parts.day,
		parts.hour,
		parts.minute,
		parts.second,
	);
	return asUtc - date.getTime();
}

function zonedTimeToUtc(input: {
	timeZone: string;
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
}) {
	const guessedUtc = new Date(
		Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute),
	);
	const firstPass = new Date(
		guessedUtc.getTime() - getTimeZoneOffsetMs(guessedUtc, input.timeZone),
	);
	return new Date(
		guessedUtc.getTime() - getTimeZoneOffsetMs(firstPass, input.timeZone),
	);
}

export function computeNextRunAt(input: {
	frequency: ScheduledTaskFrequency;
	timezone?: string;
	timeOfDay?: string | null;
	intervalMinutes?: number | null;
	from?: Date;
}) {
	const from = input.from ?? new Date();
	if (input.frequency === "interval") {
		const intervalMinutes = input.intervalMinutes ?? 0;
		return new Date(from.getTime() + intervalMinutes * 60_000);
	}

	assertValidTimeOfDay(input.timeOfDay);
	const timezone = input.timezone || "UTC";
	const [hour = 0, minute = 0] = input.timeOfDay!.split(":").map(Number);
	const localNow = getZonedParts(from, timezone);
	let candidate = zonedTimeToUtc({
		timeZone: timezone,
		year: localNow.year,
		month: localNow.month,
		day: localNow.day,
		hour,
		minute,
	});

	if (candidate <= from) {
		const tomorrowNoonUtc = new Date(
			Date.UTC(localNow.year, localNow.month - 1, localNow.day + 1, 12),
		);
		const tomorrow = getZonedParts(tomorrowNoonUtc, timezone);
		candidate = zonedTimeToUtc({
			timeZone: timezone,
			year: tomorrow.year,
			month: tomorrow.month,
			day: tomorrow.day,
			hour,
			minute,
		});
	}

	return candidate;
}

async function assertAgentInWorkspace(agentId: string, workspaceId: string) {
	const agent = await getAgentById(agentId, workspaceId);
	if (!agent) throw new Error("Agent not found");
	return agent;
}

export async function listScheduledTasks(workspaceId: string, userId: string) {
	return db
		.select()
		.from(scheduledTasks)
		.where(
			and(
				eq(scheduledTasks.workspaceId, workspaceId),
				eq(scheduledTasks.userId, userId),
			),
		)
		.orderBy(asc(scheduledTasks.nextRunAt));
}

export async function createScheduledTask(input: ScheduledTaskInput) {
	const normalized = normalizeTaskInput(input);
	await assertAgentInWorkspace(normalized.agentId, normalized.workspaceId);
	const nextRunAt = computeNextRunAt(normalized);
	const [task] = await db
		.insert(scheduledTasks)
		.values({
			workspaceId: normalized.workspaceId,
			userId: normalized.userId,
			agentId: normalized.agentId,
			conversationId: normalized.conversationId || null,
			title: normalized.title,
			prompt: normalized.prompt,
			frequency: normalized.frequency,
			timezone: normalized.timezone,
			timeOfDay: normalized.timeOfDay,
			intervalMinutes: normalized.intervalMinutes,
			enabled: normalized.enabled ?? true,
			nextRunAt,
		})
		.returning();
	return task;
}

export async function updateScheduledTask(
	taskId: string,
	workspaceId: string,
	userId: string,
	input: UpdateScheduledTaskInput,
) {
	const [existing] = await db
		.select()
		.from(scheduledTasks)
		.where(
			and(
				eq(scheduledTasks.id, taskId),
				eq(scheduledTasks.workspaceId, workspaceId),
				eq(scheduledTasks.userId, userId),
			),
		)
		.limit(1);
	if (!existing) throw new Error("Scheduled task not found");

	const merged = normalizeTaskInput({
		workspaceId,
		userId,
		agentId: input.agentId ?? existing.agentId,
		conversationId: input.conversationId ?? existing.conversationId,
		title: input.title ?? existing.title,
		prompt: input.prompt ?? existing.prompt,
		frequency: input.frequency ?? existing.frequency,
		timezone: input.timezone ?? existing.timezone,
		timeOfDay: input.timeOfDay ?? existing.timeOfDay,
		intervalMinutes: input.intervalMinutes ?? existing.intervalMinutes,
		enabled: input.enabled ?? existing.enabled,
	});
	await assertAgentInWorkspace(merged.agentId, workspaceId);
	const nextRunAt = computeNextRunAt(merged);

	const [task] = await db
		.update(scheduledTasks)
		.set({
			agentId: merged.agentId,
			conversationId: merged.conversationId || null,
			title: merged.title,
			prompt: merged.prompt,
			frequency: merged.frequency,
			timezone: merged.timezone,
			timeOfDay: merged.timeOfDay,
			intervalMinutes: merged.intervalMinutes,
			enabled: merged.enabled,
			nextRunAt,
			updatedAt: new Date(),
		})
		.where(eq(scheduledTasks.id, taskId))
		.returning();
	return task;
}

export async function deleteScheduledTask(
	taskId: string,
	workspaceId: string,
	userId: string,
) {
	await db
		.delete(scheduledTasks)
		.where(
			and(
				eq(scheduledTasks.id, taskId),
				eq(scheduledTasks.workspaceId, workspaceId),
				eq(scheduledTasks.userId, userId),
			),
		);
}

async function ensureConversationForTask(
	task: typeof scheduledTasks.$inferSelect,
	agentVersionId: string | null,
) {
	if (task.conversationId) {
		const [existing] = await db
			.select({ id: conversations.id })
			.from(conversations)
			.where(
				and(
					eq(conversations.id, task.conversationId),
					eq(conversations.workspaceId, task.workspaceId),
					eq(conversations.userId, task.userId),
					eq(conversations.status, "active"),
					isNull(conversations.archivedAt),
				),
			)
			.limit(1);
		if (existing) return existing.id;
	}

	const [conversation] = await db
		.insert(conversations)
		.values({
			workspaceId: task.workspaceId,
			agentId: task.agentId,
			agentVersionId,
			userId: task.userId,
			title: task.title,
			status: "active",
		})
		.returning();

	await db
		.update(scheduledTasks)
		.set({ conversationId: conversation.id, updatedAt: new Date() })
		.where(eq(scheduledTasks.id, task.id));

	return conversation.id;
}

async function buildSearchContext(prompt: string) {
	const webSearch = getBuiltInToolByName("web_search");
	if (!webSearch) return null;
	try {
		const input = webSearch.inputSchema.parse({
			query: prompt,
			limit: 8,
			language: "fr",
		});
		const result = await (webSearch.execute as (value: unknown) => unknown)(
			input,
		);
		return JSON.stringify(result, null, 2).slice(0, 12_000);
	} catch (error) {
		logger.warn("Scheduled task web search failed", {
			error: error instanceof Error ? error.message : String(error),
		});
		return null;
	}
}

async function insertMessage(input: {
	conversationId: string;
	role: "user" | "assistant";
	content: string;
	modelId?: string | null;
	providerId?: string | null;
	tokenInput?: number | null;
	tokenOutput?: number | null;
}) {
	const [message] = await db
		.insert(messages)
		.values({
			conversationId: input.conversationId,
			role: input.role,
			status: "completed",
			modelId: input.modelId || null,
			providerId: input.providerId || null,
			tokenInput: input.tokenInput ?? null,
			tokenOutput: input.tokenOutput ?? null,
			completedAt: new Date(),
		})
		.returning();

	await db.insert(messageParts).values({
		messageId: message.id,
		type: "text",
		contentEncrypted: await encryptValue(input.content),
		sortOrder: 0,
	});

	return message;
}

export async function runScheduledTask(
	task: typeof scheduledTasks.$inferSelect,
) {
	const startedAt = Date.now();
	const agent = await assertAgentInWorkspace(task.agentId, task.workspaceId);
	const version = await getActiveVersion(task.agentId);
	if (!version) throw new Error("Agent has no active version");
	const providerConfig = await resolveProviderForVersion(version);
	if (!providerConfig?.modelId)
		throw new Error("Agent model is not configured");

	const conversationId = await ensureConversationForTask(task, version.id);
	const prompt = `Tâche planifiée « ${task.title} »\n\n${task.prompt}`;
	await insertMessage({ conversationId, role: "user", content: prompt });

	const searchContext = await buildSearchContext(task.prompt);
	const adapter = getAdapter(providerConfig.providerKind);
	const system = [
		version.systemPrompt?.trim(),
		"Tu exécutes une tâche planifiée automatiquement. Réponds directement dans le chat avec un contenu utile, daté, concis et actionnable. Si un contexte web est fourni, cite les sources importantes par URL.",
		searchContext
			? `Contexte web récupéré juste avant l'exécution:\n${searchContext}`
			: null,
	]
		.filter(Boolean)
		.join("\n\n");

	const result = await generateText({
		model: adapter.createChatModel(
			providerConfig.runtimeConfig,
			providerConfig.modelId,
		),
		system,
		prompt: task.prompt,
		temperature: version.temperature
			? Number.parseFloat(version.temperature)
			: undefined,
		topP: version.topP ? Number.parseFloat(version.topP) : undefined,
		maxOutputTokens: Math.min(version.maxOutputTokens ?? 4_000, 4_000),
	});

	const assistantText =
		result.text.trim() || "La tâche planifiée n'a produit aucun contenu.";
	await insertMessage({
		conversationId,
		role: "assistant",
		content: assistantText,
		modelId: providerConfig.modelId,
		providerId: providerConfig.providerId,
		tokenInput: result.usage.inputTokens,
		tokenOutput: result.usage.outputTokens,
	});

	await db
		.update(conversations)
		.set({
			agentId: agent.id,
			agentVersionId: version.id,
			updatedAt: new Date(),
		})
		.where(eq(conversations.id, conversationId));

	await recordUsageEvent({
		workspaceId: task.workspaceId,
		userId: task.userId,
		providerId: providerConfig.providerId,
		modelId: providerConfig.modelRecordId,
		agentId: task.agentId,
		conversationId,
		operation: "scheduled_task",
		inputTokens: result.usage.inputTokens,
		outputTokens: result.usage.outputTokens,
		latencyMs: Date.now() - startedAt,
		status: "success",
	});
}

export async function processDueScheduledTasks(now = new Date()) {
	const dueTasks = await db
		.select()
		.from(scheduledTasks)
		.where(
			and(eq(scheduledTasks.enabled, true), lte(scheduledTasks.nextRunAt, now)),
		)
		.orderBy(asc(scheduledTasks.nextRunAt))
		.limit(MAX_DUE_TASKS_PER_TICK);

	for (const task of dueTasks) {
		const nextRunAt = computeNextRunAt({
			frequency: task.frequency,
			timezone: task.timezone,
			timeOfDay: task.timeOfDay,
			intervalMinutes: task.intervalMinutes,
			from: now,
		});
		await db
			.update(scheduledTasks)
			.set({
				lastRunAt: now,
				lastStatus: "running",
				lastError: null,
				nextRunAt,
				updatedAt: new Date(),
			})
			.where(eq(scheduledTasks.id, task.id));

		try {
			await runScheduledTask(task);
			await db
				.update(scheduledTasks)
				.set({ lastStatus: "success", updatedAt: new Date() })
				.where(eq(scheduledTasks.id, task.id));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error("Scheduled task failed", {
				taskId: task.id,
				workspaceId: task.workspaceId,
				error: message,
			});
			await db
				.update(scheduledTasks)
				.set({
					lastStatus: "failed",
					lastError: message.slice(0, 4_000),
					updatedAt: new Date(),
				})
				.where(eq(scheduledTasks.id, task.id));
		}
	}

	return dueTasks.length;
}
