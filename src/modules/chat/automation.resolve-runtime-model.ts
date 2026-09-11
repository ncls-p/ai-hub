import { automationModelAvailability } from "./automation.model-availability";
import { generateText } from "ai";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { decryptValue } from "@/lib/crypto";
import { normalizeOpenAICompatibleApiRoute } from "@/lib/openai-compatible-api";
import {
  agentRuntimePolicy,
  createRuntimeDeadline,
} from "@/modules/agent/runtime-policy";
import { db } from "@/server/infrastructure/db";
import {
  aiModels,
  aiProviders,
  workspaces,
} from "@/server/infrastructure/db/schema";
import {
  getAdapter,
  type ProviderKind,
} from "@/server/infrastructure/providers";
import {
  ChatAutomationConfig,
  ResolveRuntimeResult,
  getChatAutomationConfig,
  validateChatAutomationConfig,
} from "./automation.chat-automation-config";

export async function resolveRuntimeModel(
  config: ChatAutomationConfig,
  organizationId: string,
): Promise<ResolveRuntimeResult> {
  if (!config.enabled) {
    return {
      ok: false,
      reason: "Automation is disabled or provider/model is not configured.",
    };
  }
  if (!config.providerId) {
    return {
      ok: false,
      reason: "Automation is disabled or provider/model is not configured.",
    };
  }
  if (!config.modelId) {
    return {
      ok: false,
      reason: "Automation is disabled or provider/model is not configured.",
    };
  }
  const { providerId, modelId } = config;

  const [provider] = await db
    .select()
    .from(aiProviders)
    .where(
      and(
        eq(aiProviders.id, providerId),
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
        eq(aiModels.id, modelId),
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

  const [scope] = await db
    .select({ id: aiModels.id })
    .from(aiModels)
    .innerJoin(aiProviders, eq(aiProviders.id, aiModels.providerId))
    .innerJoin(workspaces, eq(workspaces.id, aiProviders.workspaceId))
    .where(
      and(
        eq(aiModels.id, modelId),
        eq(aiProviders.id, providerId),
        automationModelAvailability(organizationId),
        isNull(workspaces.archivedAt),
      ),
    )
    .limit(1);
  if (!scope)
    return {
      ok: false,
      reason: "The selected provider is not available to this organization.",
    };

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
        openaiCompatibleApiRoute: normalizeOpenAICompatibleApiRoute(
          provider.openaiCompatibleApiRoute,
        ),
      },
    },
  };
}

export async function testChatAutomationConnection(
  organizationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = await getChatAutomationConfig(organizationId);
  const validation = await validateChatAutomationConfig(config, organizationId);
  if (!validation.ok) {
    return {
      ok: false,
      error: validation.issues.map((issue) => issue.message).join(" "),
    };
  }

  const resolved = await resolveRuntimeModel(config, organizationId);
  if (!resolved.ok) {
    return { ok: false, error: resolved.reason };
  }

  try {
    const adapter = getAdapter(resolved.runtime.providerKind);
    const runtimeDeadline = createRuntimeDeadline(
      agentRuntimePolicy.automationTimeoutMs,
    );
    const result = await generateText({
      model: adapter.createChatModel(
        resolved.runtime.runtimeConfig,
        resolved.runtime.modelId,
      ),
      prompt: 'Reply with only the JSON object {"ok":true}.',
      temperature: 0,
      maxOutputTokens: 64,
      abortSignal: runtimeDeadline.signal,
    });
    const output =
      `${result.text}${reasoningTextFromParts(result.finalStep.reasoning)}`.trim();
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

export const chatArtifactsSchema = z.object({
  title: z.string().default(""),
  suggestions: z.array(z.string()).default([]),
});

export type ReasoningLikePart = {
  type: string;
  text?: string;
};

export function reasoningTextFromParts(
  reasoning: ReasoningLikePart[] | undefined,
) {
  return (
    reasoning
      ?.map((part) =>
        part.type === "reasoning" && typeof part.text === "string"
          ? part.text
          : "",
      )
      .join("\n")
      .trim() ?? ""
  );
}

export function extractJsonObjectCandidate(value: string) {
  const cleaned = value
    .replace(/^```(?:json|text)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return cleaned;
  return cleaned.slice(jsonStart, jsonEnd + 1);
}
