import { encryptValue } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { getChatUsageMetricsByMessageId } from "@/modules/agent/use-cases.get-conversation-messages";
import { generateChatAutomationArtifacts } from "@/modules/chat/automation";
import {
  generateConversationSummary,
  shouldSummarizeConversation,
  type ConversationSummaryPolicy,
} from "@/modules/chat/conversation-summary";
import {
  chatMessageMetricsFromUsage,
  previousMetricsForContinuation,
  type ChatGenerationTimings,
} from "@/modules/chat/message-metrics";
import { consumeSkipNextChatSuggestions } from "@/modules/chat/suggestion-skip";
import {
  calculateTokenUsageImpact,
  parseSustainabilityConfig,
} from "@/modules/provider/model-runtime-config";
import { getUsageImpactSetting } from "@/modules/provider/usage-impact-settings";
import { db } from "@/server/infrastructure/db";
import {
  aiModels,
  conversations,
  messageParts,
  messages,
  usageEvents,
} from "@/server/infrastructure/db/schema";
import type { LanguageModel, LanguageModelUsage } from "ai";
import { and, eq } from "drizzle-orm";

import { accumulateTokenCount } from "./route.accumulate-token-count";
import type { ChatExecutionContext } from "./route.execution-context";
import type { StreamedPartWriter } from "./route.streamed-parts";

export async function completeStandardChat(input: {
  context: ChatExecutionContext;
  model: LanguageModel;
  totalUsage: LanguageModelUsage;
  partWriter: StreamedPartWriter;
  postCompletionAutomationRef: { current: (() => Promise<void>) | null };
  startedAt: number;
  timings: ChatGenerationTimings;
  enqueueEvent: (event: Record<string, unknown>) => void;
}) {
  const { context, totalUsage, partWriter } = input;
  const {
    providerConfig,
    continuationClaim,
    conversation,
    content,
    shouldRegenerateConversationTitle,
    assistantMessage,
    agentId,
    version,
    agent,
    actorUserId,
    requestId,
  } = context;
  const [usageModel, usageImpactSetting] = await Promise.all([
    providerConfig.modelRecordId
      ? db
          .select({
            inputTokenCost: aiModels.inputTokenCost,
            outputTokenCost: aiModels.outputTokenCost,
            sustainabilityConfigJson: aiModels.sustainabilityConfigJson,
          })
          .from(aiModels)
          .where(eq(aiModels.id, providerConfig.modelRecordId))
          .limit(1)
          .then((rows) => rows[0])
      : Promise.resolve(undefined),
    getUsageImpactSetting(),
  ]);
  const sustainability = parseSustainabilityConfig(
    usageModel?.sustainabilityConfigJson,
  );
  const calculateImpact = (inputTokens: number, outputTokens: number) =>
    calculateTokenUsageImpact({
      inputTokens,
      outputTokens,
      inputCostPerMillion: usageModel?.inputTokenCost,
      outputCostPerMillion: usageModel?.outputTokenCost,
      sustainability,
      currency: sustainability.currency,
      co2GramsPerKwh: usageImpactSetting.co2GramsPerKwh,
    });
  const eventUsageImpact = calculateImpact(
    totalUsage.inputTokens ?? 0,
    totalUsage.outputTokens ?? 0,
  );
  const displayedUsageImpact = calculateImpact(
    (continuationClaim?.message.tokenInput ?? 0) +
      (totalUsage.inputTokens ?? 0),
    (continuationClaim?.message.tokenOutput ?? 0) +
      (totalUsage.outputTokens ?? 0),
  );
  const assistantText = partWriter.parts
    .flatMap((part) =>
      part.type === "text" && "content" in part ? [part.content] : [],
    )
    .join("\n")
    .trim();
  const memoryPolicy =
    version.memoryPolicyJson as ConversationSummaryPolicy | null;
  let conversationSummary: string | null = null;
  if (
    assistantText &&
    shouldSummarizeConversation(memoryPolicy, totalUsage.inputTokens)
  ) {
    try {
      conversationSummary = await generateConversationSummary({
        model: input.model,
        history: context.generationHistory,
        assistantText,
        maxOutputTokens:
          (version.maxOutputTokens ?? 0) > 0
            ? Math.min(
                memoryPolicy?.summaryMaxTokens ?? 1_200,
                version.maxOutputTokens!,
              )
            : (memoryPolicy?.summaryMaxTokens ?? 1_200),
      });
    } catch (error) {
      logger.warn("Conversation summary generation failed", {
        conversationId: conversation.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const postCompletionAutomation = async () => {
    const shouldSkipSuggestions = consumeSkipNextChatSuggestions(
      conversation.id,
    );
    const artifacts = assistantText
      ? await generateChatAutomationArtifacts({
          userId: actorUserId,
          workspaceId: conversation.billingWorkspaceId ?? agent.workspaceId,
          userMessage: content,
          assistantText,
          fallbackTitle: conversation.title,
          generateSuggestions: !shouldSkipSuggestions,
        })
      : { title: conversation.title, suggestions: [] };
    const generatedTitle = shouldRegenerateConversationTitle
      ? artifacts.title
      : conversation.title;
    if (artifacts.suggestions.length > 0)
      await partWriter.appendSuggestions(artifacts.suggestions);
    if (
      shouldRegenerateConversationTitle &&
      generatedTitle.trim() &&
      generatedTitle.trim() !== conversation.title.trim()
    )
      await db.transaction(async (tx) => {
        const [ownedGeneration] = await tx
          .select({ id: messages.id })
          .from(messages)
          .where(
            and(
              eq(messages.id, assistantMessage.id),
              eq(messages.status, "completed"),
              eq(
                messages.streamGenerationId,
                assistantMessage.streamGenerationId!,
              ),
            ),
          )
          .for("update")
          .limit(1);
        if (!ownedGeneration) return;
        await tx
          .update(conversations)
          .set({ title: generatedTitle, updatedAt: new Date() })
          .where(eq(conversations.id, conversation.id));
      });
  };
  const previousUsageMetrics = continuationClaim
    ? (await getChatUsageMetricsByMessageId(conversation.id)).get(
        assistantMessage.id,
      )
    : undefined;
  const metrics = chatMessageMetricsFromUsage(
    totalUsage,
    input.timings,
    previousMetricsForContinuation(
      {
        tokenInput: continuationClaim?.message.tokenInput,
        tokenOutput: continuationClaim?.message.tokenOutput,
      },
      previousUsageMetrics,
    ),
  );
  const completedAt = new Date();
  const completed = await db.transaction(async (tx) => {
    const [transitioned] = await tx
      .update(messages)
      .set({
        status: "completed",
        tokenInput: accumulateTokenCount(
          continuationClaim?.message.tokenInput ?? null,
          totalUsage.inputTokens,
        ),
        tokenOutput: accumulateTokenCount(
          continuationClaim?.message.tokenOutput ?? null,
          totalUsage.outputTokens,
        ),
        completedAt,
        streamLeaseExpiresAt: null,
      })
      .where(
        and(
          eq(messages.id, assistantMessage.id),
          eq(messages.status, "streaming"),
          eq(messages.streamGenerationId, assistantMessage.streamGenerationId!),
        ),
      )
      .returning({ id: messages.id });
    if (!transitioned) return false;
    await tx
      .update(conversations)
      .set({
        agentId,
        agentVersionId: version.id,
        sidebarOrder: null,
        updatedAt: completedAt,
        ...(conversationSummary
          ? {
              summaryEncrypted: await encryptValue(conversationSummary),
              summaryThroughMessageId: assistantMessage.id,
              summaryTokenCount: totalUsage.inputTokens ?? null,
              summaryUpdatedAt: completedAt,
            }
          : {}),
      })
      .where(eq(conversations.id, conversation.id));
    await tx.insert(usageEvents).values({
      workspaceId: agent.workspaceId,
      userId: actorUserId,
      providerId: providerConfig.providerId,
      modelId: providerConfig.modelRecordId,
      agentId,
      conversationId: conversation.id,
      operation: "chat",
      inputTokens: totalUsage.inputTokens || null,
      outputTokens: totalUsage.outputTokens || null,
      costUsd:
        eventUsageImpact.cost === null || eventUsageImpact.currency !== "USD"
          ? null
          : String(eventUsageImpact.cost),
      latencyMs: Date.now() - input.startedAt,
      status: "success",
      metadataJson: {
        currency: eventUsageImpact.currency,
        cost: eventUsageImpact.cost,
        energyKwh: eventUsageImpact.energyKwh,
        co2Grams: eventUsageImpact.co2Grams,
        messageId: assistantMessage.id,
        durationMs: metrics?.durationMs ?? input.timings.durationMs,
        timeToFirstTokenMs: metrics?.timeToFirstTokenMs ?? null,
        generationMs: metrics?.generationMs ?? null,
        toolMs: metrics?.toolMs ?? null,
        thinkingMs: metrics?.thinkingMs ?? null,
        cacheReadTokens: metrics?.cacheReadTokens ?? null,
        cacheWriteTokens: metrics?.cacheWriteTokens ?? null,
        reasoningTokens: metrics?.reasoningTokens ?? null,
      },
    });
    if (usageImpactSetting.enabled)
      await tx.insert(messageParts).values({
        messageId: assistantMessage.id,
        type: "impact",
        contentEncrypted: await encryptValue(
          JSON.stringify(displayedUsageImpact),
        ),
        metadataJson: displayedUsageImpact,
        sortOrder: partWriter.nextSortOrder,
      });
    if (conversationSummary)
      await tx.insert(messageParts).values({
        messageId: assistantMessage.id,
        type: "summary",
        contentEncrypted: await encryptValue(conversationSummary),
        metadataJson: { inputTokens: totalUsage.inputTokens ?? null },
        sortOrder: partWriter.nextSortOrder + 1,
      });
    return true;
  });
  if (!completed) return false;
  input.postCompletionAutomationRef.current = postCompletionAutomation;
  logger.info("Chat stream completed", {
    requestId,
    agentId,
    agentVersionId: version.id,
    workspaceId: agent.workspaceId,
    userId: actorUserId,
    conversationId: conversation.id,
    assistantMessageId: assistantMessage.id,
    inputTokens: totalUsage.inputTokens,
    outputTokens: totalUsage.outputTokens,
    latencyMs: Date.now() - input.startedAt,
  });
  if (usageImpactSetting.enabled)
    input.enqueueEvent({ type: "impact", impact: displayedUsageImpact });
  if (conversationSummary)
    input.enqueueEvent({
      type: "summary",
      summary: conversationSummary,
      inputTokens: totalUsage.inputTokens ?? null,
    });
  input.enqueueEvent({
    type: "done",
    metrics,
  });
  return true;
}
