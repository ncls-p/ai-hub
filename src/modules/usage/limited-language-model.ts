import { eq } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import { aiModels } from "@/server/infrastructure/db/schema";
import { wrapLanguageModel } from "ai";
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Usage,
} from "@ai-sdk/provider";
import {
  reserveUsageLimits,
  settleUsageLimits,
  type UsageLimitContext,
} from "./usage-limits";

type Pricing = {
  inputTokenCost?: string | null;
  outputTokenCost?: string | null;
  maxOutputTokens?: number | null;
  contextWindow?: number | null;
};
function cost(input: number, output: number, pricing: Pricing) {
  if (pricing.inputTokenCost == null || pricing.outputTokenCost == null)
    return null;
  const result =
    (input * Number(pricing.inputTokenCost) +
      output * Number(pricing.outputTokenCost)) /
    1_000_000;
  return Number.isFinite(result) && result >= 0 ? result : null;
}
export function withUsageLimits(
  model: LanguageModelV4,
  context: UsageLimitContext,
  pricing: Pricing,
): LanguageModelV4 {
  async function reserve(params: LanguageModelV4CallOptions) {
    // Reserve conservatively using UTF-8 bytes, including tool definitions.
    const bytes = new TextEncoder().encode(
      JSON.stringify([params.prompt, params.tools]),
    ).byteLength;
    const multimodal = params.prompt.some(
      (message) =>
        message.role === "user" &&
        message.content.some((part) => part.type === "file"),
    );
    const input = multimodal
      ? pricing.contextWindow && pricing.contextWindow > 0
        ? Math.max(bytes, pricing.contextWindow)
        : null
      : bytes;
    const output = params.maxOutputTokens ?? pricing.maxOutputTokens ?? 4096;
    return reserveUsageLimits(context, {
      tokens: input === null ? null : input + output,
      costUsd: input === null ? null : cost(input, output, pricing),
    });
  }
  function actual(usage: LanguageModelV4Usage) {
    const input = usage.inputTokens.total;
    const output = usage.outputTokens.total;
    return input === undefined || output === undefined
      ? undefined
      : { tokens: input + output, costUsd: cost(input, output, pricing) };
  }
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: "v4",
      transformParams: async ({ params }) => ({
        ...params,
        maxOutputTokens:
          params.maxOutputTokens ?? pricing.maxOutputTokens ?? 4096,
      }),
      wrapGenerate: async ({ doGenerate, params }) => {
        const id = await reserve(params);
        try {
          const result = await doGenerate();
          await settleUsageLimits(id, actual(result.usage));
          return result;
        } catch (error) {
          await settleUsageLimits(id);
          throw error;
        }
      },
      wrapStream: async ({ doStream, params }) => {
        const id = await reserve(params);
        try {
          const result = await doStream();
          const reader = result.stream.getReader();
          let settled = false;
          const settle = async (usage?: LanguageModelV4Usage) => {
            if (!settled) {
              settled = true;
              await settleUsageLimits(id, usage ? actual(usage) : undefined);
            }
          };
          return {
            ...result,
            stream: new ReadableStream({
              async pull(controller) {
                try {
                  const item = await reader.read();
                  if (item.done) {
                    await settle();
                    controller.close();
                    return;
                  }
                  if (item.value.type === "finish")
                    await settle(item.value.usage);
                  controller.enqueue(item.value);
                } catch (error) {
                  await settle();
                  controller.error(error);
                }
              },
              async cancel(reason) {
                try {
                  await reader.cancel(reason);
                } finally {
                  await settle();
                }
              },
            }),
          };
        } catch (error) {
          await settleUsageLimits(id);
          throw error;
        }
      },
    },
  });
}

export async function applyUsageLimits(
  model: LanguageModelV4,
  context: UsageLimitContext,
) {
  const [pricing] = context.modelId
    ? await db
        .select({
          inputTokenCost: aiModels.inputTokenCost,
          outputTokenCost: aiModels.outputTokenCost,
          maxOutputTokens: aiModels.maxOutputTokens,
          contextWindow: aiModels.contextWindow,
        })
        .from(aiModels)
        .where(eq(aiModels.id, context.modelId))
        .limit(1)
    : [];
  return withUsageLimits(model, context, pricing ?? {});
}
