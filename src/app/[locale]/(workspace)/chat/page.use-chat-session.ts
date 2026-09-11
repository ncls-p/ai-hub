"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { QueuedChatMessage } from "@/components/chat/chat-composer";
import { migrateNewChatComposerDraft } from "@/components/chat/chat-composer-draft";
import { latestChatTodoListFromMessages } from "@/components/chat/chat-message-rendering-utils";
import type {
  AgentVersion,
  ChatConversation,
  ChatMessage,
  CodeWorkspaceArtifact,
} from "@/components/chat/chat-types";
import { aggregateChatUsageImpact } from "@/components/chat/chat-types";
import { useChatStream } from "@/hooks/use-chat-stream";
import { fetchJson } from "@/lib/api-client";
import { notifyWorkspaceHistoryChanged } from "@/lib/workspace-history-events";

import {
  CHAT_INTERFACE_MODE,
  CODING_INTERFACE_MODE,
  shouldAutoActivateCoding,
  type InterfaceMode,
} from "./chat-interface-mode";
import {
  conversationTitleFromFirstMessage,
  latestCodeWorkspaceArtifact,
  touchConversation,
  upsertConversation,
} from "./chat-page-helpers";

type Setter<T> = Dispatch<SetStateAction<T>>;
type SessionContext = {
  workspaceId: string | null;
  canViewUsage: boolean;
  permissionsReady: boolean;
  selectedAgentId: string | null;
  activeConversationId: string | null;
  ephemeral: boolean;
  ephemeralTtlMinutes: number;
  queuedMessages: QueuedChatMessage[];
  interfaceMode: InterfaceMode;
  codeWorkspaceArtifact: CodeWorkspaceArtifact | null;
  lastAutoOpenedWorkspaceRef: MutableRefObject<string | null>;
  userSelectedInterfaceModeRef: MutableRefObject<InterfaceMode | null>;
  composerDraftScopeRef: MutableRefObject<{
    workspaceId: string;
    agentId: string;
    conversationId: string | null;
  } | null>;
  saveCurrentComposerDraft: () => void;
  resetInterfaceMode: () => void;
  refreshConversations: () => Promise<void>;
  replaceConversationRoute: (
    conversationId: string,
    agentId: string | null,
    ephemeral: boolean,
    ttlMinutes: number,
  ) => void;
  setActiveConversationId: Setter<string | null>;
  setEphemeral: Setter<boolean>;
  setEphemeralTtlMinutes: Setter<number>;
  setEphemeralExpiresAt: Setter<string | null>;
  setSelectedAgentId: Setter<string | null>;
  setConversations: Setter<ChatConversation[]>;
  setQueuedMessages: Setter<QueuedChatMessage[]>;
  setCodeWorkspaceArtifact: Setter<CodeWorkspaceArtifact | null>;
  setInterfaceMode: Setter<InterfaceMode>;
  setLoadingContext: Setter<boolean>;
};

export function useChatSession(c: SessionContext) {
  const {
    workspaceId,
    canViewUsage,
    permissionsReady,
    selectedAgentId,
    activeConversationId,
    ephemeral,
    ephemeralTtlMinutes,
    queuedMessages,
    interfaceMode,
    codeWorkspaceArtifact,
    lastAutoOpenedWorkspaceRef,
    userSelectedInterfaceModeRef,
    composerDraftScopeRef,
    saveCurrentComposerDraft,
    resetInterfaceMode,
    refreshConversations,
    replaceConversationRoute,
    setActiveConversationId,
    setEphemeral,
    setEphemeralTtlMinutes,
    setEphemeralExpiresAt,
    setSelectedAgentId,
    setConversations,
    setQueuedMessages,
    setCodeWorkspaceArtifact,
    setInterfaceMode,
    setLoadingContext,
  } = c;
  const [conversationWorkspace, setConversationWorkspace] = useState<{
    id: string;
    workspaceId: string;
  } | null>(null);
  const executionWorkspaceId =
    conversationWorkspace?.id === activeConversationId
      ? conversationWorkspace.workspaceId
      : workspaceId;
  const [activeVersion, setActiveVersion] = useState<AgentVersion | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadedConversationId, setLoadedConversationId] = useState<
    string | null
  >(null);
  const [conversationLoadError, setConversationLoadError] = useState(false);
  const [messageLoadAttempt, setMessageLoadAttempt] = useState(0);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(
    null,
  );
  const [conversationCanContinue, setConversationCanContinue] = useState(true);
  const [conversationIsOwner, setConversationIsOwner] = useState(true);
  const ephemeralRef = useRef(ephemeral);
  const ephemeralTtlMinutesRef = useRef(ephemeralTtlMinutes);
  const processingQueuedMessageRef = useRef(false);
  const skipNextMessageLoadForConversationRef = useRef<string | null>(null);
  const canChat = Boolean(
    activeVersion?.providerId &&
    activeVersion?.modelId &&
    conversationCanContinue,
  );
  const stream = useChatStream({
    agentId: selectedAgentId,
    conversationId: activeConversationId,
    workspaceId: executionWorkspaceId,
    canChat,
    onConversationCreated: (conversationId, firstMessage, options) => {
      skipNextMessageLoadForConversationRef.current = conversationId;
      setLoadedConversationId(conversationId);
      setConversationLoadError(false);
      const currentParams = new URLSearchParams(window.location.search);
      const createdEphemeral =
        ephemeralRef.current || currentParams.get("temporary") === "true";
      const requestedTtl = Number(currentParams.get("ttl"));
      const createdEphemeralTtlMinutes =
        Number.isInteger(requestedTtl) && requestedTtl > 0
          ? requestedTtl
          : ephemeralTtlMinutesRef.current;
      setEphemeral(createdEphemeral);
      setEphemeralTtlMinutes(createdEphemeralTtlMinutes);
      if (workspaceId && selectedAgentId) {
        saveCurrentComposerDraft();
        migrateNewChatComposerDraft(
          workspaceId,
          selectedAgentId,
          conversationId,
        );
        composerDraftScopeRef.current = {
          workspaceId: workspaceId,
          agentId: selectedAgentId,
          conversationId,
        };
      }
      setActiveConversationId(conversationId);
      if (selectedAgentId && !options?.responseVersion) {
        setConversations((current) =>
          upsertConversation(current, {
            id: conversationId,
            title: conversationTitleFromFirstMessage(firstMessage),
            agentId: selectedAgentId!,
            folderId: null,
            pinnedAt: null,
            sidebarOrder: null,
            isEphemeral: createdEphemeral,
            ephemeralTtlMinutes: createdEphemeral
              ? createdEphemeralTtlMinutes
              : undefined,
            updatedAt: new Date().toISOString(),
          }),
        );
      }
      replaceConversationRoute(
        conversationId,
        selectedAgentId,
        createdEphemeral,
        createdEphemeralTtlMinutes,
      );
      notifyWorkspaceHistoryChanged(workspaceId);
    },
    onConversationTitle: (conversationId, title) => {
      setConversations((current) => {
        let found = false;
        const next = current.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
          found = true;
          return { ...conversation, title };
        });
        return found || !selectedAgentId
          ? next
          : [
              {
                id: conversationId,
                title,
                agentId: selectedAgentId,
                updatedAt: new Date().toISOString(),
              },
              ...next,
            ];
      });
      notifyWorkspaceHistoryChanged(workspaceId);
    },
    onConversationMetadata: (metadata) => {
      setEphemeral(metadata.isEphemeral === true);
      setEphemeralExpiresAt(
        metadata.isEphemeral ? (metadata.expiresAt ?? null) : null,
      );
    },
    onConversationsRefresh: refreshConversations,
  });
  const {
    messages,
    setMessages,
    sending,
    handleSubmit: submitToStream,
  } = stream;
  const handleSubmit = useCallback(
    (...args: Parameters<typeof submitToStream>) => {
      if (activeConversationId) {
        const updatedAt = new Date().toISOString();
        setConversations((current) =>
          touchConversation(current, activeConversationId, updatedAt),
        );
        notifyWorkspaceHistoryChanged(workspaceId);
      }
      return submitToStream(...args);
    },
    [activeConversationId, setConversations, submitToStream, workspaceId],
  );
  const latestTodoList = useMemo(
    () => latestChatTodoListFromMessages(messages),
    [messages],
  );
  const conversationImpact = useMemo(
    () => aggregateChatUsageImpact(messages),
    [messages],
  );
  useEffect(() => {
    ephemeralRef.current = ephemeral;
    ephemeralTtlMinutesRef.current = ephemeralTtlMinutes;
  }, [ephemeral, ephemeralTtlMinutes]);

  useEffect(() => {
    const artifact = latestCodeWorkspaceArtifact(messages);
    if (!artifact) return;
    queueMicrotask(() => {
      setCodeWorkspaceArtifact((current) =>
        current?.projectId === artifact.projectId &&
        artifact.version <= current.version
          ? current
          : artifact,
      );
      if (
        !sending ||
        !shouldAutoActivateCoding(userSelectedInterfaceModeRef.current)
      )
        return;
      const key = `${artifact.projectId}:${artifact.version}`;
      if (lastAutoOpenedWorkspaceRef.current === key) return;
      lastAutoOpenedWorkspaceRef.current = key;
      setInterfaceMode(CODING_INTERFACE_MODE);
    });
  }, [
    lastAutoOpenedWorkspaceRef,
    setCodeWorkspaceArtifact,
    setInterfaceMode,
    userSelectedInterfaceModeRef,
    messages,
    sending,
  ]);

  useEffect(() => {
    if (
      sending ||
      !canChat ||
      queuedMessages.length === 0 ||
      processingQueuedMessageRef.current
    )
      return;
    const next = queuedMessages[0];
    if (!next?.content.trim())
      return void queueMicrotask(() =>
        setQueuedMessages((current) => current.slice(1)),
      );
    processingQueuedMessageRef.current = true;
    queueMicrotask(() => {
      setQueuedMessages((current) =>
        current[0]?.id === next.id
          ? current.slice(1)
          : current.filter(({ id }) => id !== next.id),
      );
      void handleSubmit(next.content.trim(), {
        codeWorkspaceId:
          interfaceMode === CODING_INTERFACE_MODE
            ? codeWorkspaceArtifact?.projectId
            : undefined,
        ephemeral: !activeConversationId && ephemeral,
        reasoningEffort: next.reasoningEffort,
      }).finally(() => {
        processingQueuedMessageRef.current = false;
      });
    });
  }, [
    activeConversationId,
    codeWorkspaceArtifact,
    ephemeral,
    interfaceMode,
    queuedMessages,
    setQueuedMessages,
    canChat,
    handleSubmit,
    sending,
  ]);

  useEffect(() => {
    if (!selectedAgentId || !executionWorkspaceId) return;
    const controller = new AbortController();
    let cancelled = false;
    queueMicrotask(() => {
      setLoadingContext(true);
      setActiveVersion(null);
    });
    void fetchJson<AgentVersion[]>(
      `/api/workspace/agents/${selectedAgentId}/versions?workspaceId=${executionWorkspaceId}`,
      { signal: controller.signal },
    )
      .then((versions) => {
        if (!cancelled)
          setActiveVersion(versions.find(({ isActive }) => isActive) ?? null);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError")
          toast.error(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingContext(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedAgentId, setLoadingContext, executionWorkspaceId]);

  useEffect(() => {
    if (!workspaceId || !permissionsReady || !canViewUsage) {
      queueMicrotask(() => setQuota(null));
      return;
    }
    let cancelled = false;
    void fetchJson<{ quota: { used: number; limit: number } | null }>(
      `/api/workspace/usage?workspaceId=${workspaceId}&limit=1`,
    )
      .then((data) => {
        if (!cancelled && data.quota) setQuota(data.quota);
      })
      .catch(() => {
        if (!cancelled) setQuota(null);
      });
    return () => {
      cancelled = true;
    };
  }, [canViewUsage, permissionsReady, workspaceId]);

  useEffect(() => {
    if (!activeConversationId) {
      skipNextMessageLoadForConversationRef.current = null;
      queueMicrotask(() => {
        setLoadingMessages(false);
        setLoadedConversationId(null);
        setConversationLoadError(false);
        setConversationCanContinue(true);
        setConversationIsOwner(true);
        setEphemeralExpiresAt(null);
        setMessages([]);
        setCodeWorkspaceArtifact(null);
        resetInterfaceMode();
      });
      return;
    }
    if (
      skipNextMessageLoadForConversationRef.current === activeConversationId
    ) {
      skipNextMessageLoadForConversationRef.current = null;
      queueMicrotask(() => setLoadingMessages(false));
      return;
    }
    skipNextMessageLoadForConversationRef.current = null;
    const controller = new AbortController();
    let cancelled = false;
    queueMicrotask(() => {
      setConversationLoadError(false);
      setLoadingMessages(true);
    });
    void fetchJson<{
      conversation?: ChatConversation;
      messages?: ChatMessage[];
    }>(`/api/workspace/conversations/${activeConversationId}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (cancelled) return;
        const requestedAgentId = new URLSearchParams(
          window.location.search,
        ).get("agentId");
        if (
          data.conversation?.agentId &&
          (!requestedAgentId || requestedAgentId !== selectedAgentId)
        ) {
          setSelectedAgentId(data.conversation.agentId);
        }
        if (data.conversation) {
          if (data.conversation.workspaceId)
            setConversationWorkspace({
              id: activeConversationId,
              workspaceId: data.conversation.workspaceId,
            });
          setConversationCanContinue(data.conversation.canContinue !== false);
          setConversationIsOwner(data.conversation.isOwner !== false);
          setEphemeral(data.conversation.isEphemeral === true);
          setEphemeralExpiresAt(
            data.conversation.isEphemeral
              ? (data.conversation.expiresAt ?? null)
              : null,
          );
          if (data.conversation.ephemeralTtlMinutes) {
            setEphemeralTtlMinutes(data.conversation.ephemeralTtlMinutes);
          }
          setConversations((current) =>
            upsertConversation(current, data.conversation!),
          );
        }
        const loaded = data.messages ?? [];
        setMessages(loaded);
        setLoadedConversationId(activeConversationId);
        const artifact = latestCodeWorkspaceArtifact(loaded);
        setCodeWorkspaceArtifact(artifact);
        if (!artifact) setInterfaceMode(CHAT_INTERFACE_MODE);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        if (!cancelled) {
          setMessages([]);
          setCodeWorkspaceArtifact(null);
          setConversationLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    activeConversationId,
    messageLoadAttempt,
    resetInterfaceMode,
    setCodeWorkspaceArtifact,
    setConversations,
    setEphemeral,
    setEphemeralTtlMinutes,
    setEphemeralExpiresAt,
    setInterfaceMode,
    setSelectedAgentId,
    setMessages,
    selectedAgentId,
  ]);
  const retryConversationLoad = useCallback(() => {
    setConversationLoadError(false);
    setMessageLoadAttempt((attempt) => attempt + 1);
  }, []);
  return {
    ...stream,
    handleSubmit,
    activeVersion,
    setActiveVersion,
    loadingMessages:
      loadingMessages ||
      Boolean(
        activeConversationId &&
        loadedConversationId !== activeConversationId &&
        !conversationLoadError,
      ),
    conversationLoadError,
    retryConversationLoad,
    quota,
    canChat,
    conversationIsOwner,
    conversationReadOnly: Boolean(
      activeConversationId && !conversationCanContinue,
    ),
    latestTodoList,
    conversationImpact,
  };
}
