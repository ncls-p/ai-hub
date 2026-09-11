"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type {
  ChatAgent,
  ChatConversation,
  ChatConversationFolder,
} from "@/components/chat/chat-types";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson } from "@/lib/api-client";
import { notifyWorkspaceHistoryChanged } from "@/lib/workspace-history-events";
import { useWorkspaceHistoryLiveSync } from "./workspace-history-sidebar.use-history-live-sync";
import {
  queueWorkspaceHistoryRefresh,
  resolveWorkspaceHistorySearchState,
  settleWorkspaceHistoryRefresh,
  type WorkspaceHistoryRefreshCycle,
} from "./workspace-history-sidebar.state";
import {
  AgentPayload,
  ConversationPayload,
  normalizeConversations,
  withConversationLiveState,
} from "./workspace-history-sidebar.conversation-payload";

export function useWorkspaceHistory() {
  const { workspaceId } = useWorkspace();
  const tErrors = useTranslations("chat.errors");
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [folders, setFolders] = useState<ChatConversationFolder[]>([]);
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [agentsWorkspaceId, setAgentsWorkspaceId] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [resolvedWorkspaceId, setResolvedWorkspaceId] = useState<string | null>(
    null,
  );
  const resolvedWorkspaceIdRef = useRef<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ChatConversation[]>([]);
  const [searchWorkspaceId, setSearchWorkspaceId] = useState<string | null>(
    null,
  );
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [searchRevision, setSearchRevision] = useState(0);
  const [revision, setRevision] = useState(0);
  const [serverRevision, setServerRevision] = useState(0);
  const refreshCycleRef = useRef<WorkspaceHistoryRefreshCycle | null>(null);
  const requestRefresh = useCallback(() => {
    const queued = queueWorkspaceHistoryRefresh(refreshCycleRef.current);
    refreshCycleRef.current = queued.cycle;
    if (queued.shouldFetch) setRevision((current) => current + 1);
    return queued.cycle.promise;
  }, []);
  const live = useWorkspaceHistoryLiveSync(
    conversations,
    serverRevision,
    requestRefresh,
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const refreshCycle = refreshCycleRef.current;
    const params = new URLSearchParams({
      ...(workspaceId ? { workspaceId } : {}),
      limit: "50",
      includeMeta: "true",
    });
    void fetchJson<ConversationPayload>(
      `/api/workspace/conversations?${params.toString()}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then((conversationPayload) => {
        if (!active) return;
        const normalized = normalizeConversations(conversationPayload);
        setConversations(normalized.conversations);
        setFolders(normalized.folders);
        resolvedWorkspaceIdRef.current = workspaceId;
        setResolvedWorkspaceId(workspaceId);
        setLoadError(false);
        setServerRevision((current) => current + 1);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        if (active && resolvedWorkspaceIdRef.current !== workspaceId) {
          resolvedWorkspaceIdRef.current = workspaceId;
          setLoadError(true);
          setResolvedWorkspaceId(workspaceId);
        }
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        if (refreshCycle && refreshCycleRef.current === refreshCycle) {
          const settlement = settleWorkspaceHistoryRefresh(refreshCycle);
          if (settlement === "refetch") {
            setRevision((current) => current + 1);
            return;
          }
          refreshCycleRef.current = null;
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [revision, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    const agentParams = new URLSearchParams({
      workspaceId,
      includeModelMeta: "true",
    });
    void fetchJson<AgentPayload>(
      `/api/workspace/agents?${agentParams.toString()}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then((agentPayload) => {
        setAgents(
          Array.isArray(agentPayload)
            ? agentPayload
            : (agentPayload.agents ?? []),
        );
        setAgentsWorkspaceId(workspaceId);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
      });
    return () => controller.abort();
  }, [workspaceId]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return;
    }

    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({
        ...(workspaceId ? { workspaceId } : {}),
        limit: "50",
        includeMeta: "true",
        q: normalizedQuery,
      });
      setSearching(true);
      setSearchError(false);
      void fetchJson<ConversationPayload>(
        `/api/workspace/conversations?${params.toString()}`,
        { signal: controller.signal, cache: "no-store" },
      )
        .then((payload) => {
          if (!active) return;
          setSearchResults(normalizeConversations(payload).conversations);
          setSearchWorkspaceId("personal");
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          if (active) {
            setSearchResults([]);
            setSearchWorkspaceId("personal");
            setSearchError(true);
          }
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 240);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, searchRevision, workspaceId]);

  async function renameConversation(conversationId: string, title: string) {
    try {
      const data = await fetchJson<{ conversation: ChatConversation }>(
        `/api/workspace/conversations/${conversationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        },
      );
      const applyRename = (current: ChatConversation[]) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                title: data.conversation.title,
                updatedAt: data.conversation.updatedAt,
              }
            : conversation,
        );
      setConversations(applyRename);
      setSearchResults(applyRename);
      notifyWorkspaceHistoryChanged(workspaceId);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : tErrors("renameConversationFailed"),
      );
    }
  }

  async function deleteConversation(conversationId: string) {
    try {
      await fetchJson(`/api/workspace/conversations/${conversationId}`, {
        method: "DELETE",
      });
      const removeConversation = (current: ChatConversation[]) =>
        current.filter((conversation) => conversation.id !== conversationId);
      setConversations(removeConversation);
      setSearchResults(removeConversation);
      notifyWorkspaceHistoryChanged(workspaceId);
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : tErrors("deleteConversationFailed"),
      );
      return false;
    }
  }

  async function createFolder(name: string) {
    if (!workspaceId) return;
    try {
      const data = await fetchJson<{ folder: ChatConversationFolder }>(
        "/api/workspace/conversation-folders",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, name }),
        },
      );
      setFolders((current) => [...current, data.folder]);
      notifyWorkspaceHistoryChanged(workspaceId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : tErrors("createFolderFailed"),
      );
    }
  }

  async function renameFolder(folderId: string, name: string) {
    try {
      const data = await fetchJson<{ folder: ChatConversationFolder }>(
        `/api/workspace/conversation-folders/${folderId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      setFolders((current) =>
        current.map((folder) =>
          folder.id === folderId ? data.folder : folder,
        ),
      );
      notifyWorkspaceHistoryChanged(workspaceId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : tErrors("renameFolderFailed"),
      );
    }
  }

  async function deleteFolder(folderId: string) {
    try {
      await fetchJson(`/api/workspace/conversation-folders/${folderId}`, {
        method: "DELETE",
      });
      setFolders((current) =>
        current.filter((folder) => folder.id !== folderId),
      );
      setConversations((current) =>
        current.map((conversation) =>
          conversation.folderId === folderId
            ? { ...conversation, folderId: null }
            : conversation,
        ),
      );
      notifyWorkspaceHistoryChanged(workspaceId);
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : tErrors("deleteFolderFailed"),
      );
      return false;
    }
  }

  async function togglePin(conversationId: string, pinned: boolean) {
    try {
      const data = await fetchJson<{ conversation: ChatConversation }>(
        `/api/workspace/conversations/${conversationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned }),
        },
      );
      const applyPin = (current: ChatConversation[]) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, ...data.conversation }
            : conversation,
        );
      setConversations(applyPin);
      setSearchResults(applyPin);
      notifyWorkspaceHistoryChanged(workspaceId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : tErrors("updatePinFailed"),
      );
    }
  }

  async function reorderConversations(input: {
    conversationIds: string[];
    folderId: string | null;
    pinned?: boolean;
  }) {
    if (!workspaceId) return;
    const now = new Date().toISOString();
    setConversations((current) =>
      current.map((conversation) => {
        const index = input.conversationIds.indexOf(conversation.id);
        if (index === -1) return conversation;
        return {
          ...conversation,
          folderId: input.folderId,
          pinnedAt:
            input.pinned === undefined
              ? conversation.pinnedAt
              : input.pinned
                ? (conversation.pinnedAt ?? now)
                : null,
          sidebarOrder: (index + 1) * 1000,
        };
      }),
    );
    try {
      await fetchJson("/api/workspace/conversations/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, ...input }),
      });
      notifyWorkspaceHistoryChanged(workspaceId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : tErrors("moveFailed"),
      );
      await requestRefresh();
    }
  }

  const scopedSearch = resolveWorkspaceHistorySearchState({
    query,
    workspaceId: "personal",
    resultWorkspaceId: searchWorkspaceId,
    results: searchResults,
    inFlight: searching,
    failed: searchError,
  });

  return {
    agents: agentsWorkspaceId === workspaceId ? agents : [],
    conversations: withConversationLiveState(conversations, live),
    folders,
    loading: loading || resolvedWorkspaceId !== workspaceId,
    loadError: resolvedWorkspaceId === workspaceId && loadError,
    query,
    searchResults: scopedSearch.results.length
      ? withConversationLiveState(
          scopedSearch.results,
          live.forConversations(scopedSearch.results),
        )
      : [],
    searching: scopedSearch.searching,
    searchError: scopedSearch.error,
    setQuery: (nextQuery: string) => {
      setQuery(nextQuery);
      setSearchResults([]);
      setSearchWorkspaceId(null);
      setSearching(false);
      setSearchError(false);
    },
    retry: () => {
      setLoading(true);
      setLoadError(false);
      resolvedWorkspaceIdRef.current = null;
      setResolvedWorkspaceId(null);
      setSearchError(false);
      void requestRefresh();
    },
    retrySearch: () => {
      setSearchResults([]);
      setSearchWorkspaceId(null);
      setSearching(false);
      setSearchError(false);
      setSearchRevision((current) => current + 1);
    },
    renameConversation,
    deleteConversation,
    createFolder,
    renameFolder,
    deleteFolder,
    togglePin,
    reorderConversations,
  };
}
