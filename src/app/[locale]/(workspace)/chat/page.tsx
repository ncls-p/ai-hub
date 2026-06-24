"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDownIcon,
  MessageSquareIcon,
  Loader2,
  PlusIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  ChatComposer,
  type QueuedChatMessage,
} from "@/components/chat/chat-composer";
import { ChatLayout } from "@/components/chat/chat-layout";
import {
  CODE_WORKSPACE_ARTIFACT_EVENT,
  ChatMessageList,
  CodeWorkspaceArtifactCard,
} from "@/components/chat/chat-message-list";
import { ModelLogo } from "@/components/providers/model-logo";
import { QuotaBanner } from "@/components/chat/quota-banner";
import { textFromMessage } from "@/components/chat/chat-types";
import type {
  AgentVersion,
  ChatAgent,
  ChatConversation,
  ChatConversationFolder,
  ChatImageAttachment,
  ChatMessage,
  CodeWorkspaceArtifact,
  PendingToolApproval,
} from "@/components/chat/chat-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";

function createQueuedMessage(content: string): QueuedChatMessage {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    content,
  };
}

const CONVERSATION_PAGE_SIZE = 50;

function uploadPathForFile(file: File) {
  const relativePath = (file as File & { webkitRelativePath?: string })
    .webkitRelativePath;
  return relativePath?.trim() || file.name;
}

type ConversationListPage = {
  conversations: ChatConversation[];
  folders: ChatConversationFolder[];
  hasMore: boolean;
  nextCursor: string | null;
};

type ConversationListPayload = ChatConversation[] | ConversationListPage;

function normalizeConversationList(
  payload: ConversationListPayload,
): ConversationListPage {
  if (Array.isArray(payload)) {
    return {
      conversations: payload,
      folders: [],
      hasMore: false,
      nextCursor: null,
    };
  }
  return {
    conversations: payload.conversations ?? [],
    folders: payload.folders ?? [],
    hasMore: payload.hasMore,
    nextCursor: payload.nextCursor,
  };
}

function mergeConversationPages(
  current: ChatConversation[],
  incoming: ChatConversation[],
) {
  const existingIds = new Set(current.map((conversation) => conversation.id));
  return [
    ...current,
    ...incoming.filter((conversation) => !existingIds.has(conversation.id)),
  ];
}

function conversationTitleFromFirstMessage(content: string) {
  const normalized = content.trim().replace(/\s+/g, " ");
  return normalized.length > 100 ? `${normalized.slice(0, 97)}…` : normalized;
}

function rotatePromptSuggestions(suggestions: string[], seed: string) {
  if (suggestions.length <= 3) return suggestions;
  const offset =
    Array.from(seed).reduce((total, char) => total + char.charCodeAt(0), 0) %
    suggestions.length;
  return [...suggestions.slice(offset), ...suggestions.slice(0, offset)].slice(
    0,
    3,
  );
}

function upsertConversation(
  current: ChatConversation[],
  conversation: ChatConversation,
) {
  let found = false;
  const next = current.map((item) => {
    if (item.id !== conversation.id) return item;
    found = true;
    return { ...item, ...conversation };
  });
  return found ? next : [conversation, ...next];
}

function isCodeWorkspaceArtifact(
  value: unknown,
): value is CodeWorkspaceArtifact {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "code_workspace_artifact" &&
    typeof record.projectId === "string" &&
    typeof record.version === "number" &&
    Array.isArray(record.files)
  );
}

function codeWorkspaceArtifactFromPartContent(content: string) {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (isCodeWorkspaceArtifact(parsed)) return parsed;
    if (typeof parsed !== "object" || parsed === null) return null;
    const output = (parsed as Record<string, unknown>).output;
    return isCodeWorkspaceArtifact(output) ? output : null;
  } catch {
    return null;
  }
}

function latestCodeWorkspaceArtifact(messages: ChatMessage[]) {
  let latest: CodeWorkspaceArtifact | null = null;
  for (const message of messages) {
    for (const part of message.parts) {
      if (
        part.type !== "file" &&
        part.type !== "tool-call" &&
        part.type !== "tool-result"
      ) {
        continue;
      }
      const artifact = codeWorkspaceArtifactFromPartContent(part.content);
      if (!artifact) continue;
      if (!latest || artifact.version >= latest.version) latest = artifact;
    }
  }
  return latest;
}

function ChatContextBar({
  quota,
}: {
  quota: { used: number; limit: number } | null;
}) {
  const [open, setOpen] = useState(false);
  const quotaPercent = quota
    ? Math.min(100, Math.round((quota.used / quota.limit) * 100))
    : 0;
  const showQuota = Boolean(quota && quotaPercent >= 80);

  useEffect(() => {
    const stored = window.localStorage.getItem("chat-context-open-v2");
    if (stored) {
      queueMicrotask(() => setOpen(stored === "true"));
    }
  }, []);

  function updateOpen(shouldOpen: boolean) {
    setOpen(shouldOpen);
    window.localStorage.setItem("chat-context-open-v2", String(shouldOpen));
  }

  if (!showQuota) return null;

  return (
    <Collapsible
      open={open}
      onOpenChange={updateOpen}
      className="shrink-0 border-b border-border/60 bg-background"
    >
      <div className="mx-auto flex min-h-10 w-full max-w-4xl items-center justify-between gap-3 px-4 py-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">Chat status</span>
          {showQuota ? (
            <Badge
              variant={quotaPercent >= 100 ? "destructive" : "outline"}
              className="rounded-lg text-[11px] font-medium"
            >
              Usage {quotaPercent}%
            </Badge>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              aria-label={open ? "Hide context" : "Show context"}
            >
              <ChevronDownIcon
                className={cn(
                  "size-3 transition-transform",
                  !open && "-rotate-90",
                )}
                aria-hidden="true"
              />
            </Button>
          </CollapsibleTrigger>
        </div>
      </div>
      {showQuota ? (
        <CollapsibleContent>
          <div className="flex flex-col gap-0">
            {quota ? (
              <QuotaBanner used={quota.used} limit={quota.limit} />
            ) : null}
          </div>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

export default function ChatPage() {
  const t = useTranslations("chat");
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
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
  const [loadingMoreConversations, setLoadingMoreConversations] =
    useState(false);
  const [activeVersion, setActiveVersion] = useState<AgentVersion | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingContext, setLoadingContext] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [input, setInput] = useState("");
  const [queuedMessages, setQueuedMessages] = useState<QueuedChatMessage[]>([]);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(
    null,
  );
  const [codeWorkspaceArtifact, setCodeWorkspaceArtifact] =
    useState<CodeWorkspaceArtifact | null>(null);
  const [imageAttachments, setImageAttachments] = useState<
    ChatImageAttachment[]
  >([]);
  const [interfaceMode, setInterfaceMode] = useState<"chat" | "coding">("chat");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const scrollContentRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const userDetachedRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const programmaticScrollRef = useRef(false);
  const scrollAnimationRef = useRef<number | null>(null);
  const STICK_RESUME_THRESHOLD_PX = 48;
  const skipNextMessageLoadRef = useRef(false);
  const processingQueuedMessageRef = useRef(false);
  const lastAutoOpenedWorkspaceRef = useRef<string | null>(null);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );
  const canChat = Boolean(activeVersion?.providerId && activeVersion?.modelId);
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

  useEffect(() => {
    function handleCodeWorkspaceArtifact(event: Event) {
      const detail = (
        event as CustomEvent<{
          artifact?: CodeWorkspaceArtifact;
          activate?: boolean;
        }>
      ).detail;
      const artifact = detail?.artifact;
      if (!artifact?.projectId) return;
      setCodeWorkspaceArtifact((current) => {
        if (
          current?.projectId === artifact.projectId &&
          artifact.version <= current.version
        ) {
          return current;
        }
        return artifact;
      });
      if (!detail.activate) return;
      const artifactKey = `${artifact.projectId}:${artifact.version}`;
      if (lastAutoOpenedWorkspaceRef.current === artifactKey) return;
      lastAutoOpenedWorkspaceRef.current = artifactKey;
      setInterfaceMode("coding");
    }
    window.addEventListener(
      CODE_WORKSPACE_ARTIFACT_EVENT,
      handleCodeWorkspaceArtifact,
    );
    return () => {
      window.removeEventListener(
        CODE_WORKSPACE_ARTIFACT_EVENT,
        handleCodeWorkspaceArtifact,
      );
    };
  }, []);

  const fetchConversationPage = useCallback(
    async ({
      before,
      signal,
    }: {
      before?: string | null;
      signal?: AbortSignal;
    } = {}) => {
      if (!workspaceId) {
        return {
          conversations: [],
          folders: [],
          hasMore: false,
          nextCursor: null,
        };
      }
      const params = new URLSearchParams({
        workspaceId,
        limit: String(CONVERSATION_PAGE_SIZE),
        includeMeta: "true",
      });
      if (before) params.set("before", before);
      const data = await fetchJson<ConversationListPayload>(
        `/api/workspace/conversations?${params.toString()}`,
        { signal },
      );
      return normalizeConversationList(data);
    },
    [workspaceId],
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
        error instanceof Error ? error.message : "Failed to load older chats",
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
  ]);

  const {
    messages,
    setMessages,
    sending,
    pendingApprovals,
    handleSubmit,
    resolveApproval,
    stopGeneration,
  } = useChatStream({
    agentId: selectedAgentId,
    conversationId: activeConversationId,
    workspaceId,
    canChat,
    onConversationCreated: (conversationId, firstMessage) => {
      skipNextMessageLoadRef.current = true;
      setActiveConversationId(conversationId);
      if (selectedAgentId) {
        const now = new Date().toISOString();
        setConversations((current) =>
          upsertConversation(current, {
            id: conversationId,
            title: conversationTitleFromFirstMessage(firstMessage),
            agentId: selectedAgentId,
            folderId: null,
            pinnedAt: null,
            sidebarOrder: null,
            updatedAt: now,
          }),
        );
      }
      const params = new URLSearchParams();
      if (selectedAgentId) params.set("agentId", selectedAgentId);
      params.set("conversationId", conversationId);
      window.history.replaceState(null, "", `/chat?${params.toString()}`);
    },
    onConversationTitle: (conversationId, title) => {
      setConversations((current) => {
        let found = false;
        const next = current.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
          found = true;
          return { ...conversation, title };
        });
        if (found || !selectedAgentId) return next;
        return [
          {
            id: conversationId,
            title,
            agentId: selectedAgentId,
            updatedAt: new Date().toISOString(),
          },
          ...next,
        ];
      });
    },
    onConversationsRefresh: refreshConversations,
  });

  useEffect(() => {
    const latestArtifact = latestCodeWorkspaceArtifact(messages);
    if (!latestArtifact) return;
    queueMicrotask(() => {
      setCodeWorkspaceArtifact((current) => {
        if (
          current?.projectId === latestArtifact.projectId &&
          latestArtifact.version <= current.version
        ) {
          return current;
        }
        return latestArtifact;
      });
      if (!sending) return;
      const artifactKey = `${latestArtifact.projectId}:${latestArtifact.version}`;
      if (lastAutoOpenedWorkspaceRef.current === artifactKey) return;
      lastAutoOpenedWorkspaceRef.current = artifactKey;
      setInterfaceMode("coding");
    });
  }, [messages, sending]);

  useEffect(() => {
    if (
      sending ||
      !canChat ||
      queuedMessages.length === 0 ||
      processingQueuedMessageRef.current
    ) {
      return;
    }

    const nextMessage = queuedMessages[0];
    if (!nextMessage?.content.trim()) {
      queueMicrotask(() => {
        setQueuedMessages((current) => current.slice(1));
      });
      return;
    }

    processingQueuedMessageRef.current = true;
    queueMicrotask(() => {
      setQueuedMessages((current) =>
        current[0]?.id === nextMessage.id
          ? current.slice(1)
          : current.filter((message) => message.id !== nextMessage.id),
      );
      void handleSubmit(nextMessage.content.trim(), {
        codeWorkspaceId:
          interfaceMode === "coding"
            ? codeWorkspaceArtifact?.projectId
            : undefined,
      }).finally(() => {
        processingQueuedMessageRef.current = false;
      });
    });
  }, [
    canChat,
    codeWorkspaceArtifact,
    handleSubmit,
    interfaceMode,
    queuedMessages,
    sending,
  ]);

  useEffect(() => {
    if (!workspaceId) return;
    const currentWorkspaceId = workspaceId;
    let cancelled = false;
    const controller = new AbortController();

    async function loadAgents() {
      try {
        const agentParams = new URLSearchParams({
          workspaceId: currentWorkspaceId,
          includeModelMeta: "true",
        });
        const response = await fetchJson<
          | {
              agents?: ChatAgent[];
              organizationDefaultAgentId?: string | null;
              userDefaultAgentId?: string | null;
              effectiveDefaultAgentId?: string | null;
              canCreateAgent?: boolean;
              canManageProviders?: boolean;
            }
          | ChatAgent[]
        >(`/api/workspace/agents?${agentParams.toString()}`, {
          signal: controller.signal,
        });
        const data = (
          Array.isArray(response) ? response : (response.agents ?? [])
        ) as ChatAgent[];
        if (cancelled) return;

        setAgents(data);
        const responseDefaults = Array.isArray(response)
          ? {
              organizationDefaultAgentId: null,
              userDefaultAgentId: null,
              effectiveDefaultAgentId: null,
              canCreateAgent: false,
              canManageProviders: false,
            }
          : response;
        setOrganizationDefaultAgentId(
          responseDefaults.organizationDefaultAgentId ?? null,
        );
        setCanCreateAgent(Boolean(responseDefaults.canCreateAgent));
        setCanRunSetup(
          Boolean(
            responseDefaults.canCreateAgent &&
            responseDefaults.canManageProviders,
          ),
        );
        setUserDefaultAgentId(responseDefaults.userDefaultAgentId ?? null);
        const params = new URL(window.location.href).searchParams;
        const requestedAgentId = params.get("agentId");
        const requestedConversationId = params.get("conversationId");
        const defaultAgentId = responseDefaults.effectiveDefaultAgentId;
        setSelectedAgentId(
          requestedAgentId &&
            data.some((agent) => agent.id === requestedAgentId)
            ? requestedAgentId
            : defaultAgentId &&
                data.some((agent) => agent.id === defaultAgentId)
              ? defaultAgentId
              : (data[0]?.id ?? null),
        );
        if (requestedConversationId) {
          setActiveConversationId(requestedConversationId);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          toast.error(err.message);
        }
      } finally {
        if (!cancelled) setLoadingAgents(false);
      }
    }

    void loadAgents();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    const controller = new AbortController();
    queueMicrotask(() => setLoadingContext(true));

    async function loadConversations() {
      try {
        const conversationData = await fetchConversationPage({
          signal: controller.signal,
        });
        if (cancelled) return;
        setConversations(conversationData.conversations);
        setConversationFolders(conversationData.folders);
        setHasMoreConversations(conversationData.hasMore);
        setConversationCursor(conversationData.nextCursor);
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          toast.error(err.message);
        }
      } finally {
        if (!cancelled) setLoadingContext(false);
      }
    }

    void loadConversations();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [fetchConversationPage, workspaceId]);

  useEffect(() => {
    if (!selectedAgentId || !workspaceId) return;
    let cancelled = false;
    const controller = new AbortController();
    queueMicrotask(() => setLoadingContext(true));

    async function loadActiveVersion() {
      try {
        const versionData = await fetchJson<AgentVersion[]>(
          `/api/workspace/agents/${selectedAgentId}/versions?workspaceId=${workspaceId}`,
          { signal: controller.signal },
        );
        if (cancelled) return;
        setActiveVersion(
          versionData.find((version) => version.isActive) ?? null,
        );
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          toast.error(err.message);
        }
      } finally {
        if (!cancelled) setLoadingContext(false);
      }
    }

    void loadActiveVersion();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedAgentId, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    async function loadQuota() {
      try {
        const data = await fetchJson<{
          quota: { used: number; limit: number } | null;
        }>(`/api/workspace/usage?workspaceId=${workspaceId}&limit=1`);
        if (!cancelled && data.quota) setQuota(data.quota);
      } catch {
        if (!cancelled) setQuota(null);
      }
    }
    void loadQuota();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!activeConversationId) {
      skipNextMessageLoadRef.current = false;
      queueMicrotask(() => {
        setMessages([]);
        setCodeWorkspaceArtifact(null);
        setImageAttachments([]);
        setInterfaceMode("chat");
      });
      return;
    }
    if (skipNextMessageLoadRef.current) {
      skipNextMessageLoadRef.current = false;
      setLoadingMessages(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    queueMicrotask(() => setLoadingMessages(true));

    async function loadMessages() {
      try {
        const data = await fetchJson<{
          conversation?: ChatConversation;
          messages?: ChatMessage[];
        }>(`/api/workspace/conversations/${activeConversationId}`, {
          signal: controller.signal,
        });
        if (cancelled) return;
        const urlAgentId = new URL(window.location.href).searchParams.get(
          "agentId",
        );
        if (data.conversation?.agentId && !urlAgentId) {
          setSelectedAgentId(data.conversation.agentId);
        }
        const loadedConversation = data.conversation;
        if (loadedConversation) {
          setConversations((current) =>
            upsertConversation(current, loadedConversation),
          );
        }
        const loadedMessages = data.messages ?? [];
        setMessages(loadedMessages);
        const latestArtifact = latestCodeWorkspaceArtifact(loadedMessages);
        setCodeWorkspaceArtifact(latestArtifact);
        if (!latestArtifact) setInterfaceMode("chat");
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          toast.error(err.message);
        }
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    }

    void loadMessages();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeConversationId, setMessages]);

  const cancelScrollAnimation = useCallback(() => {
    if (scrollAnimationRef.current === null) return;
    window.cancelAnimationFrame(scrollAnimationRef.current);
    scrollAnimationRef.current = null;
    programmaticScrollRef.current = false;
  }, []);

  const detachFromBottom = useCallback(() => {
    userDetachedRef.current = true;
    stickToBottomRef.current = false;
  }, []);

  const scrollToConversationBottom = useCallback(() => {
    if (scrollAnimationRef.current !== null) return;

    scrollAnimationRef.current = window.requestAnimationFrame(() => {
      scrollAnimationRef.current = null;
      const container = scrollContainerRef.current;
      if (!container || !stickToBottomRef.current) return;

      programmaticScrollRef.current = true;
      container.scrollTop = container.scrollHeight;
      lastScrollTopRef.current = container.scrollTop;
      window.requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
    });
  }, []);

  useEffect(() => {
    stickToBottomRef.current = true;
    userDetachedRef.current = false;
    lastScrollTopRef.current = 0;
  }, [activeConversationId]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const sentinel = bottomRef.current;
    if (!container || !sentinel) return;

    const intersection = new IntersectionObserver(
      ([entry]) => {
        if (programmaticScrollRef.current || userDetachedRef.current) return;
        stickToBottomRef.current = entry.isIntersecting;
      },
      { root: container, threshold: 0 },
    );
    intersection.observe(sentinel);

    function updateStickOnScroll() {
      if (programmaticScrollRef.current) return;
      const c = scrollContainerRef.current;
      if (!c) return;

      const scrollTop = c.scrollTop;
      const previousScrollTop = lastScrollTopRef.current;
      const distanceFromBottom = c.scrollHeight - scrollTop - c.clientHeight;

      if (scrollTop < previousScrollTop - 2) {
        detachFromBottom();
      } else if (
        userDetachedRef.current &&
        scrollTop > previousScrollTop + 2 &&
        distanceFromBottom <= STICK_RESUME_THRESHOLD_PX
      ) {
        userDetachedRef.current = false;
        stickToBottomRef.current = true;
      }

      lastScrollTopRef.current = scrollTop;
    }

    function handleWheel(event: WheelEvent) {
      programmaticScrollRef.current = false;
      cancelScrollAnimation();
      if (event.deltaY < 0) detachFromBottom();
    }

    lastScrollTopRef.current = container.scrollTop;
    container.addEventListener("scroll", updateStickOnScroll, {
      passive: true,
    });
    container.addEventListener("wheel", handleWheel, { passive: true });
    return () => {
      intersection.disconnect();
      container.removeEventListener("scroll", updateStickOnScroll);
      container.removeEventListener("wheel", handleWheel);
    };
  }, [
    cancelScrollAnimation,
    detachFromBottom,
    loadingMessages,
    messages.length,
  ]);

  useEffect(() => {
    scrollToConversationBottom();
  }, [messages, pendingApprovals, scrollToConversationBottom]);

  useEffect(() => {
    const content = scrollContentRef.current;
    if (!content) return;

    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) scrollToConversationBottom();
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
    };
  }, [scrollToConversationBottom, loadingMessages, messages.length]);

  useEffect(() => {
    return () => {
      cancelScrollAnimation();
    };
  }, [cancelScrollAnimation]);

  function selectAgent(agentId: string) {
    if (agentId === selectedAgentId) return;
    setQueuedMessages([]);
    setSelectedAgentId(agentId);
    setActiveVersion(null);
    const params = new URLSearchParams({ agentId });
    if (activeConversationId) {
      params.set("conversationId", activeConversationId);
    } else {
      setMessages([]);
      setCodeWorkspaceArtifact(null);
      setImageAttachments([]);
      setInterfaceMode("chat");
    }
    window.history.replaceState(null, "", `/chat?${params.toString()}`);
  }

  function selectConversation(conversationId: string) {
    setQueuedMessages([]);
    setMessages([]);
    setCodeWorkspaceArtifact(null);
    setImageAttachments([]);
    setInterfaceMode("chat");
    const conversation = conversations.find(
      (item) => item.id === conversationId,
    );
    if (conversation) {
      setSelectedAgentId(conversation.agentId);
    }
    setActiveConversationId(conversationId);
    const params = new URLSearchParams();
    if (conversation?.agentId) params.set("agentId", conversation.agentId);
    params.set("conversationId", conversationId);
    window.history.replaceState(null, "", `/chat?${params.toString()}`);
  }

  function startNewConversation() {
    setQueuedMessages([]);
    setActiveConversationId(null);
    setMessages([]);
    setCodeWorkspaceArtifact(null);
    setImageAttachments([]);
    setInterfaceMode("chat");
    window.history.replaceState(
      null,
      "",
      selectedAgentId ? `/chat?agentId=${selectedAgentId}` : "/chat",
    );
  }

  async function renameConversation(conversationId: string, title: string) {
    const data = await fetchJson<{ conversation: ChatConversation }>(
      `/api/workspace/conversations/${conversationId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      },
    );
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              title: data.conversation.title,
              updatedAt: data.conversation.updatedAt,
            }
          : conversation,
      ),
    );
  }

  async function deleteConversation(conversationId: string) {
    const confirmed = window.confirm("Delete this conversation?");
    if (!confirmed) return;

    await fetchJson(`/api/workspace/conversations/${conversationId}`, {
      method: "DELETE",
    });
    setConversations((current) =>
      current.filter((conversation) => conversation.id !== conversationId),
    );
    if (activeConversationId === conversationId) {
      setQueuedMessages([]);
      setActiveConversationId(null);
      setMessages([]);
      setCodeWorkspaceArtifact(null);
      setImageAttachments([]);
      setInterfaceMode("chat");
      window.history.replaceState(
        null,
        "",
        selectedAgentId ? `/chat?agentId=${selectedAgentId}` : "/chat",
      );
    }
  }

  async function createConversationFolder(name: string) {
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
      setConversationFolders((current) => [...current, data.folder]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create folder",
      );
    }
  }

  async function renameConversationFolder(folderId: string, name: string) {
    try {
      const data = await fetchJson<{ folder: ChatConversationFolder }>(
        `/api/workspace/conversation-folders/${folderId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      setConversationFolders((current) =>
        current.map((folder) =>
          folder.id === folderId ? data.folder : folder,
        ),
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to rename folder",
      );
    }
  }

  async function deleteConversationFolder(folderId: string) {
    const confirmed = window.confirm(
      "Delete this folder? Conversations stay available.",
    );
    if (!confirmed) return;
    try {
      await fetchJson(`/api/workspace/conversation-folders/${folderId}`, {
        method: "DELETE",
      });
      setConversationFolders((current) =>
        current.filter((folder) => folder.id !== folderId),
      );
      setConversations((current) =>
        current.map((conversation) =>
          conversation.folderId === folderId
            ? { ...conversation, folderId: null }
            : conversation,
        ),
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete folder",
      );
    }
  }

  async function toggleConversationPin(
    conversationId: string,
    isPinned: boolean,
  ) {
    try {
      const data = await fetchJson<{ conversation: ChatConversation }>(
        `/api/workspace/conversations/${conversationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned: isPinned }),
        },
      );
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, ...data.conversation }
            : conversation,
        ),
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update pin",
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
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to move chat",
      );
      await refreshConversations();
    }
  }

  function skipPendingSuggestions() {
    if (!activeConversationId) return;
    void fetch(
      `/api/workspace/conversations/${activeConversationId}/skip-suggestions`,
      { method: "POST" },
    ).catch(() => undefined);
  }

  function queueMessage(content: string) {
    skipPendingSuggestions();
    setQueuedMessages((current) => [...current, createQueuedMessage(content)]);
  }

  function submitMessage() {
    const content =
      input.trim() ||
      (imageAttachments.length > 0 ? "Please analyze the attached image." : "");
    if (!content || !canChat) return;
    if (sending && imageAttachments.length > 0) {
      toast.error("Wait for the current response before sending images.");
      return;
    }
    const attachmentsToSend = imageAttachments;
    setInput("");
    setImageAttachments([]);
    if (sending) {
      queueMessage(content);
      return;
    }
    void handleSubmit(content, {
      codeWorkspaceId:
        interfaceMode === "coding"
          ? codeWorkspaceArtifact?.projectId
          : undefined,
      imageAttachments: attachmentsToSend,
    });
  }

  async function uploadCodeWorkspace(files: File[]) {
    if (!workspaceId || !canChat) return;
    const uploadedFiles = files.filter(Boolean);
    if (uploadedFiles.length === 0) return;
    const zipFiles = uploadedFiles.filter((file) =>
      file.name.toLowerCase().endsWith(".zip"),
    );
    if (zipFiles.length > 0 && uploadedFiles.length > 1) {
      toast.error(
        "Upload one ZIP or select direct HTML/CSS/JS files, not both.",
      );
      return;
    }
    if (
      zipFiles.length === 0 &&
      !uploadedFiles.some((file) => /\.html?$/i.test(uploadPathForFile(file)))
    ) {
      toast.error("Select at least one HTML file, usually index.html.");
      return;
    }
    try {
      const formData = new FormData();
      formData.set("workspaceId", workspaceId);
      if (zipFiles.length === 1) {
        formData.set("file", zipFiles[0]);
      } else {
        for (const file of uploadedFiles) {
          formData.append("files", file, uploadPathForFile(file));
        }
      }
      const response = await fetch("/api/workspace/code-projects/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as {
        artifact?: CodeWorkspaceArtifact;
        prompt?: string;
        error?: string;
      } | null;
      if (!response.ok || !data?.artifact || !data.prompt) {
        throw new Error(data?.error || "Failed to upload code workspace");
      }
      setImageAttachments([]);
      setCodeWorkspaceArtifact(data.artifact);
      setInterfaceMode("coding");
      lastAutoOpenedWorkspaceRef.current = `${data.artifact.projectId}:${data.artifact.version}`;
      toast.success("Code workspace uploaded in chat");
      await handleSubmit(data.prompt, { codeWorkspaceArtifact: data.artifact });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to upload code workspace",
      );
    }
  }

  async function uploadChatImage(file: File) {
    if (!workspaceId || !canChat) return;
    if (imageAttachments.length >= 4) {
      toast.error("You can attach up to 4 images per message.");
      return;
    }
    try {
      const formData = new FormData();
      formData.set("workspaceId", workspaceId);
      formData.set("file", file);
      const response = await fetch("/api/workspace/chat-attachments/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as {
        attachment?: ChatImageAttachment;
        error?: string;
      } | null;
      if (!response.ok || !data?.attachment) {
        throw new Error(data?.error || "Failed to upload image");
      }
      setImageAttachments((current) => [...current, data.attachment!]);
      toast.success("Image attached");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to upload image",
      );
    }
  }

  function submitSuggestion(content: string) {
    const trimmedContent = content.trim();
    if (!trimmedContent || !canChat) return;
    setInput("");
    if (sending) {
      queueMessage(trimmedContent);
      return;
    }
    void handleSubmit(trimmedContent);
  }

  async function setUserDefaultAgent(agentId: string | null) {
    if (!workspaceId) return;
    try {
      const res = await fetch("/api/workspace/agents/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          scope: "user",
          defaultAgentId: agentId,
        }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error || t("defaultSaveFailed"));
      }
      const data = (await res.json()) as {
        organizationDefaultAgentId: string | null;
        userDefaultAgentId: string | null;
      };
      setOrganizationDefaultAgentId(data.organizationDefaultAgentId ?? null);
      setUserDefaultAgentId(data.userDefaultAgentId ?? null);
      toast.success(t("defaultSaved"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("defaultSaveFailed"),
      );
    }
  }

  function updateQueuedMessage(id: string, content: string) {
    setQueuedMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, content } : message,
      ),
    );
  }

  function cancelQueuedMessage(id: string) {
    setQueuedMessages((current) =>
      current.filter((message) => message.id !== id),
    );
  }

  async function editMessage(message: ChatMessage, content: string) {
    if (!activeConversationId) return;
    await fetchJson(
      `/api/workspace/conversations/${activeConversationId}/messages/${message.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      },
    );
    setMessages(
      messages.map((item) =>
        item.id === message.id
          ? {
              ...item,
              status: "completed",
              parts: [{ type: "text", content }],
            }
          : item,
      ),
    );
  }

  async function deleteMessage(message: ChatMessage) {
    if (!activeConversationId) return;
    await fetchJson(
      `/api/workspace/conversations/${activeConversationId}/messages/${message.id}`,
      { method: "DELETE" },
    );
    setMessages(messages.filter((item) => item.id !== message.id));
    await refreshConversations();
  }

  async function resendMessage(message: ChatMessage) {
    if (!activeConversationId || sending) return;
    const content = textFromMessage(message).trim();
    if (!content) return;
    await handleSubmit(content, {
      resendFromMessageId: message.id,
      reuseUserMessage: true,
    });
  }

  async function reloadAgentContext() {
    if (!selectedAgentId || !workspaceId) return;
    setLoadingContext(true);
    try {
      const versionData = await fetchJson<AgentVersion[]>(
        `/api/workspace/agents/${selectedAgentId}/versions?workspaceId=${workspaceId}`,
      );
      setActiveVersion(versionData.find((version) => version.isActive) ?? null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to reload assistant",
      );
    } finally {
      setLoadingContext(false);
    }
  }

  const approveToolInvocation = useCallback(
    (approval: PendingToolApproval) => {
      void resolveApproval("approve", approval.invocationId);
    },
    [resolveApproval],
  );
  const rejectToolInvocation = useCallback(
    (approval: PendingToolApproval) => {
      void resolveApproval("reject", approval.invocationId);
    },
    [resolveApproval],
  );

  if (workspaceLoading || loadingAgents) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="flex size-12 items-center justify-center rounded-full border bg-card">
          <Loader2
            className="size-5 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        </div>
        <div className="flex flex-col items-center gap-1 text-sm">
          <span className="font-medium text-foreground">Loading</span>
          <span className="text-xs text-muted-foreground">
            Fetching your assistants and conversations…
          </span>
        </div>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-center px-4 animate-in-fade">
        <Empty className="min-h-80 w-full">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageSquareIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{t("noAssistants")}</EmptyTitle>
            <EmptyDescription>{t("noAssistantsDescription")}</EmptyDescription>
          </EmptyHeader>
          {canRunSetup ? (
            <div className="flex justify-center">
              <Button asChild>
                <Link href="/setup">
                  <PlusIcon className="size-4" aria-hidden="true" />
                  {t("finishSetup")}
                </Link>
              </Button>
            </div>
          ) : null}
        </Empty>
      </div>
    );
  }

  return (
    <ChatLayout
      agents={agents}
      conversations={conversations}
      conversationFolders={conversationFolders}
      selectedAgent={selectedAgent}
      selectedAgentId={selectedAgentId}
      activeConversationId={activeConversationId}
      organizationDefaultAgentId={organizationDefaultAgentId}
      userDefaultAgentId={userDefaultAgentId}
      canChat={canChat}
      canCreateAgent={canCreateAgent}
      canRunSetup={canRunSetup}
      loadingSidebar={loadingContext}
      hasMoreConversations={hasMoreConversations}
      loadingMoreConversations={loadingMoreConversations}
      onLoadMoreConversations={loadMoreConversations}
      onSelectAgent={selectAgent}
      onSelectConversation={selectConversation}
      onNewConversation={startNewConversation}
      onSetUserDefaultAgent={(agentId: string | null) =>
        void setUserDefaultAgent(agentId)
      }
      onRenameConversation={(conversationId, title) =>
        void renameConversation(conversationId, title)
      }
      onDeleteConversation={(conversationId) =>
        void deleteConversation(conversationId)
      }
      onCreateConversationFolder={(name) => void createConversationFolder(name)}
      onRenameConversationFolder={(folderId, name) =>
        void renameConversationFolder(folderId, name)
      }
      onDeleteConversationFolder={(folderId) =>
        void deleteConversationFolder(folderId)
      }
      onToggleConversationPin={(conversationId, pinned) =>
        void toggleConversationPin(conversationId, pinned)
      }
      onReorderConversations={(input) => void reorderConversations(input)}
      onSetupComplete={() => void reloadAgentContext()}
    >
      <ChatContextBar quota={quota} />
      {codeWorkspaceArtifact ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background px-3 py-2 sm:px-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {codeWorkspaceArtifact.title}
            </p>
            <p className="text-xs text-muted-foreground">
              Code workspace · v{codeWorkspaceArtifact.version}
            </p>
          </div>
          <div className="flex shrink-0 items-center rounded-lg border bg-muted/30 p-0.5">
            <Button
              type="button"
              variant={interfaceMode === "chat" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setInterfaceMode("chat")}
            >
              Chat
            </Button>
            <Button
              type="button"
              variant={interfaceMode === "coding" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setInterfaceMode("coding")}
            >
              Coding
            </Button>
          </div>
        </div>
      ) : null}
      {interfaceMode === "coding" && codeWorkspaceArtifact ? (
        <section className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-background lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-r border-border/60 bg-muted/10">
            <div className="border-b border-border/50 px-3 py-2">
              <p className="text-xs font-medium text-foreground">Chat</p>
              <p className="text-[11px] text-muted-foreground">
                Demande des modifications pendant que tu codes.
              </p>
            </div>
            <section
              ref={scrollContainerRef}
              className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 [overflow-anchor:none]"
            >
              <div ref={scrollContentRef}>
                <ChatMessageList
                  key={activeConversationId ?? "new-conversation"}
                  messages={messages}
                  sending={sending}
                  loading={loadingMessages}
                  workspaceId={workspaceId ?? undefined}
                  workspaceArtifactDisplay="summary"
                  bottomRef={bottomRef}
                  onEditMessage={editMessage}
                  onDeleteMessage={deleteMessage}
                  onResendMessage={resendMessage}
                  onRegenerateAssistant={resendMessage}
                  pendingApprovals={pendingApprovals}
                  onApproveTool={approveToolInvocation}
                  onRejectTool={rejectToolInvocation}
                  onSuggestionClick={submitSuggestion}
                />
              </div>
            </section>
            <ChatComposer
              input={input}
              canChat={canChat}
              sending={sending}
              queuedMessages={queuedMessages}
              onInputChange={setInput}
              onSubmit={submitMessage}
              onStop={stopGeneration}
              onQueuedMessageChange={updateQueuedMessage}
              onQueuedMessageCancel={cancelQueuedMessage}
              onUploadCodeWorkspace={uploadCodeWorkspace}
              onUploadChatImage={uploadChatImage}
              imageAttachments={imageAttachments}
              onRemoveImageAttachment={(attachmentId) =>
                setImageAttachments((current) =>
                  current.filter(
                    (attachment) => attachment.id !== attachmentId,
                  ),
                )
              }
            />
          </aside>
          <div className="min-h-0 overflow-hidden">
            <CodeWorkspaceArtifactCard
              artifact={codeWorkspaceArtifact}
              workspaceId={workspaceId ?? undefined}
              variant="workbench"
            />
          </div>
        </section>
      ) : (
        <section
          ref={scrollContainerRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [overflow-anchor:none] px-3 py-4 sm:px-4 sm:py-8"
        >
          {!loadingMessages && messages.length === 0 ? (
            <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center px-4 py-12 sm:py-16 animate-in-fade">
              <div className="relative flex w-full flex-col items-center gap-5">
                <div className="flex max-w-xl flex-col items-center text-center">
                  {selectedAgent ? (
                    <ModelLogo
                      logoUrl={selectedAgent.logoUrl}
                      label={selectedAgent.name}
                      size="lg"
                      imageFit="cover"
                      className="mb-4 rounded-full"
                    />
                  ) : null}
                  <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                    {canChat
                      ? selectedAgent
                        ? t("emptyTitleNamed", { name: selectedAgent.name })
                        : t("emptyTitle")
                      : t("finishSetup")}
                  </h2>
                  <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                    {canChat
                      ? selectedAgent?.description || t("emptyDescription")
                      : t("emptySetup")}
                  </p>
                </div>

                {canChat &&
                (conversations[0] || emptyPromptSuggestions.length > 0) ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    {conversations[0] ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => selectConversation(conversations[0].id)}
                      >
                        {t("continueLast")}
                      </Button>
                    ) : null}
                    {emptyPromptSuggestions.map((suggestion) => (
                      <Button
                        key={suggestion}
                        type="button"
                        variant="outline"
                        onClick={() => submitSuggestion(suggestion)}
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          <div ref={scrollContentRef}>
            <ChatMessageList
              key={activeConversationId ?? "new-conversation"}
              messages={messages}
              sending={sending}
              loading={loadingMessages}
              workspaceId={workspaceId ?? undefined}
              bottomRef={bottomRef}
              onEditMessage={editMessage}
              onDeleteMessage={deleteMessage}
              onResendMessage={resendMessage}
              onRegenerateAssistant={resendMessage}
              pendingApprovals={pendingApprovals}
              onApproveTool={approveToolInvocation}
              onRejectTool={rejectToolInvocation}
              onSuggestionClick={submitSuggestion}
            />
          </div>
        </section>
      )}
      {interfaceMode === "coding" && codeWorkspaceArtifact ? null : (
        <ChatComposer
          input={input}
          canChat={canChat}
          sending={sending}
          queuedMessages={queuedMessages}
          onInputChange={setInput}
          onSubmit={submitMessage}
          onStop={stopGeneration}
          onQueuedMessageChange={updateQueuedMessage}
          onQueuedMessageCancel={cancelQueuedMessage}
          onUploadCodeWorkspace={uploadCodeWorkspace}
          onUploadChatImage={uploadChatImage}
          imageAttachments={imageAttachments}
          onRemoveImageAttachment={(attachmentId) =>
            setImageAttachments((current) =>
              current.filter((attachment) => attachment.id !== attachmentId),
            )
          }
        />
      )}
    </ChatLayout>
  );
}
