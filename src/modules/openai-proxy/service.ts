import { applyUsageLimits } from "@/modules/usage/limited-language-model";
import type { JSONValue } from "@ai-sdk/provider";
import { generateText, streamText } from "ai";

import { recordUsageEvent } from "@/modules/agent/use-cases";
import type {
  ChatCompletionRequest,
  ResponsesRequest,
} from "@/modules/openai-proxy/contracts";
import { OpenAIProxyError, providerError } from "@/modules/openai-proxy/errors";
import { resolveOpenAIProxyModel } from "@/modules/openai-proxy/model-catalog";
import {
  prepareChatCompletion,
  prepareResponsesRequest,
  type PreparedProxyGeneration,
} from "@/modules/openai-proxy/request-mapper";
import {
  buildChatCompletionResponse,
  buildResponsesResponse,
} from "@/modules/openai-proxy/response-builders";
import {
  createChatCompletionStream,
  createResponsesStream,
} from "@/modules/openai-proxy/streams";
import {
  calculateTokenUsageImpact,
  parseSustainabilityConfig,
} from "@/modules/provider/model-runtime-config";
import { assertWorkspaceWithinTokenQuota } from "@/modules/usage/quota";

type ProxyExecutionContext = {
  workspaceId: string;
  userId: string;
};

function compactObject(values: Record<string, JSONValue | undefined>) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Record<string, JSONValue>;
}

function providerOptionsFor(
  provider: string,
  values: Record<string, JSONValue | undefined>,
) {
  const compact = compactObject(values);
  if (!provider.endsWith(".chat")) return compact;

  const {
    parallelToolCalls,
    serviceTier,
    safetyIdentifier,
    promptCacheKey,
    ...knownOptions
  } = compact;
  return compactObject({
    ...knownOptions,
    parallel_tool_calls: parallelToolCalls,
    service_tier: serviceTier,
    safety_identifier: safetyIdentifier,
    prompt_cache_key: promptCacheKey,
  });
}

export function generationOptions(input: {
  prepared: PreparedProxyGeneration;
  model: Awaited<ReturnType<typeof resolveOpenAIProxyModel>>;
  signal: AbortSignal;
}) {
  const { prepared, model, signal } = input;
  const provider = model.languageModel.provider;
  const options = providerOptionsFor(provider, prepared.providerOptions);
  const providerOptionsName = provider.endsWith(".responses")
    ? "openai"
    : provider.split(".")[0]?.trim();
  return {
    model: model.languageModel,
    messages: prepared.messages,
    tools: prepared.tools,
    toolChoice: prepared.toolChoice,
    output: prepared.output,
    maxOutputTokens: prepared.maxOutputTokens,
    temperature: prepared.temperature,
    topP: prepared.topP,
    topK: prepared.topK,
    presencePenalty: prepared.presencePenalty,
    frequencyPenalty: prepared.frequencyPenalty,
    seed: prepared.seed,
    stopSequences: prepared.stopSequences,
    maxRetries: 2,
    abortSignal: signal,
    ...(Object.keys(options).length > 0 && providerOptionsName
      ? { providerOptions: { [providerOptionsName]: options } }
      : {}),
  };
}

export async function prepareExecution(
  context: ProxyExecutionContext,
  requestedModel: string,
) {
  const quota = await assertWorkspaceWithinTokenQuota(context.workspaceId);
  if (!quota.allowed) {
    throw new OpenAIProxyError(
      quota.message,
      429,
      "rate_limit_error",
      "insufficient_quota",
    );
  }
  const resolved = await resolveOpenAIProxyModel(
    context.workspaceId,
    requestedModel,
  );
  resolved.languageModel = await applyUsageLimits(resolved.languageModel, {
    userId: context.userId,
    workspaceId: context.workspaceId,
    providerId: resolved.providerId,
    modelId: resolved.modelRecordId,
  });
  return resolved;
}

export function usageRecorder(input: {
  context: ProxyExecutionContext;
  model: Awaited<ReturnType<typeof resolveOpenAIProxyModel>>;
  operation:
    | "openai.chat.completions"
    | "openai.responses"
    | "anthropic.messages";
  startedAt: number;
}) {
  let recorded = false;
  return {
    async success(usage: {
      inputTokens: number | undefined;
      outputTokens: number | undefined;
    }) {
      if (recorded) return;
      recorded = true;
      const sustainability = parseSustainabilityConfig(
        input.model.sustainabilityConfig,
      );
      const impact = calculateTokenUsageImpact({
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        inputCostPerMillion: input.model.inputTokenCost,
        outputCostPerMillion: input.model.outputTokenCost,
        sustainability,
        currency: sustainability.currency,
      });
      await recordUsageEvent({
        workspaceId: input.context.workspaceId,
        userId: input.context.userId,
        providerId: input.model.providerId,
        modelId: input.model.modelRecordId,
        operation: input.operation,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd:
          impact.cost !== null && impact.currency === "USD"
            ? String(impact.cost)
            : undefined,
        metadataJson: {
          currency: impact.currency,
          cost: impact.cost,
          energyKwh: impact.energyKwh,
          co2Grams: impact.co2Grams,
        },
        latencyMs: Date.now() - input.startedAt,
        status: "success",
      });
    },
    async failure() {
      if (recorded) return;
      recorded = true;
      await recordUsageEvent({
        workspaceId: input.context.workspaceId,
        userId: input.context.userId,
        providerId: input.model.providerId,
        modelId: input.model.modelRecordId,
        operation: input.operation,
        latencyMs: Date.now() - input.startedAt,
        status: "failed",
      });
    },
  };
}

export async function executeChatCompletion(input: {
  context: ProxyExecutionContext;
  request: ChatCompletionRequest;
  signal: AbortSignal;
}) {
  const startedAt = Date.now();
  const prepared = prepareChatCompletion(input.request);
  const model = await prepareExecution(input.context, input.request.model);
  const recorder = usageRecorder({
    context: input.context,
    model,
    operation: "openai.chat.completions",
    startedAt,
  });
  const options = generationOptions({ prepared, model, signal: input.signal });

  if (input.request.stream) {
    try {
      const result = streamText(options);
      return createChatCompletionStream({
        request: input.request,
        result,
        callbacks: {
          onComplete: (usage) => recorder.success(usage),
          onError: () => recorder.failure(),
        },
      });
    } catch (error) {
      await recorder.failure();
      throw providerError(error);
    }
  }

  try {
    const result = await generateText(options);
    await recorder.success(result.usage);
    return Response.json(
      buildChatCompletionResponse({ request: input.request, result }),
    );
  } catch (error) {
    await recorder.failure();
    throw providerError(error);
  }
}

export async function executeResponses(input: {
  context: ProxyExecutionContext;
  request: ResponsesRequest;
  signal: AbortSignal;
}) {
  const startedAt = Date.now();
  const prepared = prepareResponsesRequest(input.request);
  const model = await prepareExecution(input.context, input.request.model);
  const recorder = usageRecorder({
    context: input.context,
    model,
    operation: "openai.responses",
    startedAt,
  });
  const options = generationOptions({ prepared, model, signal: input.signal });

  if (input.request.stream) {
    try {
      const result = streamText(options);
      return createResponsesStream({
        request: input.request,
        responseFormat: prepared.responseFormat,
        result,
        callbacks: {
          onComplete: (usage) => recorder.success(usage),
          onError: () => recorder.failure(),
        },
      });
    } catch (error) {
      await recorder.failure();
      throw providerError(error);
    }
  }

  try {
    const result = await generateText(options);
    await recorder.success(result.usage);
    return Response.json(
      buildResponsesResponse({
        request: input.request,
        responseFormat: prepared.responseFormat,
        result,
      }),
    );
  } catch (error) {
    await recorder.failure();
    throw providerError(error);
  }
}
