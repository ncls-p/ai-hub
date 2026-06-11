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

export type ChatAutomationValidationIssue = {
	code: string;
	message: string;
};

type RuntimeModel = {
	runtimeConfig: ProviderRuntimeConfig;
	providerKind: ProviderKind;
	modelId: string;
};

type ResolveRuntimeResult =
	| { ok: true; runtime: RuntimeModel }
	| { ok: false; reason: string };

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

export function validateChatAutomationConfigShape(
	config: ChatAutomationConfig,
): ChatAutomationValidationIssue[] {
	const issues: ChatAutomationValidationIssue[] = [];
	if (config.enabled && !config.providerId) {
		issues.push({
			code: "provider_required",
			message: "A provider is required when automation is enabled.",
		});
	}
	if (config.enabled && !config.modelId) {
		issues.push({
			code: "model_required",
			message: "A model is required when automation is enabled.",
		});
	}
	return issues;
}

export async function validateChatAutomationConfig(
	config: ChatAutomationConfig,
): Promise<{ ok: boolean; issues: ChatAutomationValidationIssue[] }> {
	const issues = validateChatAutomationConfigShape(config);
	if (issues.length > 0) {
		return { ok: false, issues };
	}
	if (!config.enabled) {
		return { ok: true, issues: [] };
	}

	const resolved = await resolveRuntimeModel(config);
	if (!resolved.ok) {
		issues.push({
			code: "runtime_unavailable",
			message: resolved.reason,
		});
		return { ok: false, issues };
	}
	return { ok: true, issues: [] };
}

async function resolveRuntimeModel(
	config: ChatAutomationConfig,
): Promise<ResolveRuntimeResult> {
	if (!config.enabled || !config.providerId || !config.modelId) {
		return {
			ok: false,
			reason: "Automation is disabled or provider/model is not configured.",
		};
	}

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
	if (!provider) {
		return {
			ok: false,
			reason: "Selected provider was not found, is disabled, or is archived.",
		};
	}

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
	if (!model) {
		return {
			ok: false,
			reason:
				"Selected model was not found, is disabled, or does not belong to the provider.",
		};
	}

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
		ok: true,
		runtime: {
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
		},
	};
}

export async function testChatAutomationConnection(): Promise<
	{ ok: true } | { ok: false; error: string }
> {
	const config = await getChatAutomationConfig();
	const validation = await validateChatAutomationConfig(config);
	if (!validation.ok) {
		return {
			ok: false,
			error: validation.issues.map((issue) => issue.message).join(" "),
		};
	}

	const resolved = await resolveRuntimeModel(config);
	if (!resolved.ok) {
		return { ok: false, error: resolved.reason };
	}

	try {
		const adapter = getAdapter(resolved.runtime.providerKind);
		const { text, reasoning } = await generateText({
			model: adapter.createChatModel(
				resolved.runtime.runtimeConfig,
				resolved.runtime.modelId,
			),
			prompt: 'Reply with only the JSON object {"ok":true}.',
			temperature: 0,
			maxOutputTokens: 64,
		});
		const output = `${text}${reasoningTextFromParts(reasoning)}`.trim();
		if (!output) {
			return {
				ok: false,
				error: "Model returned an empty response.",
			};
		}
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

const chatArtifactsSchema = z.object({
	title: z.string().default(""),
	suggestions: z.array(z.string()).default([]),
});

function reasoningTextFromParts(
	reasoning: Array<{ type: string; text: string }> | undefined,
) {
	return (
		reasoning
			?.map((part) => (part.type === "reasoning" ? part.text : ""))
			.join("\n")
			.trim() ?? ""
	);
}

function extractJsonObjectCandidate(value: string) {
	const cleaned = value
		.replace(/^```(?:json|text)?/i, "")
		.replace(/```$/i, "")
		.trim();
	const jsonStart = cleaned.indexOf("{");
	const jsonEnd = cleaned.lastIndexOf("}");
	if (jsonStart < 0 || jsonEnd <= jsonStart) return cleaned;
	return cleaned.slice(jsonStart, jsonEnd + 1);
}

function parseArtifactsStrict(value: string) {
	const json = extractJsonObjectCandidate(value);
	try {
		const parsed = JSON.parse(json) as unknown;
		const result = chatArtifactsSchema.safeParse(parsed);
		if (result.success) return result.data;
	} catch {
		// Fall through to looser parsing below.
	}
	return null;
}

export function parseArtifactsFromModelOutput(input: {
	text: string;
	reasoning?: Array<{ type: string; text: string }>;
}) {
	const candidates = [
		input.text.trim(),
		reasoningTextFromParts(input.reasoning),
	].filter(Boolean);

	for (const candidate of candidates) {
		const strict = parseArtifactsStrict(candidate);
		if (strict) return strict;
	}

	const trimmedText = input.text.trim();
	if (trimmedText) {
		const parsed = parseArtifacts(trimmedText);
		if (parsed.title || parsed.suggestions.length > 0) {
			return parsed;
		}
	}

	return { title: "", suggestions: [] };
}

function hasParsedArtifacts(value: { title: string; suggestions: string[] }) {
	return (
		Boolean(value.title.trim()) ||
		value.suggestions.some((suggestion) => suggestion.trim().length > 0)
	);
}

async function generateArtifactsWithRuntimeModel(input: {
	runtime: RuntimeModel;
	prompt: string;
	maxOutputTokens: number;
}) {
	const adapter = getAdapter(input.runtime.providerKind);
	const model = adapter.createChatModel(
		input.runtime.runtimeConfig,
		input.runtime.modelId,
	);

	for (let attempt = 0; attempt < 2; attempt += 1) {
		const { text, reasoning } = await generateText({
			model,
			prompt: input.prompt,
			temperature: attempt === 0 ? 0.2 : 0.35,
			maxOutputTokens: input.maxOutputTokens,
		});
		const parsed = parseArtifactsFromModelOutput({ text, reasoning });
		if (hasParsedArtifacts(parsed)) {
			return parsed;
		}
	}

	return { title: "", suggestions: [] };
}

export async function generateChatAutomationArtifacts(input: {
	userMessage: string;
	assistantText: string;
	fallbackTitle: string;
	generateSuggestions?: boolean;
}) {
	const config = await getChatAutomationConfig();
	const shouldGenerateTitle = config.enabled && config.generateTitles;
	const shouldGenerateSuggestions =
		config.enabled && config.generateSuggestions && input.generateSuggestions !== false;
	if (!shouldGenerateTitle && !shouldGenerateSuggestions) {
		return { title: input.fallbackTitle, suggestions: [] };
	}

	const resolved = await resolveRuntimeModel(config);
	if (!resolved.ok) {
		logger.warn("Chat automation runtime unavailable, using local fallback", {
			reason: resolved.reason,
		});
		const fallback = createFallbackArtifacts(input);
		return {
			title: shouldGenerateTitle ? fallback.title : input.fallbackTitle,
			suggestions: shouldGenerateSuggestions ? fallback.suggestions : [],
		};
	}

	try {
		const object = await generateArtifactsWithRuntimeModel({
			runtime: resolved.runtime,
			maxOutputTokens: 1024,
			prompt: [
				'Return ONLY minified JSON: {"title":"...","suggestions":["...","...","..."]}.',
				"No markdown, prose, or code fences.",
				"Title: 3-7 words, same language as the user when obvious.",
				"Suggestions: exactly 3 short follow-up prompts the user can click.",
				shouldGenerateTitle ? null : 'Use an empty string for "title".',
				shouldGenerateSuggestions ? null : 'Use an empty array for "suggestions".',
				`User: ${input.userMessage.slice(0, 1_500)}`,
				`Assistant: ${input.assistantText.slice(0, 4_000)}`,
			]
				.filter(Boolean)
				.join(" "),
		});
		const fallback = createFallbackArtifacts(input);
		return {
			title: shouldGenerateTitle
				? sanitizeTitle(object.title, fallback.title)
				: input.fallbackTitle,
			suggestions: shouldGenerateSuggestions
				? ensureThreeSuggestions(object.suggestions, fallback.suggestions)
				: [],
		};
	} catch (error) {
		logger.warn("Failed to generate chat automation artifacts", {
			error: error instanceof Error ? error.message : String(error),
		});
		const fallback = createFallbackArtifacts(input);
		return {
			title: shouldGenerateTitle ? fallback.title : input.fallbackTitle,
			suggestions: shouldGenerateSuggestions ? fallback.suggestions : [],
		};
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

export function parseArtifacts(value: string) {
	const cleaned = value
		.replace(/^```(?:json|text)?/i, "")
		.replace(/```$/i, "")
		.trim();
	const jsonStart = cleaned.indexOf("{");
	const jsonEnd = cleaned.lastIndexOf("}");
	const json =
		jsonStart >= 0 && jsonEnd > jsonStart
			? cleaned.slice(jsonStart, jsonEnd + 1)
			: cleaned;

	try {
		const parsed = JSON.parse(json) as unknown;
		const result = chatArtifactsSchema.safeParse(parsed);
		if (result.success) return result.data;
	} catch {
		// Fall through to best-effort extraction below.
	}

	return {
		title: extractTitle(cleaned),
		suggestions: extractSuggestions(cleaned),
	};
}

function extractTitle(value: string) {
	const match = /"?title"?\s*[:=]\s*["“”']([^"“”'\n]+)/i.exec(value);
	return match?.[1]?.trim() ?? "";
}

function extractSuggestions(value: string) {
	const parsedLines = value
		.split("\n")
		.map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
		.filter(Boolean)
		.filter((line) => !/^title\s*[:=]/i.test(line))
		.filter((line) => !/^suggestions?\s*[:=]\s*\[?\s*$/i.test(line));
	return parsedLines.slice(0, 3);
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

export function createFallbackArtifacts(input: {
	userMessage: string;
	assistantText: string;
	fallbackTitle: string;
}) {
	const french = looksFrench(`${input.userMessage}\n${input.assistantText}`);
	return {
		title:
			buildLocalTitle(input.userMessage) ||
			sanitizeTitle(
				input.fallbackTitle,
				french ? "Nouvelle discussion" : "New chat",
			),
		suggestions: french
			? [
					"Peux-tu détailler les étapes ?",
					"Donne-moi un exemple concret",
					"Quelles sont les alternatives ?",
				]
			: [
					"Can you break that into steps?",
					"Show me a concrete example",
					"What are the alternatives?",
				],
	};
}

function buildLocalTitle(value: string) {
	const words = value
		.replace(/[\r\n]+/g, " ")
		.replace(/[`*_#>\[\]{}()]/g, " ")
		.replace(/[.。!?！？,;:]+$/g, "")
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 7);
	return words.join(" ").slice(0, 100);
}

function looksFrench(value: string) {
	return /[àâçéèêëîïôùûüÿœæ]|\b(le|la|les|un|une|des|du|de|ce|cette|ces|pour|avec|sans|est|sont|peux|peut|comment|quoi|quel|quelle)\b/i.test(
		value,
	);
}

export function ensureThreeSuggestions(values: unknown[], fallback: string[]) {
	const suggestions = sanitizeSuggestions(values);
	for (const suggestion of fallback) {
		if (suggestions.length >= 3) break;
		if (!suggestions.includes(suggestion)) suggestions.push(suggestion);
	}
	return suggestions.slice(0, 3);
}

function looksLikeArtifactSuggestion(value: string) {
	return !/^(?:input|constraint|task|goal|format|json schema|context|required shape)\b/i.test(
		value.trim(),
	);
}

function sanitizeSuggestions(values: unknown[]) {
	return values
		.filter((value): value is string => typeof value === "string")
		.map((value) => value.replace(/^['\"]|['\"]$/g, "").trim())
		.filter(Boolean)
		.filter(looksLikeArtifactSuggestion)
		.map((value) => value.slice(0, 80))
		.slice(0, 3);
}
