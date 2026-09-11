import { encryptValue } from "@/lib/crypto";
import { logHandledError } from "@/lib/logger";
import { calculateOrchestrationUsageImpact } from "@/modules/agent/orchestration-usage-impact";
import {
  AgentExecutionError,
  executeAgent,
} from "@/modules/agent/runtime-executor";
import { createGenerationClock } from "@/modules/chat/generation-clock";
import {
  chatStreamIdempotencyKey,
  failChatStreamDueToTimeout,
  isChatStreamHardTimeoutAbort,
  startChatStreamLeaseHeartbeat,
} from "@/modules/chat/chat-stream-lease";
import { agentRuntimePolicy } from "@/modules/agent/runtime-policy";
import { normalizeChatMessageMetrics } from "@/modules/chat/message-metrics";
import {
  completeChatStream,
  createChatStreamResponse,
  createChatUIMessageStreamResponse,
  publishChatStreamEvent,
  registerChatStreamAbortController,
} from "@/modules/chat/stream-bus";
import { safeToolErrorMessage } from "@/modules/tool/safe-payload";
import { getUsageImpactSetting } from "@/modules/provider/usage-impact-settings";
import { db } from "@/server/infrastructure/db";
import {
  conversations,
  messageParts,
  messages,
} from "@/server/infrastructure/db/schema";
import { and, eq } from "drizzle-orm";

import { accumulateTokenCount } from "./route.accumulate-token-count";
import {
  chatStreamHeaders,
  type ChatExecutionContext,
} from "./route.execution-context";
import {
  createOrchestrationProgress,
  projectOrchestrationProgress,
} from "./route.orchestration-progress";

export function runOrchestratorChat(context: ChatExecutionContext) {
  const startedAt = Date.now();
  const {
    requestId,
    agentId,
    agent,
    actorUserId,
    version,
    conversation,
    userMessage,
    assistantMessage,
    continuationClaim,
    content,
    generationHistory,
    availableAttachments,
    useAiSdkUIStream,
  } = context;
  const streamAbortController = new AbortController();
  const streamGenerationId = assistantMessage.streamGenerationId;
  if (!streamGenerationId) {
    throw new Error("Chat stream generation is missing its lease identity");
  }
  registerChatStreamAbortController(
    assistantMessage.id,
    streamAbortController,
    streamGenerationId,
  );
  const enqueueEvent = (event: Record<string, unknown>) =>
    publishChatStreamEvent(assistantMessage.id, event, streamGenerationId);
  const hardTimeoutError =
    "Assistant generation timed out before it could finish. Try again with a narrower request.";
  const stopLeaseHeartbeat = startChatStreamLeaseHeartbeat(
    assistantMessage.id,
    streamGenerationId,
    streamAbortController,
    {
      hardTimeoutMs: agentRuntimePolicy.chatTimeoutMs,
      onHardTimeout: async () => {
        const transitioned = await failChatStreamDueToTimeout({
          messageId: assistantMessage.id,
          generationId: streamGenerationId,
          errorMessage: hardTimeoutError,
        });
        if (!transitioned) return;
        enqueueEvent({ type: "error", error: hardTimeoutError });
        completeChatStream(assistantMessage.id, streamGenerationId);
      },
    },
  );
  let completedRun: Awaited<ReturnType<typeof executeAgent>> | null = null;
  const initialSortOrder = continuationClaim?.nextSortOrder ?? 0;
  const generationClock = createGenerationClock(startedAt);
  const progress = createOrchestrationProgress({
    requestId,
    agentId,
    assistantMessageId: assistantMessage.id,
    streamGenerationId,
    enqueueEvent,
    initialSortOrder,
  });
  void (async () => {
    try {
      const result = await executeAgent({
        billingWorkspaceId:
          conversation.billingWorkspaceId ?? agent.workspaceId,
        workspaceId: agent.workspaceId,
        userId: actorUserId,
        agentId,
        agentVersionId: version.id,
        prompt: content,
        messages: generationHistory,
        availableAttachments,
        trigger: "chat",
        conversationId: conversation.id,
        messageId: assistantMessage.id,
        idempotencyKey: chatStreamIdempotencyKey(
          assistantMessage.id,
          streamGenerationId,
        ),
        abortSignal: streamAbortController.signal,
        onProgress: (event) => {
          generationClock.observe(
            event.type === "tool-start" ? "tool-call" : "tool-result",
            event.toolCallId || event.id,
          );
          progress.queue(event);
        },
        reasoningEffort: context.reasoningEffort,
      });
      completedRun = result;
      const timings = generationClock.snapshot();
      await progress.flush();
      const usageImpactSetting = await getUsageImpactSetting();
      const usageImpact = await calculateOrchestrationUsageImpact(
        result.usageBreakdown ?? [
          {
            modelId: version.modelId,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
          },
        ],
        usageImpactSetting.co2GramsPerKwh,
      );
      const completedAt = new Date();
      const encryptedText = result.text
        ? await encryptValue(result.text)
        : null;
      const durableDelegationParts = await Promise.all(
        progress.durableDelegationProgress.map(
          async ({ progress: event, sortOrder }) => {
            const projected = projectOrchestrationProgress(event);
            return {
              messageId: assistantMessage.id,
              type: projected.isStart
                ? ("tool-call" as const)
                : ("tool-result" as const),
              contentEncrypted: await encryptValue(
                JSON.stringify(projected.rawMetadata),
              ),
              metadataJson: projected.safeMetadata,
              sortOrder,
            };
          },
        ),
      );
      const completed = await db.transaction(async (tx) => {
        const [transitioned] = await tx
          .update(messages)
          .set({
            status: "completed",
            tokenInput: accumulateTokenCount(
              continuationClaim?.message.tokenInput ?? null,
              usageImpact.inputTokens,
            ),
            tokenOutput: accumulateTokenCount(
              continuationClaim?.message.tokenOutput ?? null,
              usageImpact.outputTokens,
            ),
            completedAt,
            streamLeaseExpiresAt: null,
          })
          .where(
            and(
              eq(messages.id, assistantMessage.id),
              eq(messages.status, "streaming"),
              eq(messages.streamGenerationId, streamGenerationId),
            ),
          )
          .returning({ id: messages.id });
        if (!transitioned) return false;
        if (durableDelegationParts.length > 0)
          await tx.insert(messageParts).values(durableDelegationParts);
        if (
          result.text &&
          continuationClaim?.appendableTextPart &&
          progress.nextSortOrder === initialSortOrder
        ) {
          await tx
            .update(messageParts)
            .set({
              contentEncrypted: await encryptValue(
                `${continuationClaim.appendableTextPart.content}${result.text}`,
              ),
            })
            .where(
              eq(messageParts.id, continuationClaim.appendableTextPart.id),
            );
        } else if (encryptedText) {
          await tx.insert(messageParts).values({
            messageId: assistantMessage.id,
            type: "text",
            contentEncrypted: encryptedText,
            sortOrder: progress.allocateSortOrder(),
          });
        }
        if (usageImpactSetting.enabled) {
          await tx.insert(messageParts).values({
            messageId: assistantMessage.id,
            type: "impact",
            contentEncrypted: await encryptValue(JSON.stringify(usageImpact)),
            metadataJson: usageImpact,
            sortOrder: progress.allocateSortOrder(),
          });
        }
        await tx
          .update(conversations)
          .set({
            agentId,
            agentVersionId: version.id,
            sidebarOrder: null,
            updatedAt: completedAt,
          })
          .where(eq(conversations.id, conversation.id));
        return true;
      });
      if (!completed) return;
      if (result.text) enqueueEvent({ type: "text", delta: result.text });
      if (usageImpactSetting.enabled)
        enqueueEvent({ type: "impact", impact: usageImpact });
      enqueueEvent({
        type: "done",
        metrics: normalizeChatMessageMetrics({
          inputTokens:
            (continuationClaim?.message.tokenInput ?? 0) +
            usageImpact.inputTokens,
          outputTokens:
            (continuationClaim?.message.tokenOutput ?? 0) +
            usageImpact.outputTokens,
          totalTokens:
            (continuationClaim?.message.tokenInput ?? 0) +
            usageImpact.inputTokens +
            (continuationClaim?.message.tokenOutput ?? 0) +
            usageImpact.outputTokens,
          durationMs: timings.durationMs,
          timeToFirstTokenMs: timings.timeToFirstTokenMs,
          generationMs: timings.generationMs,
          toolMs: timings.toolMs,
          thinkingMs: timings.thinkingMs,
        }),
      });
    } catch (error) {
      const aborted = streamAbortController.signal.aborted;
      const hardTimedOut = isChatStreamHardTimeoutAbort(
        streamAbortController.signal,
      );
      await progress.flush();
      const terminalAt = new Date();
      const transitioned = await db.transaction(async (tx) => {
        const [terminal] = await tx
          .update(messages)
          .set({
            status: aborted && !hardTimedOut ? "cancelled" : "failed",
            completedAt: terminalAt,
            streamLeaseExpiresAt: null,
          })
          .where(
            and(
              eq(messages.id, assistantMessage.id),
              eq(messages.status, "streaming"),
              eq(messages.streamGenerationId, streamGenerationId),
            ),
          )
          .returning({ id: messages.id });
        if (!terminal) return false;
        await tx
          .update(conversations)
          .set({ updatedAt: terminalAt })
          .where(eq(conversations.id, conversation.id));
        return true;
      });
      if (!transitioned) return;
      if (aborted && !hardTimedOut)
        enqueueEvent({ type: "done", stopped: true });
      else
        enqueueEvent({
          type: "error",
          error: completedRun
            ? "The agent run completed, but its response could not be saved. Open the run history to recover the result."
            : hardTimedOut
              ? hardTimeoutError
              : safeToolErrorMessage(
                  error,
                  "Orchestration failed. Review the run trace and try again.",
                ),
        });
      logHandledError(
        "Orchestrator chat run failed",
        {
          requestId,
          agentId,
          workspaceId: agent.workspaceId,
          conversationId: conversation.id,
          assistantMessageId: assistantMessage.id,
          errorCode:
            error instanceof AgentExecutionError
              ? error.code
              : "AGENT_RUN_FAILED",
          runId:
            error instanceof AgentExecutionError ? (error.runId ?? null) : null,
          errorDetail:
            error instanceof AgentExecutionError
              ? (error.safeDetail ?? null)
              : safeToolErrorMessage(error, "Agent run failed"),
        },
        error as Error,
      );
    } finally {
      try {
        await stopLeaseHeartbeat();
      } finally {
        completeChatStream(assistantMessage.id, streamGenerationId);
      }
    }
  })();
  const headers = chatStreamHeaders({ ...context, userMessage });
  return useAiSdkUIStream
    ? createChatUIMessageStreamResponse(assistantMessage.id, headers, {
        generationId: streamGenerationId,
      })
    : createChatStreamResponse(assistantMessage.id, headers, {
        generationId: streamGenerationId,
      });
}
