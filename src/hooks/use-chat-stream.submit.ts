import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { toast } from "sonner";

import {
  migrateDraftCapabilityOverrides,
  readChatCapabilityOverrides,
} from "@/components/chat/chat-capability-overrides";
import {
  createLocalMessage,
  prepareAssistantMessageContinuation,
  type ChatCitation,
  type ChatMessage,
  type ChatStreamEvent,
  type PendingToolApproval,
} from "@/components/chat/chat-types";
import { streamAiSdkUIChat } from "@/hooks/ai-sdk-ui-chat-transport";
import {
  STREAM_DRAFT_WRITE_BATCH_MS,
  applyStreamEvent,
  clearStoredChatStreamDraft,
  filterResolvedApprovals,
  storeChatStreamDraft,
  upsertPendingApproval,
} from "@/hooks/use-chat-stream-events";
import {
  appendErrorPart,
  compactErrorMessage,
  type SubmitOptions,
  type UseChatStreamOptions,
} from "./use-chat-stream.compact-error-message";
import { notifyConversationStreaming } from "@/lib/workspace-history-events";

export function useChatSubmitHandler(input: {
  workspaceId: string | null;
  agentId: string | null;
  conversationId: string | null;
  canChat: boolean;
  sending: boolean;
  messages: ChatMessage[];
  onConversationCreated: UseChatStreamOptions["onConversationCreated"];
  onConversationTitle: UseChatStreamOptions["onConversationTitle"];
  onConversationMetadata: UseChatStreamOptions["onConversationMetadata"];
  onConversationsRefresh: UseChatStreamOptions["onConversationsRefresh"];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setSending: Dispatch<SetStateAction<boolean>>;
  setPendingApprovals: Dispatch<SetStateAction<PendingToolApproval[]>>;
  setCitations: Dispatch<SetStateAction<ChatCitation[]>>;
  activeRequestControllerRef: MutableRefObject<AbortController | null>;
  activeConversationIdRef: MutableRefObject<string | null>;
  detachedRequestControllersRef: MutableRefObject<WeakSet<AbortController>>;
  stopRequestedRef: MutableRefObject<boolean>;
  resolvedApprovalIdsRef: MutableRefObject<Set<string>>;
  onBeforeSubmit?: () => void;
}) {
  const {
    workspaceId,
    agentId,
    conversationId,
    canChat,
    sending,
    messages,
    onConversationCreated,
    onConversationTitle,
    onConversationMetadata,
    onConversationsRefresh,
    setMessages,
    setSending,
    setPendingApprovals,
    setCitations,
    activeRequestControllerRef,
    activeConversationIdRef,
    detachedRequestControllersRef,
    stopRequestedRef,
    resolvedApprovalIdsRef,
    onBeforeSubmit,
  } = input;
  async function handleSubmit(content: string, options: SubmitOptions = {}) {
    if (!content) return false;
    if (!agentId) return false;
    if (!canChat) return false;
    if (sending) return false;

    const userMessageFileParts = [
      ...(options.codeWorkspaceArtifact
        ? [
            {
              type: "file",
              content: JSON.stringify(options.codeWorkspaceArtifact),
            },
          ]
        : []),
      ...(options.attachments ?? []).map((attachment) => ({
        type: "file",
        content: JSON.stringify(attachment),
      })),
    ];
    const userMessage = createLocalMessage(
      "user",
      content,
      userMessageFileParts,
    );
    const continuedAssistantMessage = options.continueFromMessageId
      ? messages.find(
          (message) =>
            message.id === options.continueFromMessageId &&
            message.role === "assistant",
        )
      : null;
    if (options.continueFromMessageId && !continuedAssistantMessage)
      return false;
    onBeforeSubmit?.();
    const assistantMessage = continuedAssistantMessage
      ? prepareAssistantMessageContinuation(continuedAssistantMessage)
      : createLocalMessage("assistant", "");
    let activeConversationId = conversationId;
    let assistantMessageId = assistantMessage.id;
    let assistantDraft = assistantMessage;
    let pendingApprovalsDraft: PendingToolApproval[] = [];
    let renderBatchTimeout: number | null = null;
    let draftWriteTimeout: number | null = null;

    function commitAssistantDraft() {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id ||
          message.id === assistantMessageId
            ? assistantDraft
            : message,
        ),
      );
    }

    function cancelScheduledRender() {
      if (renderBatchTimeout === null) return;
      window.cancelAnimationFrame(renderBatchTimeout);
      renderBatchTimeout = null;
    }

    function flushAssistantRender() {
      if (renderBatchTimeout === null) return;
      cancelScheduledRender();
      commitAssistantDraft();
    }

    function scheduleAssistantRender() {
      if (renderBatchTimeout !== null) return;
      // Align commits to the next paint so markdown updates feel continuous.
      renderBatchTimeout = window.requestAnimationFrame(() => {
        renderBatchTimeout = null;
        commitAssistantDraft();
      });
    }

    function cancelScheduledDraftWrite() {
      if (draftWriteTimeout === null) return;
      window.clearTimeout(draftWriteTimeout);
      draftWriteTimeout = null;
    }

    function writeDraft() {
      if (!activeConversationId) return;
      const visibleApprovals = filterResolvedApprovals(
        pendingApprovalsDraft,
        resolvedApprovalIdsRef.current,
      );
      storeChatStreamDraft(
        {
          conversationId: activeConversationId,
          assistantMessage: assistantDraft,
          pendingApprovals: visibleApprovals,
          pendingApproval: visibleApprovals[0] ?? null,
          updatedAt: Date.now(),
        },
        { notify: false },
      );
    }

    function persistDraft(options: { immediate?: boolean } = {}) {
      if (options.immediate) {
        cancelScheduledDraftWrite();
        writeDraft();
        return;
      }
      if (draftWriteTimeout !== null) return;
      draftWriteTimeout = window.setTimeout(() => {
        draftWriteTimeout = null;
        writeDraft();
      }, STREAM_DRAFT_WRITE_BATCH_MS);
    }

    function updatePendingApprovals(
      updater: (approvals: PendingToolApproval[]) => PendingToolApproval[],
    ) {
      pendingApprovalsDraft = filterResolvedApprovals(
        updater(pendingApprovalsDraft),
        resolvedApprovalIdsRef.current,
      );
      setPendingApprovals(pendingApprovalsDraft);
      persistDraft({ immediate: true });
    }

    function addPendingApproval(approval: PendingToolApproval) {
      if (resolvedApprovalIdsRef.current.has(approval.invocationId)) return;
      updatePendingApprovals((approvals) =>
        upsertPendingApproval(approvals, approval),
      );
    }

    function clearPendingApprovals() {
      updatePendingApprovals(() => []);
    }

    function updateAssistantDraft(
      updater: (message: ChatMessage) => ChatMessage,
    ) {
      assistantDraft = updater(assistantDraft);
      scheduleAssistantRender();
      persistDraft();
    }

    stopRequestedRef.current = false;
    setMessages((current) => {
      if (options.continueFromMessageId) {
        return current.map((message) =>
          message.id === options.continueFromMessageId
            ? assistantMessage
            : message,
        );
      }
      if (options.reuseUserMessage && options.resendFromMessageId) {
        const messageIndex = current.findIndex(
          (message) => message.id === options.resendFromMessageId,
        );
        if (messageIndex >= 0) {
          return [...current.slice(0, messageIndex + 1), assistantMessage];
        }
      }
      return [...current, userMessage, assistantMessage];
    });
    setSending(true);
    clearPendingApprovals();
    setCitations([]);
    persistDraft({ immediate: true });

    const controller = new AbortController();
    activeRequestControllerRef.current = controller;
    activeConversationIdRef.current = activeConversationId;

    try {
      function handleStreamEvent(parsed: ChatStreamEvent) {
        applyStreamEvent(parsed, {
          updateAssistant: updateAssistantDraft,
          addPendingApproval,
          clearPendingApprovals,
          setCitations,
          onConversationTitle: (title) => {
            const targetConversationId = activeConversationIdRef.current;
            if (targetConversationId) {
              onConversationTitle?.(targetConversationId, title);
            }
          },
        });
      }

      const attachmentsToSend = options.attachments ?? [];
      await streamAiSdkUIChat({
        api: `/api/workspace/${agentId}/chat`,
        chatId: activeConversationId ?? userMessage.id,
        content,
        localUserMessageId: userMessage.id,
        resendFromMessageId: options.resendFromMessageId,
        body: {
          workspaceId: workspaceId ?? undefined,
          content,
          conversationId: conversationId ?? undefined,
          ephemeral: options.ephemeral,
          ephemeralTtlMinutes: options.ephemeralTtlMinutes,
          reasoningEffort: options.reasoningEffort,
          resendFromMessageId: options.resendFromMessageId,
          regenerateAssistantMessageId: options.regenerateAssistantMessageId,
          continueFromMessageId: options.continueFromMessageId,
          codeWorkspaceId:
            options.codeWorkspaceId ?? options.codeWorkspaceArtifact?.projectId,
          attachmentIds: attachmentsToSend.flatMap((attachment) =>
            attachment.kind === "chat_file" ? [attachment.id] : [],
          ),
          imageAttachmentIds: attachmentsToSend.flatMap((attachment) =>
            attachment.kind === "chat_image" ? [attachment.id] : [],
          ),
          capabilityOverrides: readChatCapabilityOverrides(
            agentId,
            conversationId,
          ),
        },
        abortSignal: controller.signal,
        onStart: (metadata) => {
          onConversationMetadata?.(metadata);
          if (options.regenerateAssistantMessageId && metadata.conversationId) {
            const conversationIds = Array.from(
              new Set([
                ...(options.responseVersionConversationIds ??
                  (conversationId ? [conversationId] : [])),
                metadata.conversationId,
              ]),
            );
            assistantDraft = {
              ...assistantDraft,
              branch: {
                conversationIds,
                activeIndex: conversationIds.indexOf(metadata.conversationId),
              },
            };
          }
          if (metadata.conversationId) {
            activeConversationId = metadata.conversationId;
            activeConversationIdRef.current = metadata.conversationId;
            notifyConversationStreaming(
              workspaceId,
              metadata.conversationId,
              true,
            );
          }
          if (metadata.messageId) {
            assistantMessageId = metadata.messageId;
            assistantDraft = {
              ...assistantDraft,
              id: metadata.messageId,
              streamGenerationId: metadata.streamGenerationId,
            };
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessage.id ? assistantDraft : message,
              ),
            );
            persistDraft({ immediate: true });
          }
          if (metadata.userMessageId) {
            setMessages((current) =>
              current.map((message) =>
                message.id === userMessage.id ||
                (options.reuseUserMessage &&
                  message.id === options.resendFromMessageId)
                  ? { ...message, id: metadata.userMessageId! }
                  : message,
              ),
            );
          }
          if (
            metadata.conversationId &&
            metadata.conversationId !== conversationId
          ) {
            migrateDraftCapabilityOverrides(agentId, metadata.conversationId);
            onConversationCreated(metadata.conversationId, content, {
              responseVersion: Boolean(options.regenerateAssistantMessageId),
            });
          }
        },
        onEvent: handleStreamEvent,
      });

      updateAssistantDraft((message) => ({ ...message, status: "completed" }));
      flushAssistantRender();
      clearPendingApprovals();
      if (activeConversationId)
        clearStoredChatStreamDraft(activeConversationId);
      notifyConversationStreaming(workspaceId, activeConversationId, false, {
        markUnread: false,
      });

      await onConversationsRefresh().catch(() => undefined);
      return true;
    } catch (err) {
      const requestWasDetached =
        detachedRequestControllersRef.current.has(controller);
      if (err instanceof Error && err.name === "AbortError") {
        if (requestWasDetached) {
          persistDraft({ immediate: true });
          return true;
        }
        updateAssistantDraft((message) => ({
          ...message,
          status: stopRequestedRef.current ? "cancelled" : "completed",
        }));
        flushAssistantRender();
        clearPendingApprovals();
        if (activeConversationId)
          clearStoredChatStreamDraft(activeConversationId);
        notifyConversationStreaming(workspaceId, activeConversationId, false, {
          markUnread: false,
        });
        return false;
      }
      const errorMessage =
        err instanceof Error ? err.message : "Chat request failed";
      toast.error(compactErrorMessage(errorMessage));
      updateAssistantDraft((message) =>
        options.continueFromMessageId
          ? { ...message, status: "completed" }
          : appendErrorPart(message, errorMessage),
      );
      flushAssistantRender();
      clearPendingApprovals();
      if (activeConversationId)
        clearStoredChatStreamDraft(activeConversationId);
      notifyConversationStreaming(workspaceId, activeConversationId, false, {
        markUnread: false,
      });
      return false;
    } finally {
      const requestWasDetached =
        detachedRequestControllersRef.current.has(controller);
      if (!requestWasDetached) flushAssistantRender();
      cancelScheduledDraftWrite();
      cancelScheduledRender();
      if (activeRequestControllerRef.current === controller) {
        activeRequestControllerRef.current = null;
        activeConversationIdRef.current = null;
      }
      if (!requestWasDetached) {
        stopRequestedRef.current = false;
        setSending(false);
      }
    }
  }
  return handleSubmit;
}
