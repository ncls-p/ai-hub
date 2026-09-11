import { applyUsageLimits } from "@/modules/usage/limited-language-model";
import type { UsageLimitContext } from "@/modules/usage/usage-limits";
import { generateText } from "ai";

import { logHandledWarning } from "@/lib/logger";
import {
  agentRuntimePolicy,
  createRuntimeDeadline,
} from "@/modules/agent/runtime-policy";
import { getAdapter } from "@/server/infrastructure/providers";
import {
  RuntimeModel,
  getChatAutomationConfig,
} from "./automation.chat-automation-config";
import {
  createFallbackArtifacts,
  ensureThreeSuggestions,
  extractSuggestions,
  extractTitle,
  sanitizeTitle,
} from "./automation.extract-title";
import {
  ReasoningLikePart,
  chatArtifactsSchema,
  extractJsonObjectCandidate,
  reasoningTextFromParts,
  resolveRuntimeModel,
} from "./automation.resolve-runtime-model";

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
  reasoning?: ReasoningLikePart[];
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
  usageContext?: UsageLimitContext;
  runtime: RuntimeModel;
  prompt: string;
  maxOutputTokens: number;
}) {
  const adapter = getAdapter(input.runtime.providerKind);
  const baseModel = adapter.createChatModel(
    input.runtime.runtimeConfig,
    input.runtime.modelId,
  );

  const model = input.usageContext
    ? await applyUsageLimits(baseModel, input.usageContext)
    : baseModel;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const runtimeDeadline = createRuntimeDeadline(
      agentRuntimePolicy.automationTimeoutMs,
    );
    const result = await generateText({
      model,
      prompt: input.prompt,
      temperature: attempt === 0 ? 0.2 : 0.35,
      maxOutputTokens: input.maxOutputTokens,
      abortSignal: runtimeDeadline.signal,
    });
    const parsed = parseArtifactsFromModelOutput({
      text: result.text,
      reasoning: result.finalStep.reasoning,
    });
    if (hasParsedArtifacts(parsed)) {
      return parsed;
    }
  }

  return { title: "", suggestions: [] };
}

export async function generateChatAutomationArtifacts(input: {
  userId?: string;
  workspaceId?: string;
  userMessage: string;
  assistantText: string;
  fallbackTitle: string;
  generateSuggestions?: boolean;
}) {
  const config = await getChatAutomationConfig();
  const shouldGenerateTitle = config.enabled && config.generateTitles;
  const shouldGenerateSuggestions =
    config.enabled &&
    config.generateSuggestions &&
    input.generateSuggestions !== false;
  if (!shouldGenerateTitle && !shouldGenerateSuggestions) {
    return { title: input.fallbackTitle, suggestions: [] };
  }

  const resolved = await resolveRuntimeModel(config);
  if (!resolved.ok) {
    logHandledWarning(
      "Chat automation runtime unavailable, using local fallback",
      {
        reason: resolved.reason,
      },
    );
    const fallback = createFallbackArtifacts(input);
    return {
      title: shouldGenerateTitle ? fallback.title : input.fallbackTitle,
      suggestions: shouldGenerateSuggestions ? fallback.suggestions : [],
    };
  }

  try {
    const object = await generateArtifactsWithRuntimeModel({
      usageContext:
        input.userId && input.workspaceId && config.providerId
          ? {
              userId: input.userId,
              workspaceId: input.workspaceId,
              providerId: config.providerId,
              modelId: config.modelId ?? null,
            }
          : undefined,
      runtime: resolved.runtime,
      maxOutputTokens: 1024,
      prompt: [
        'Return ONLY minified JSON: {"title":"...","suggestions":["...","...","..."]}.',
        "No markdown, prose, or code fences.",
        "Title: 3-7 words, same language as the user when obvious.",
        "Suggestions: exactly 3 short follow-up prompts the user can click.",
        shouldGenerateTitle ? null : 'Use an empty string for "title".',
        shouldGenerateSuggestions
          ? null
          : 'Use an empty array for "suggestions".',
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
    logHandledWarning("Failed to generate chat automation artifacts", {
      error: error instanceof Error ? error.message : String(error),
    });
    const fallback = createFallbackArtifacts(input);
    return {
      title: shouldGenerateTitle ? fallback.title : input.fallbackTitle,
      suggestions: shouldGenerateSuggestions ? fallback.suggestions : [],
    };
  }
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
