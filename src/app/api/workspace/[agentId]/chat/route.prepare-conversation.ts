import { encryptValue } from "@/lib/crypto";
import { isUniqueConstraintError } from "@/lib/database-errors";
import {
  getActiveVersion,
  resolveProviderForVersion,
} from "@/modules/agent/use-cases";
import type { AssistantContinuationClaim } from "@/modules/chat/continuation";
import { claimAssistantContinuation } from "@/modules/chat/continuation";
import type { ChatAttachment } from "@/modules/chat/attachments";
import {
  chatStreamLeaseValues,
  reapExpiredChatStreams,
} from "@/modules/chat/chat-stream-lease";
import { withConversationGraphLock } from "@/modules/chat/conversation-graph-lock";
import { forkConversationForRegeneration } from "@/modules/chat/conversation-branches";
import {
  forkSharedConversation,
  getConversationAccess,
} from "@/modules/chat/conversation-sharing";
import {
  DEFAULT_EPHEMERAL_TTL_MINUTES,
  ephemeralExpiresAt,
} from "@/modules/chat/ephemeral-retention";
import { db } from "@/server/infrastructure/db";
import {
  conversations,
  messageParts,
  messages,
} from "@/server/infrastructure/db/schema";
import { and, eq, inArray } from "drizzle-orm";

import {
  findUserMessageForResend,
  isFirstUserMessageInConversation,
  mergeUserFilePartMetadata,
} from "./route-support";
import type { ChatAgentRow } from "./route.execution-context";
import {
  normalizeReasoningPresets,
  type ReasoningPreset,
} from "@/modules/agent/reasoning-presets";
import {
  resolveMaxInputCharacters,
  type ConversationContextPolicy,
} from "@/modules/chat/conversation-context-policy";
import { truncateConversationMessages } from "@/modules/chat/conversation-message-mutations";

type RejectRequest = (
  status: number,
  reason: string,
  body: unknown,
  context?: Record<string, unknown>,
) => Response;

type PrepareChatConversationInput = {
  billingWorkspaceId?: string;
  agent: ChatAgentRow;
  actorUserId: string;
  agentId: string;
  content: string;
  existingConversationId?: string | null;
  ephemeral?: boolean;
  ephemeralTtlMinutes?: number;
  resendFromMessageId?: string | null;
  regenerateAssistantMessageId?: string | null;
  continueFromMessageId?: string | null;
  codeWorkspaceAttachment: unknown;
  messageAttachments: ChatAttachment[];
  reasoningEffort?: ReasoningPreset;
  rejectChatRequest: RejectRequest;
};

export async function prepareChatConversation(
  input: PrepareChatConversationInput,
) {
  if (!input.existingConversationId) {
    return prepareChatConversationUnlocked(input);
  }

  // Serialize every history-changing action for a conversation. The lock is
  // held only during preparation; provider execution remains fully detached.
  // This prevents a losing resend/regenerate request from truncating history
  // before the active-assistant uniqueness constraint rejects it.
  return withConversationGraphLock(input.existingConversationId, () =>
    prepareChatConversationUnlocked(input),
  );
}

async function prepareChatConversationUnlocked(
  input: PrepareChatConversationInput,
) {
  const {
    agent,
    actorUserId,
    agentId,
    content,
    existingConversationId,
    ephemeral = false,
    ephemeralTtlMinutes,
    resendFromMessageId,
    regenerateAssistantMessageId,
    continueFromMessageId,
    codeWorkspaceAttachment,
    messageAttachments,
    reasoningEffort,
    rejectChatRequest,
  } = input;
  let conversation: typeof conversations.$inferSelect | null = null;
  let createdConversation = false;
  let effectiveResendFromMessageId = resendFromMessageId;
  if (existingConversationId) {
    const access = await getConversationAccess(
      existingConversationId,
      actorUserId,
    );
    const existing = access?.conversation;
    if (
      existing &&
      existing.workspaceId === agent.workspaceId &&
      existing.agentId === agentId &&
      (!existing.expiresAt || existing.expiresAt > new Date())
    ) {
      if (access.role === "recipient") {
        if (
          !access.canContinue ||
          resendFromMessageId ||
          regenerateAssistantMessageId ||
          continueFromMessageId
        ) {
          return rejectChatRequest(403, "conversation_read_only", {
            error: "This shared conversation is read-only",
          });
        }
        if (access.continuationMode === "fork") {
          try {
            conversation = await forkSharedConversation(existing, actorUserId);
          } catch (error) {
            return rejectChatRequest(
              409,
              "shared_conversation_still_streaming",
              {
                error:
                  error instanceof Error
                    ? error.message
                    : "Wait for the shared response to finish before continuing",
              },
            );
          }
        } else {
          conversation = existing;
        }
        createdConversation = access.continuationMode === "fork";
      } else {
        conversation = existing;
      }
    }

    if (
      !conversation &&
      (resendFromMessageId ||
        regenerateAssistantMessageId ||
        continueFromMessageId)
    ) {
      return rejectChatRequest(
        404,
        "conversation_not_found",
        { error: "Conversation not found" },
        {
          agentId,
          workspaceId: agent.workspaceId,
          userId: actorUserId,
          conversationId: existingConversationId,
          resendFromMessageId,
          continueFromMessageId,
        },
      );
    }
  }

  if (
    !conversation &&
    (resendFromMessageId ||
      regenerateAssistantMessageId ||
      continueFromMessageId)
  ) {
    return rejectChatRequest(
      400,
      "message_action_without_conversation",
      { error: "Cannot modify a response without an existing conversation" },
      {
        agentId,
        workspaceId: agent.workspaceId,
        userId: actorUserId,
        resendFromMessageId,
        continueFromMessageId,
      },
    );
  }

  const version = await getActiveVersion(agentId);

  if (!version) {
    return rejectChatRequest(
      400,
      "no_active_agent_version",
      { error: "No active agent version configured" },
      { agentId, workspaceId: agent.workspaceId, userId: actorUserId },
    );
  }

  const contextPolicy =
    version.memoryPolicyJson as ConversationContextPolicy | null;
  const maxInputCharacters = resolveMaxInputCharacters(contextPolicy);
  if (content.length > maxInputCharacters) {
    return rejectChatRequest(
      400,
      "message_too_long",
      {
        error: `Message is too long (${content.length} characters). This assistant accepts at most ${maxInputCharacters} characters per message.`,
        code: "message_too_long",
        actual: content.length,
        maximum: maxInputCharacters,
      },
      { agentId, workspaceId: agent.workspaceId, userId: actorUserId },
    );
  }

  const generationSettings = version.generationSettingsJson as {
    reasoningPresets?: unknown;
  } | null;
  if (
    reasoningEffort &&
    !normalizeReasoningPresets(generationSettings?.reasoningPresets).includes(
      reasoningEffort,
    )
  ) {
    return rejectChatRequest(
      400,
      "reasoning_effort_not_enabled",
      { error: "This reasoning level is not enabled for the assistant" },
      { agentId, workspaceId: agent.workspaceId, userId: actorUserId },
    );
  }

  const providerConfig = await resolveProviderForVersion(version);
  if (!providerConfig || !providerConfig.modelId) {
    return rejectChatRequest(
      400,
      "no_provider_model",
      { error: "No provider model configured for this agent version" },
      {
        agentId,
        workspaceId: agent.workspaceId,
        userId: actorUserId,
        agentVersionId: version.id,
      },
    );
  }

  if (!conversation) {
    const retentionMinutes =
      ephemeralTtlMinutes ?? DEFAULT_EPHEMERAL_TTL_MINUTES;
    const [newConversation] = await db
      .insert(conversations)
      .values({
        billingWorkspaceId: input.billingWorkspaceId ?? agent.workspaceId,
        workspaceId: agent.workspaceId,
        agentId,
        agentVersionId: version.id,
        userId: actorUserId,
        title: content.slice(0, 100),
        status: "active",
        isEphemeral: ephemeral,
        ephemeralTtlMinutes: retentionMinutes,
        expiresAt: ephemeral ? ephemeralExpiresAt(retentionMinutes) : null,
      })
      .returning();
    conversation = newConversation;
    createdConversation = true;
  } else if (conversation.isEphemeral) {
    const retentionMinutes =
      ephemeralTtlMinutes ?? conversation.ephemeralTtlMinutes;
    const [refreshedConversation] = await db
      .update(conversations)
      .set({
        ephemeralTtlMinutes: retentionMinutes,
        expiresAt: ephemeralExpiresAt(retentionMinutes),
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversation.id))
      .returning();
    conversation = refreshedConversation;
  }

  // Existing conversations can reference archived/deleted versions; fail safely.
  if (version.agentId !== agentId) {
    return rejectChatRequest(
      400,
      "invalid_conversation_version",
      { error: "Invalid conversation version" },
      {
        agentId,
        workspaceId: agent.workspaceId,
        userId: actorUserId,
        agentVersionId: version.id,
        conversationId: conversation.id,
      },
    );
  }

  let activeAssistantMessage: { id: string } | undefined = (
    await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversation.id),
          eq(messages.role, "assistant"),
          inArray(messages.status, ["pending", "streaming"]),
        ),
      )
      .limit(1)
  )[0];
  if (activeAssistantMessage) {
    const expired = await reapExpiredChatStreams(new Date(), [
      activeAssistantMessage.id,
    ]);
    if (expired.length > 0) activeAssistantMessage = undefined;
  }
  if (activeAssistantMessage) {
    return rejectChatRequest(
      409,
      "conversation_already_streaming",
      { error: "This conversation already has a response in progress" },
      {
        agentId,
        workspaceId: agent.workspaceId,
        userId: actorUserId,
        conversationId: conversation.id,
        assistantMessageId: activeAssistantMessage.id,
      },
    );
  }

  if (regenerateAssistantMessageId) {
    try {
      const regeneration = await forkConversationForRegeneration({
        source: conversation,
        assistantMessageId: regenerateAssistantMessageId,
        userId: actorUserId,
      });
      conversation = regeneration.fork;
      effectiveResendFromMessageId = regeneration.copiedUserMessageId;
    } catch (error) {
      return rejectChatRequest(
        409,
        "response_cannot_be_regenerated",
        {
          error:
            error instanceof Error
              ? error.message
              : "Response cannot be regenerated",
        },
        {
          agentId,
          workspaceId: agent.workspaceId,
          userId: actorUserId,
          conversationId: conversation.id,
          regenerateAssistantMessageId,
        },
      );
    }
  }

  let continuationClaim: Extract<
    AssistantContinuationClaim,
    { status: "claimed" }
  > | null = null;
  if (continueFromMessageId) {
    const claim = await claimAssistantContinuation({
      conversationId: conversation.id,
      messageId: continueFromMessageId,
      providerId: providerConfig.providerId,
      modelId: providerConfig.modelId,
    });
    if (claim.status !== "claimed") {
      const status = claim.status === "already_streaming" ? 409 : 404;
      return rejectChatRequest(
        status,
        `continuation_${claim.status}`,
        {
          error:
            claim.status === "already_streaming"
              ? "This response is already streaming"
              : "Only the latest assistant response can be continued",
        },
        {
          agentId,
          workspaceId: agent.workspaceId,
          userId: actorUserId,
          conversationId: conversation.id,
          continueFromMessageId,
        },
      );
    }
    continuationClaim = claim;
  }

  let userMessage: typeof messages.$inferSelect | null = null;
  let createdUserMessage = false;
  if (continueFromMessageId) {
    // The continuation prompt is model-only context. It must never become a
    // visible or persisted user message.
  } else if (effectiveResendFromMessageId) {
    const existingUserMessage = await findUserMessageForResend({
      conversationId: conversation.id,
      messageId: effectiveResendFromMessageId,
      content,
    });

    if (!existingUserMessage) {
      return rejectChatRequest(
        404,
        "message_not_found_for_resend",
        { error: "Message not found" },
        {
          agentId,
          workspaceId: agent.workspaceId,
          userId: actorUserId,
          conversationId: conversation.id,
          resendFromMessageId: effectiveResendFromMessageId,
        },
      );
    }

    const encryptedContent = await encryptValue(content);
    await db.transaction(async (tx) => {
      const existingFileParts = await tx
        .select({ metadataJson: messageParts.metadataJson })
        .from(messageParts)
        .where(
          and(
            eq(messageParts.messageId, existingUserMessage.id),
            eq(messageParts.type, "file"),
          ),
        )
        .orderBy(messageParts.sortOrder);
      await truncateConversationMessages({
        tx,
        conversationId: conversation.id,
        anchorMessageId: existingUserMessage.id,
        includeAnchor: false,
      });
      await tx
        .delete(messageParts)
        .where(eq(messageParts.messageId, existingUserMessage.id));
      await tx.insert(messageParts).values({
        messageId: existingUserMessage.id,
        type: "text",
        contentEncrypted: encryptedContent,
        sortOrder: 0,
      });
      const requestedFileParts = [
        ...(codeWorkspaceAttachment ? [codeWorkspaceAttachment] : []),
        ...messageAttachments,
      ];
      const userFileParts = mergeUserFilePartMetadata(
        existingFileParts.map((part) => part.metadataJson),
        requestedFileParts,
      );
      for (const [index, metadata] of userFileParts.entries()) {
        await tx.insert(messageParts).values({
          messageId: existingUserMessage.id,
          type: "file",
          metadataJson: metadata,
          sortOrder: index + 1,
        });
      }
    });
    userMessage = existingUserMessage;
  } else {
    const encryptedContent = await encryptValue(content);
    const [newUserMessage] = await db
      .insert(messages)
      .values({
        conversationId: conversation.id,
        role: "user",
        status: "completed",
        completedAt: new Date(),
      })
      .returning();
    userMessage = newUserMessage;
    createdUserMessage = true;

    await db.insert(messageParts).values({
      messageId: newUserMessage.id,
      type: "text",
      contentEncrypted: encryptedContent,
      sortOrder: 0,
    });
    const chatAttachments = messageAttachments;
    const userFileParts = [
      ...(codeWorkspaceAttachment ? [codeWorkspaceAttachment] : []),
      ...chatAttachments,
    ];
    for (const [index, metadata] of userFileParts.entries()) {
      await db.insert(messageParts).values({
        messageId: newUserMessage.id,
        type: "file",
        metadataJson: metadata,
        sortOrder: index + 1,
      });
    }
  }
  const userMessageId = userMessage?.id;
  await db
    .update(conversations)
    .set({ updatedAt: new Date(), sidebarOrder: null })
    .where(eq(conversations.id, conversation.id));
  const shouldRegenerateConversationTitle =
    createdConversation ||
    (!continueFromMessageId &&
    effectiveResendFromMessageId &&
    !regenerateAssistantMessageId
      ? await isFirstUserMessageInConversation(conversation.id, userMessage!.id)
      : false);

  let assistantMessage: typeof messages.$inferSelect;
  if (continuationClaim) {
    assistantMessage = continuationClaim.message;
  } else {
    try {
      [assistantMessage] = await db
        .insert(messages)
        .values({
          conversationId: conversation.id,
          role: "assistant",
          status: "streaming",
          modelId: providerConfig.modelId,
          providerId: providerConfig.providerId,
          ...chatStreamLeaseValues(),
        })
        .returning();
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      if (createdUserMessage && userMessage) {
        await db.delete(messages).where(eq(messages.id, userMessage.id));
      }
      return rejectChatRequest(
        409,
        "conversation_already_streaming",
        { error: "This conversation already has a response in progress" },
        {
          agentId,
          workspaceId: agent.workspaceId,
          userId: actorUserId,
          conversationId: conversation.id,
        },
      );
    }
  }
  const assistantMessageId = assistantMessage.id;

  return {
    conversation,
    createdConversation,
    version,
    providerConfig,
    continuationClaim,
    userMessage,
    assistantMessage,
    shouldRegenerateConversationTitle,
    userMessageId,
    assistantMessageId,
    createdUserMessage,
  };
}
