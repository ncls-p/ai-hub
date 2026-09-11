"use client";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type QueuedChatMessage } from "@/components/chat/chat-composer";
import { useWorkspaceShell } from "@/components/app-shell";
import {
  assistantSelectionNeedsSetup,
  isAssistantSelectionLoading,
} from "@/components/chat/assistant-selection";
import type { CodeWorkspaceArtifact } from "@/components/chat/chat-types";
import {
  CODE_WORKSPACE_CHAT_WIDTH_STORAGE_KEY,
  DEFAULT_CHAT_WIDTH,
  normalizeCodeWorkspaceChatWidth,
} from "@/components/chat/code-workspace-layout";
import { useWorkspace } from "@/hooks/use-workspace";
import { canAdoptRouteConversation } from "@/lib/chat-navigation";
import {
  DEFAULT_EPHEMERAL_TTL_MINUTES,
  isEphemeralTtlMinutes,
} from "@/modules/chat/ephemeral-retention";
import { CHAT_INTERFACE_MODE, type InterfaceMode } from "./chat-interface-mode";
import { rotatePromptSuggestions } from "./chat-page-helpers";
import { useChatDirectory } from "./page.use-chat-directory";
import { useConversationActions } from "./page.use-conversation-actions";
import { useConversationHistoryLiveStatus } from "./page.use-conversation-live-status";
import { useComposerActions } from "./page.use-composer-actions";
import { useComposerDraft } from "./page.use-composer-draft";
import { useMessageActions } from "./page.use-message-actions";
import { useTemporaryConversationPersistence } from "./page.use-temporary-conversation";
import { useChatSession } from "./page.use-chat-session";
import { useCodeWorkspaceArtifactEvent } from "./page.use-code-workspace-artifact-event";
import { useReasoningEffort } from "./page.use-reasoning-effort";
import { ChatPageView } from "./page.chat-page.view";
import { ChatPageBoundary } from "./page.chat-page-boundary";
export function useChatPageController() {
  const t = useTranslations(CHAT_INTERFACE_MODE);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const { permissions, permissionsReady } = useWorkspaceShell();
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [ephemeral, setEphemeral] = useState(false);
  const [ephemeralTtlMinutes, setEphemeralTtlMinutes] = useState(
    DEFAULT_EPHEMERAL_TTL_MINUTES,
  );
  const [ephemeralExpiresAt, setEphemeralExpiresAt] = useState<string | null>(
    null,
  );
  const routeTemporary = searchParams.get("temporary") === "true";
  const requestedTtlMinutes = Number(searchParams.get("ttl"));
  const routeTtlMinutes = isEphemeralTtlMinutes(requestedTtlMinutes)
    ? requestedTtlMinutes
    : DEFAULT_EPHEMERAL_TTL_MINUTES;
  const effectiveEphemeral = activeConversationId
    ? ephemeral || routeTemporary
    : routeTemporary;
  const effectiveEphemeralTtlMinutes = activeConversationId
    ? ephemeralTtlMinutes
    : routeTtlMinutes;
  const [queuedMessages, setQueuedMessages] = useState<QueuedChatMessage[]>([]);
  const [codeWorkspaceArtifact, setCodeWorkspaceArtifact] =
    useState<CodeWorkspaceArtifact | null>(null);
  const [interfaceMode, setInterfaceMode] =
    useState<InterfaceMode>(CHAT_INTERFACE_MODE);
  const [codingChatWidth, setCodingChatWidth] = useState(DEFAULT_CHAT_WIDTH);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastAutoOpenedWorkspaceRef = useRef<string | null>(null);
  const userSelectedInterfaceModeRef = useRef<InterfaceMode | null>(null);
  const newConversationAgentIdRef = useRef<string | null>(null);
  const internallyReplacedConversationIdRef = useRef<string | null>(null);
  const {
    agents,
    selectedAgentId,
    setSelectedAgentId,
    organizationDefaultAgentId,
    setOrganizationDefaultAgentId,
    canCreateAgent,
    canRunSetup,
    userDefaultAgentId,
    setUserDefaultAgentId,
    conversations,
    setConversations,
    loadingAgents,
    setLoadingContext,
    loadAgentDirectory,
    refreshConversations,
  } = useChatDirectory(workspaceId, t, setActiveConversationId, pathname);
  const {
    attachments,
    composerDraftScopeRef,
    input,
    restoreComposerDraft,
    saveCurrentComposerDraft,
    setAttachments,
    setInput,
  } = useComposerDraft(workspaceId, selectedAgentId, activeConversationId);
  useEffect(() => {
    if (selectedAgentId) newConversationAgentIdRef.current = selectedAgentId;
  }, [selectedAgentId]);

  function chooseInterfaceMode(mode: InterfaceMode) {
    userSelectedInterfaceModeRef.current = mode;
    setInterfaceMode(mode);
  }

  const resetInterfaceMode = useCallback(() => {
    userSelectedInterfaceModeRef.current = null;
    setInterfaceMode(CHAT_INTERFACE_MODE);
  }, []);

  function updateCodingChatWidth(width: number) {
    const nextWidth = normalizeCodeWorkspaceChatWidth(width);
    setCodingChatWidth(nextWidth);
    try {
      window.localStorage.setItem(
        CODE_WORKSPACE_CHAT_WIDTH_STORAGE_KEY,
        JSON.stringify(nextWidth),
      );
    } catch {
      // Keep the resized width for this session when storage is unavailable.
    }
  }

  useEffect(() => {
    try {
      const persisted = window.localStorage.getItem(
        CODE_WORKSPACE_CHAT_WIDTH_STORAGE_KEY,
      );
      if (!persisted) return;
      const nextWidth = normalizeCodeWorkspaceChatWidth(JSON.parse(persisted));
      queueMicrotask(() => setCodingChatWidth(nextWidth));
    } catch {
      // Ignore malformed or unavailable local storage and keep the default.
    }
  }, []);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );
  const emptyPromptSuggestions = useMemo(
    () =>
      selectedAgent
        ? rotatePromptSuggestions(
            selectedAgent.promptSuggestions ?? [],
            `${selectedAgent.id}-${new Date().toISOString().slice(0, 10)}`,
          )
        : [],
    [selectedAgent],
  );

  useCodeWorkspaceArtifactEvent({
    lastAutoOpenedWorkspaceRef,
    userSelectedInterfaceModeRef,
    setCodeWorkspaceArtifact,
    setInterfaceMode,
  });
  const replaceConversationRoute = useCallback(
    (
      conversationId: string,
      agentId: string | null,
      isTemporary: boolean,
      ttlMinutes: number,
    ) => {
      internallyReplacedConversationIdRef.current = conversationId;
      const params = new URLSearchParams({ conversationId });
      if (agentId) params.set("agentId", agentId);
      if (isTemporary) {
        params.set("temporary", "true");
        params.set("ttl", String(ttlMinutes));
      }
      window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
    },
    [pathname],
  );

  const {
    messages,
    setMessages,
    sending,
    pendingApprovals,
    handleSubmit,
    resolveApproval,
    stopGeneration,
    detachActiveStream,
    setActiveVersion,
    loadingMessages,
    conversationLoadError,
    retryConversationLoad,
    quota,
    canChat,
    activeVersion,
    conversationIsOwner,
    conversationReadOnly,
    latestTodoList,
    conversationImpact,
  } = useChatSession({
    workspaceId,
    canViewUsage: permissions.canViewUsage,
    permissionsReady,
    selectedAgentId,
    activeConversationId,
    ephemeral: effectiveEphemeral,
    ephemeralTtlMinutes: effectiveEphemeralTtlMinutes,
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
  });
  const latestTerminalAssistantMessageId = useMemo(
    () =>
      [...messages]
        .reverse()
        .find(
          (message) =>
            message.role === "assistant" &&
            (message.status === "completed" ||
              message.status === "failed" ||
              message.status === "cancelled"),
        )?.id ?? null,
    [messages],
  );
  useConversationHistoryLiveStatus({
    workspaceId,
    conversationId: activeConversationId,
    throughMessageId: latestTerminalAssistantMessageId,
    ready: !loadingMessages && !conversationLoadError,
    sending,
  });

  const selectionLoading = isAssistantSelectionLoading({
    workspaceLoading,
    agentsLoading: loadingAgents,
    selectedAgent,
    activeVersion,
  });
  const needsSetup = assistantSelectionNeedsSetup({
    isLoading: selectionLoading,
    selectedAgent,
    activeVersion,
  });
  const maxInputCharacters =
    activeVersion?.memoryPolicyJson?.maxInputCharacters ?? 32_000;
  const { reasoningPresets, reasoningEffort, setReasoningEffort } =
    useReasoningEffort(workspaceId, selectedAgentId, activeVersion);

  const { selectAgent, selectConversation, startNewConversation } =
    useConversationActions({
      selectedAgentId,
      activeConversationId,
      conversations,
      newConversationAgentIdRef,
      setSelectedAgentId,
      setActiveConversationId,
      setActiveVersion,
      setQueuedMessages,
      setMessages,
      setCodeWorkspaceArtifact,
      setAttachments,
      detachActiveStream,
      restoreComposerDraft,
      resetInterfaceMode,
    });

  const routeConversationId = searchParams.get("conversationId");
  const routeAgentId = searchParams.get("agentId");
  const routeSearch = searchParams.toString();
  const availableRouteAgentId = agents.some(({ id }) => id === routeAgentId)
    ? routeAgentId
    : null;
  useEffect(() => {
    if (loadingAgents) return;
    // Native history updates are synchronous, while useSearchParams catches up
    // on the following render. Do not let a stale route snapshot undo the
    // assistant choice made by the user in between those two updates.
    if (window.location.search.slice(1) !== routeSearch) return;
    const internallyReplacedConversationId =
      routeConversationId &&
      internallyReplacedConversationIdRef.current === routeConversationId
        ? routeConversationId
        : null;
    if (internallyReplacedConversationId) {
      internallyReplacedConversationIdRef.current = null;
    }
    if (routeAgentId && !availableRouteAgentId && !routeConversationId) {
      const params = new URLSearchParams(routeSearch);
      params.delete("agentId");
      const query = params.toString();
      window.history.replaceState(
        null,
        "",
        query ? `${pathname}?${query}` : pathname,
      );
      return;
    }
    if (
      canAdoptRouteConversation({
        routeConversationId,
        activeConversationId,
        internallyReplacedConversationId,
      })
    ) {
      selectConversation(routeConversationId!, availableRouteAgentId);
      return;
    }
    if (!routeConversationId && activeConversationId) {
      startNewConversation();
      return;
    }
    if (
      !routeConversationId &&
      availableRouteAgentId &&
      availableRouteAgentId !== selectedAgentId
    ) {
      selectAgent(availableRouteAgentId);
    }
  }, [
    activeConversationId,
    availableRouteAgentId,
    loadingAgents,
    pathname,
    routeAgentId,
    routeConversationId,
    routeSearch,
    selectAgent,
    selectConversation,
    selectedAgentId,
    sending,
    startNewConversation,
  ]);

  const {
    submitMessage,
    uploadCodeWorkspace,
    uploadChatAttachment,
    submitSuggestion,
    setUserDefaultAgent,
    updateQueuedMessage,
    cancelQueuedMessage,
  } = useComposerActions({
    workspaceId,
    activeConversationId,
    ephemeral: effectiveEphemeral,
    ephemeralTtlMinutes: effectiveEphemeralTtlMinutes,
    input,
    attachments,
    canChat,
    sending,
    interfaceMode,
    codeWorkspaceArtifact,
    handleSubmit,
    setInput,
    setAttachments,
    setQueuedMessages,
    setCodeWorkspaceArtifact,
    setInterfaceMode,
    setOrganizationDefaultAgentId,
    setUserDefaultAgentId,
    userSelectedInterfaceModeRef,
    lastAutoOpenedWorkspaceRef,
    t,
    reasoningEffort,
  });

  const {
    editMessage,
    deleteMessage,
    regenerateAssistantResponse,
    continueAssistantResponse,
    forkConversation,
    forkingMessageId,
    navigateConversationBranch,
    reloadActualLatestMessages,
    reloadAgentContext,
    approveToolInvocation,
    rejectToolInvocation,
  } = useMessageActions({
    activeConversationId,
    workspaceId,
    selectedAgentId,
    reasoningEffort,
    messages,
    sending,
    setMessages,
    handleSubmit,
    resolveApproval,
    refreshConversations,
    loadAgentDirectory,
    setCodeWorkspaceArtifact,
    setActiveVersion,
    setLoadingContext,
    selectConversation,
    t,
  });

  const {
    convertingTemporaryConversation,
    extendingTemporaryConversation,
    extendTemporaryConversation,
    makeConversationPersistent,
  } = useTemporaryConversationPersistence({
    workspaceId,
    activeConversationId,
    setEphemeral,
    setEphemeralTtlMinutes,
    setEphemeralExpiresAt,
    setConversations,
    translate: t,
  });

  const boundaryLayoutProps = {
    agents,
    selectedAgent,
    selectedAgentId,
    activeConversationId,
    organizationDefaultAgentId,
    userDefaultAgentId,
    isLoading: selectionLoading,
    needsSetup,
    canCreateAgent,
    canRunSetup,
    onSelectAgent: selectAgent,
    onSetUserDefaultAgent: (agentId: string | null) =>
      void setUserDefaultAgent(agentId),
    onSetupComplete: () => void reloadAgentContext(),
  };
  if (
    workspaceLoading ||
    loadingAgents ||
    (agents.length === 0 && !activeConversationId)
  )
    return (
      <ChatPageBoundary
        state={workspaceLoading || loadingAgents ? "loading" : "empty"}
        layoutProps={boundaryLayoutProps}
        emptyStateProps={{ canCreateAgent, canRunSetup, t }}
        loadingStateProps={{ t }}
      />
    );

  return {
    kind: "ready",
    activeConversationId,
    agents,
    approveToolInvocation,
    attachments,
    bottomRef,
    canChat,
    needsSetup,
    isLoading: selectionLoading,
    canCreateAgent,
    canRunSetup,
    cancelQueuedMessage,
    chooseInterfaceMode,
    codeWorkspaceArtifact,
    codingChatWidth,
    continueAssistantResponse,
    forkConversation,
    forkingMessageId,
    conversationImpact,
    conversationLoadError,
    conversationIsOwner,
    conversationReadOnly,
    convertingTemporaryConversation,
    deleteMessage,
    editMessage,
    emptyPromptSuggestions,
    effectiveEphemeral,
    effectiveEphemeralTtlMinutes,
    ephemeralExpiresAt,
    extendTemporaryConversation,
    extendingTemporaryConversation,
    input,
    interfaceMode,
    latestTodoList,
    maxInputCharacters,
    loadingMessages,
    makeConversationPersistent,
    messages,
    organizationDefaultAgentId,
    pendingApprovals,
    reasoningEffort,
    reasoningPresets,
    queuedMessages,
    quota,
    rejectToolInvocation,
    reloadActualLatestMessages,
    retryConversationLoad,
    reloadAgentContext,
    regenerateAssistantResponse,
    navigateConversationBranch,
    selectAgent,
    selectedAgent,
    selectedAgentId,
    sending,
    setAttachments,
    setInput,
    setReasoningEffort,
    setUserDefaultAgent,
    stopGeneration,
    submitMessage,
    submitSuggestion,
    t,
    updateCodingChatWidth,
    updateQueuedMessage,
    uploadChatAttachment,
    uploadCodeWorkspace,
    userDefaultAgentId,
    workspaceId,
  } as const;
}

export default function ChatPage(
  ...args: Parameters<typeof useChatPageController>
) {
  const model = useChatPageController(...args);
  if (!("kind" in model)) return model;
  return <ChatPageView model={model} />;
}
