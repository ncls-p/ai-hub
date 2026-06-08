import { and, eq, isNull } from "drizzle-orm";
import { generateText } from "ai";
import { z } from "zod";

import { decryptValue } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { db } from "@/server/infrastructure/db";
import { aiModels, aiProviders, appSettings } from "@/server/infrastructure/db/schema";
import {
	getAdapter,
	type ProviderKind,
	type ProviderRuntimeConfig,
} from "@/server/infrastructure/providers";

const CHAT_AUTOMATION_SETTING_KEY = "chatAutomation";

const chatAutomationConfigSchema = z.object({
	enabled: z.boolean().default(false),
	providerId: z.uuid().optional(),
	modelId: z.uuid().optional(),
	generateTitles: z.boolean().default(true),
	generateSuggestions: z.boolean().default(true),
});

export type ChatAutomationConfig = z.infer<typeof chatAutomationConfigSchema>;

function defaultChatAutomationConfig(): ChatAutomationConfig {
	return {
		enabled: false,
		generateTitles: true,
		generateSuggestions: true,
	};
}

function parseChatAutomationConfig(value: unknown): ChatAutomationConfig {
	const parsed = chatAutomationConfigSchema.safeParse(value);
	return parsed.success ? parsed.data : defaultChatAutomationConfig();
}

export async function getChatAutomationConfig() {
	const [row] = await db
		.select({ valueJson: appSettings.valueJson })
		.from(appSettings)
		.where(eq(appSettings.key, CHAT_AUTOMATION_SETTING_KEY))
		.limit(1);
	return parseChatAutomationConfig(row?.valueJson);
}

export async function setChatAutomationConfig(
	input: ChatAutomationConfig,
	updatedById: string,
) {
	const value = chatAutomationConfigSchema.parse(input);
	await db
		.insert(appSettings)
		.values({
			key: CHAT_AUTOMATION_SETTING_KEY,
			valueJson: value,
			updatedById,
			updatedAt: new Date(),
		})
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { valueJson: value, updatedById, updatedAt: new Date() },
		});
	return getChatAutomationConfig();
}

export async function getChatAutomationAdminState() {
	const [config, providers] = await Promise.all([
		getChatAutomationConfig(),
		db
			.select({
				id: aiProviders.id,
				name: aiProviders.name,
				kind: aiProviders.kind,
				enabled: aiProviders.enabled,
			})
			.from(aiProviders)
			.where(and(eq(aiProviders.enabled, true), isNull(aiProviders.archivedAt)))
			.orderBy(aiProviders.name),
	]);

	const models = await db
		.select({
			id: aiModels.id,
			providerId: aiModels.providerId,
			modelId: aiModels.modelId,
			displayName: aiModels.displayName,
			enabled: aiModels.enabled,
		})
		.from(aiModels)
		.where(eq(aiModels.enabled, true))
		.orderBy(aiModels.displayName, aiModels.modelId);

	return { config, providers, models };
}

type RuntimeModel = {
	runtimeConfig: ProviderRuntimeConfig;
	providerKind: ProviderKind;
	modelId: string;
};

async function resolveRuntimeModel(
	config: ChatAutomationConfig,
): Promise<RuntimeModel | null> {
	if (!config.enabled || !config.providerId || !config.modelId) return null;

	const [provider] = await db
		.select()
		.from(aiProviders)
		.where(
			and(
				eq(aiProviders.id, config.providerId),
				eq(aiProviders.enabled, true),
				isNull(aiProviders.archivedAt),
			),
		)
		.limit(1);
	if (!provider) return null;

	const [model] = await db
		.select()
		.from(aiModels)
		.where(
			and(
				eq(aiModels.id, config.modelId),
				eq(aiModels.providerId, provider.id),
				eq(aiModels.enabled, true),
			),
		)
		.limit(1);
	if (!model) return null;

	let apiKey: string | undefined;
	if (provider.encryptedApiKey) {
		apiKey = await decryptValue(provider.encryptedApiKey);
	}

	let headers: Record<string, string> | undefined;
	if (provider.encryptedHeadersJson) {
		headers = {};
		for (const [key, value] of Object.entries(
			provider.encryptedHeadersJson as Record<string, string>,
		)) {
			headers[key] = await decryptValue(value);
		}
	}

	return {
		providerKind: provider.kind as ProviderKind,
		modelId: model.modelId,
		runtimeConfig: {
			kind: provider.kind as ProviderKind,
			name: provider.name,
			baseUrl: provider.baseUrl || undefined,
			authType: provider.authType,
			apiKey,
			headers,
			queryParams:
				(provider.queryParamsJson as Record<string, string>) || undefined,
		},
	};
}

async function generateWithAutomationModel(prompt: string, maxOutputTokens: number) {
	const config = await getChatAutomationConfig();
	const runtime = await resolveRuntimeModel(config);
	if (!runtime) return null;

	const adapter = getAdapter(runtime.providerKind);
	const { text } = await generateText({
		model: adapter.createChatModel(runtime.runtimeConfig, runtime.modelId),
		prompt,
		temperature: 0.2,
		maxOutputTokens,
	});
	return text.trim();
}

export async function generateConversationTitle(input: {
	userMessage: string;
	fallback: string;
}) {
	const config = await getChatAutomationConfig();
	if (!config.enabled || !config.generateTitles) return input.fallback;

	try {
		const title = await generateWithAutomationModel(
			[
				"Generate a concise conversation title.",
				"Rules: 3 to 7 words, no quotes, no trailing punctuation, same language as the user if obvious.",
				`User message: ${input.userMessage.slice(0, 2_000)}`,
			].join("\n"),
			32,
		);
		return sanitizeTitle(title ?? input.fallback, input.fallback);
	} catch (error) {
		logger.warn("Failed to generate conversation title", {
			error: error instanceof Error ? error.message : String(error),
		});
		return input.fallback;
	}
}

export async function generateNextChatSuggestions(input: {
	userMessage: string;
	assistantText: string;
}) {
	const config = await getChatAutomationConfig();
	if (!config.enabled || !config.generateSuggestions) return [];

	try {
		const text = await generateWithAutomationModel(
			[
				"Generate 3 short follow-up chat suggestions for the user.",
				"Rules: reply as a JSON array of strings only, each suggestion under 80 characters, no markdown.",
				`User message: ${input.userMessage.slice(0, 1_500)}`,
				`Assistant answer: ${input.assistantText.slice(0, 4_000)}`,
			].join("\n\n"),
			160,
		);
		return parseSuggestions(text ?? "");
	} catch (error) {
		logger.warn("Failed to generate next chat suggestions", {
			error: error instanceof Error ? error.message : String(error),
		});
		return [];
	}
}

function sanitizeTitle(value: string, fallback: string) {
	const title = value
		.replace(/^```(?:json|text)?/i, "")
		.replace(/```$/i, "")
		.replace(/^['\"]|['\"]$/g, "")
		.replace(/[.。!?！？]+$/g, "")
		.trim();
	return (title || fallback).slice(0, 100);
}

function parseSuggestions(value: string) {
	const cleaned = value
		.replace(/^```(?:json)?/i, "")
		.replace(/```$/i, "")
		.trim();
	try {
		const parsed = JSON.parse(cleaned) as unknown;
		if (Array.isArray(parsed)) return sanitizeSuggestions(parsed);
	} catch {
		// fall back to line parsing
	}
	return sanitizeSuggestions(
		cleaned
			.split(/\r?\n/)
			.map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
			.filter(Boolean),
	);
}

function sanitizeSuggestions(values: unknown[]) {
	return values
		.filter((value): value is string => typeof value === "string")
		.map((value) => value.replace(/^['\"]|['\"]$/g, "").trim())
		.filter(Boolean)
		.slice(0, 3)
		.map((value) => value.slice(0, 80));
}
