import { and, eq, isNull } from "drizzle-orm";
import { generateText } from "ai";
import { z } from "zod";

import { decryptValue } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { db } from "@/server/infrastructure/db";
import {
	aiModels,
	aiProviders,
	appSettings,
} from "@/server/infrastructure/db/schema";
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

async function generateWithRuntimeModel(input: {
	runtime: RuntimeModel;
	prompt: string;
	maxOutputTokens: number;
}) {
	const adapter = getAdapter(input.runtime.providerKind);
	const { text } = await generateText({
		model: adapter.createChatModel(
			input.runtime.runtimeConfig,
			input.runtime.modelId,
		),
		prompt: input.prompt,
		temperature: 0.2,
		maxOutputTokens: input.maxOutputTokens,
	});
	return text.trim();
}

export async function generateChatAutomationArtifacts(input: {
	userMessage: string;
	assistantText: string;
	fallbackTitle: string;
}) {
	const config = await getChatAutomationConfig();
	const shouldGenerateTitle = config.enabled && config.generateTitles;
	const shouldGenerateSuggestions =
		config.enabled && config.generateSuggestions;
	if (!shouldGenerateTitle && !shouldGenerateSuggestions) {
		return { title: input.fallbackTitle, suggestions: [] };
	}

	const runtime = await resolveRuntimeModel(config);
	if (!runtime) return { title: input.fallbackTitle, suggestions: [] };

	try {
		const text = await generateWithRuntimeModel({
			runtime,
			maxOutputTokens: 220,
			prompt: [
				"Generate chat metadata for this conversation using one consistent style.",
				'Return JSON only with this exact shape: {"title": string, "suggestions": string[]}.',
				"Title rules: 3 to 7 words, no quotes, no trailing punctuation, same language as the user if obvious.",
				"Suggestions rules: exactly 3 useful next messages, each under 80 characters, same language as the conversation.",
				shouldGenerateTitle ? null : "Set title to an empty string.",
				shouldGenerateSuggestions ? null : "Set suggestions to an empty array.",
				`User message: ${input.userMessage.slice(0, 1_500)}`,
				`Assistant answer: ${input.assistantText.slice(0, 4_000)}`,
			]
				.filter(Boolean)
				.join("\n\n"),
		});
		const parsed = parseArtifacts(text);
		return {
			title: shouldGenerateTitle
				? sanitizeTitle(parsed.title, input.fallbackTitle)
				: input.fallbackTitle,
			suggestions: shouldGenerateSuggestions
				? sanitizeSuggestions(parsed.suggestions)
				: [],
		};
	} catch (error) {
		logger.warn("Failed to generate chat automation artifacts", {
			error: error instanceof Error ? error.message : String(error),
		});
		return { title: input.fallbackTitle, suggestions: [] };
	}
}

export async function generateConversationTitle(input: {
	userMessage: string;
	fallback: string;
}) {
	const artifacts = await generateChatAutomationArtifacts({
		userMessage: input.userMessage,
		assistantText: "",
		fallbackTitle: input.fallback,
	});
	return artifacts.title;
}

export async function generateNextChatSuggestions(input: {
	userMessage: string;
	assistantText: string;
}) {
	const artifacts = await generateChatAutomationArtifacts({
		userMessage: input.userMessage,
		assistantText: input.assistantText,
		fallbackTitle: "",
	});
	return artifacts.suggestions;
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

function parseArtifacts(value: string) {
	const cleaned = value
		.replace(/^```(?:json)?/i, "")
		.replace(/```$/i, "")
		.trim();
	try {
		const parsed = JSON.parse(cleaned) as unknown;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			const record = parsed as Record<string, unknown>;
			return {
				title: typeof record.title === "string" ? record.title : "",
				suggestions: Array.isArray(record.suggestions)
					? record.suggestions
					: [],
			};
		}
	} catch {
		// fall through to a safe empty shape
	}
	return { title: "", suggestions: [] };
}

function sanitizeSuggestions(values: unknown[]) {
	return values
		.filter((value): value is string => typeof value === "string")
		.map((value) => value.replace(/^['\"]|['\"]$/g, "").trim())
		.filter(Boolean)
		.slice(0, 3)
		.map((value) => value.slice(0, 80));
}
