"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import type {
  ChatAgent,
  ChatConversation,
  ChatConversationFolder,
} from "@/components/chat/chat-types";
import { fetchJson } from "@/lib/api-client";

import {
  CONVERSATION_PAGE_SIZE,
  mergeConversationPages,
  normalizeConversationList,
  type ConversationListPayload,
} from "./chat-page-helpers";
import {
  type AgentDirectoryPayload,
  type ConversationSearchState,
  EMPTY_CONVERSATION_SEARCH_STATE,
} from "./page.agent-directory-payload";

export function useChatDirectory(
  workspaceId: string | null | undefined,
  translate: (key: string) => string,
  setActiveConversationId: (id: string) => void,
  routeRefreshKey: string,
) {
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [organizationDefaultAgentId, setOrganizationDefaultAgentId] = useState<
    string | null
  >(null);
  const [canCreateAgent, setCanCreateAgent] = useState(false);
  const [canRunSetup, setCanRunSetup] = useState(false);
  const [userDefaultAgentId, setUserDefaultAgentId] = useState<string | null>(
    null,
  );
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [conversationFolders, setConversationFolders] = useState<
    ChatConversationFolder[]
  >([]);
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [conversationCursor, setConversationCursor] = useState<string | null>(
    null,
  );
  const [conversationSearchQuery, setConversationSearchQuery] = useState("");
  const [conversationSearchState, setConversationSearchState] =
    useState<ConversationSearchState>(EMPTY_CONVERSATION_SEARCH_STATE);
  const [conversationSearchRevision, setConversationSearchRevision] =
    useState(0);
  const [loadingMoreConversations, setLoadingMoreConversations] =
    useState(false);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingContext, setLoadingContext] = useState(false);

  const fetchConversationPage = useCallback(
    async ({
      before,
      query,
      signal,
    }: {
      before?: string | null;
      query?: string;
      signal?: AbortSignal;
    } = {}) => {
      const params = new URLSearchParams({
        ...(workspaceId ? { workspaceId } : {}),
        limit: String(CONVERSATION_PAGE_SIZE),
        includeMeta: "true",
      });
      if (before) params.set("before", before);
      if (query?.trim()) params.set("q", query.trim());
      return normalizeConversationList(
        await fetchJson<ConversationListPayload>(
          `/api/workspace/conversations?${params.toString()}`,
          { signal },
        ),
      );
    },
    [workspaceId],
  );

  const loadAgentDirectory = useCallback(
    async ({
      preferredAgentId,
      signal,
    }: { preferredAgentId?: string | null; signal?: AbortSignal } = {}) => {
      if (!workspaceId) return null;
      const params = new URLSearchParams({
        workspaceId,
        includeModelMeta: "true",
      });
      const response = await fetchJson<AgentDirectoryPayload | ChatAgent[]>(
        `/api/workspace/agents?${params.toString()}`,
        { signal },
      );
      const allAgents = (
        Array.isArray(response) ? response : (response.agents ?? [])
      ) as ChatAgent[];
      const requestedAgentId = new URL(window.location.href).searchParams.get(
        "agentId",
      );
      const data = allAgents.filter(
        (agent) => !agent.hiddenInChat || agent.id === requestedAgentId,
      );
      const defaults = Array.isArray(response)
        ? {
            organizationDefaultAgentId: null,
            userDefaultAgentId: null,
            effectiveDefaultAgentId: null,
            canCreateAgent: false,
            canManageProviders: false,
          }
        : response;
      setAgents(data);
      setOrganizationDefaultAgentId(
        defaults.organizationDefaultAgentId ?? null,
      );
      setCanCreateAgent(Boolean(defaults.canCreateAgent));
      setCanRunSetup(
        Boolean(defaults.canCreateAgent && defaults.canManageProviders),
      );
      setUserDefaultAgentId(defaults.userDefaultAgentId ?? null);
      const urlParams = new URL(window.location.href).searchParams;
      const requestedAgentIdFromUrl = urlParams.get("agentId");
      const requestedConversationId = urlParams.get("conversationId");
      const exists = (id: string | null | undefined) =>
        Boolean(id && data.some((agent) => agent.id === id));
      const nextAgentId =
        (requestedConversationId ? requestedAgentIdFromUrl : null) ??
        (exists(requestedAgentIdFromUrl) ? requestedAgentIdFromUrl : null) ??
        (exists(preferredAgentId) ? preferredAgentId : null) ??
        (exists(defaults.effectiveDefaultAgentId)
          ? defaults.effectiveDefaultAgentId
          : null) ??
        data[0]?.id ??
        null;
      setSelectedAgentId(nextAgentId);
      if (requestedConversationId)
        setActiveConversationId(requestedConversationId);
      return nextAgentId;
    },
    [setActiveConversationId, workspaceId],
  );

  const refreshConversations = useCallback(async () => {
    const data = await fetchConversationPage();
    setConversations(data.conversations);
    setConversationFolders(data.folders);
    setHasMoreConversations(data.hasMore);
    setConversationCursor(data.nextCursor);
  }, [fetchConversationPage]);
  const loadMoreConversations = useCallback(async () => {
    if (loadingMoreConversations || !hasMoreConversations) return;
    const before = conversationCursor ?? conversations.at(-1)?.updatedAt;
    if (!before) return;
    setLoadingMoreConversations(true);
    try {
      const data = await fetchConversationPage({ before });
      setConversations((current) =>
        mergeConversationPages(current, data.conversations),
      );
      if (data.folders.length > 0) setConversationFolders(data.folders);
      setHasMoreConversations(data.hasMore);
      setConversationCursor(data.nextCursor);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate("errors.loadOlderFailed"),
      );
    } finally {
      setLoadingMoreConversations(false);
    }
  }, [
    conversationCursor,
    conversations,
    fetchConversationPage,
    hasMoreConversations,
    loadingMoreConversations,
    translate,
  ]);

  useEffect(() => {
    const query = conversationSearchQuery.trim();
    if (!query) return;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setConversationSearchState({
        query,
        conversations: [],
        hasMore: false,
        nextCursor: null,
        loading: true,
        loadingMore: false,
        error: false,
      });
      void fetchConversationPage({ query, signal: controller.signal })
        .then((data) =>
          setConversationSearchState({
            query,
            conversations: data.conversations,
            hasMore: data.hasMore,
            nextCursor: data.nextCursor,
            loading: false,
            loadingMore: false,
            error: false,
          }),
        )
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") return;
          setConversationSearchState({
            query,
            conversations: [],
            hasMore: false,
            nextCursor: null,
            loading: false,
            loadingMore: false,
            error: true,
          });
        });
    }, 300);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    conversationSearchQuery,
    conversationSearchRevision,
    fetchConversationPage,
    workspaceId,
  ]);

  const loadMoreConversationSearchResults = useCallback(async () => {
    const query = conversationSearchQuery.trim();
    if (
      !query ||
      conversationSearchState.query !== query ||
      !conversationSearchState.hasMore ||
      conversationSearchState.loadingMore ||
      !conversationSearchState.nextCursor
    )
      return;
    setConversationSearchState((current) => ({
      ...current,
      loadingMore: true,
      error: false,
    }));
    try {
      const data = await fetchConversationPage({
        query,
        before: conversationSearchState.nextCursor,
      });
      setConversationSearchState((current) =>
        current.query === query
          ? {
              ...current,
              conversations: mergeConversationPages(
                current.conversations,
                data.conversations,
              ),
              hasMore: data.hasMore,
              nextCursor: data.nextCursor,
              loadingMore: false,
            }
          : current,
      );
    } catch {
      setConversationSearchState((current) =>
        current.query === query
          ? { ...current, loadingMore: false, error: true }
          : current,
      );
    }
  }, [conversationSearchQuery, conversationSearchState, fetchConversationPage]);

  useEffect(() => {
    if (!workspaceId) {
      queueMicrotask(() => {
        setAgents([]);
        setLoadingAgents(false);
      });
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    queueMicrotask(() => {
      void loadAgentDirectory({ signal: controller.signal })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name !== "AbortError")
            toast.error(error.message);
        })
        .finally(() => {
          if (!cancelled) setLoadingAgents(false);
        });
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [loadAgentDirectory, routeRefreshKey, workspaceId]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    queueMicrotask(() => setLoadingContext(true));
    void fetchConversationPage({ signal: controller.signal })
      .then((data) => {
        if (cancelled) return;
        setConversations(data.conversations);
        setConversationFolders(data.folders);
        setHasMoreConversations(data.hasMore);
        setConversationCursor(data.nextCursor);
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
  }, [fetchConversationPage, workspaceId]);

  return {
    agents,
    setAgents,
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
    conversationFolders,
    setConversationFolders,
    hasMoreConversations,
    setHasMoreConversations,
    conversationCursor,
    setConversationCursor,
    conversationSearchQuery,
    setConversationSearchQuery,
    conversationSearchState,
    setConversationSearchState,
    setConversationSearchRevision,
    loadingMoreConversations,
    loadingAgents,
    loadingContext,
    setLoadingContext,
    fetchConversationPage,
    loadAgentDirectory,
    refreshConversations,
    loadMoreConversations,
    loadMoreConversationSearchResults,
  };
}
