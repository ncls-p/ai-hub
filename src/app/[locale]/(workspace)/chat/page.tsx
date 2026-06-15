"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	BotIcon,
	ChevronDownIcon,
	Loader2,
	PlusIcon,
	Settings2Icon,
} from "lucide-react";
import { toast } from "sonner";

import {
	ChatComposer,
	type QueuedChatMessage,
} from "@/components/chat/chat-composer";
import { ChatLayout } from "@/components/chat/chat-layout";
import { ChatMessageList } from "@/components/chat/chat-message-list";
import { QuotaBanner } from "@/components/chat/quota-banner";
import { ScheduledTaskManager } from "@/components/chat/scheduled-task-manager";
import { textFromMessage } from "@/components/chat/chat-types";
import type {
	AgentVersion,
	ChatAgent,
	ChatConversation,
	ChatMessage,
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

type ConversationListPage = {
	conversations: ChatConversation[];
	hasMore: boolean;
	nextCursor: string | null;
};

type ConversationListPayload = ChatConversation[] | ConversationListPage;

function normalizeConversationList(
	payload: ConversationListPayload,
): ConversationListPage {
	if (Array.isArray(payload)) {
		return { conversations: payload, hasMore: false, nextCursor: null };
	}
	return {
		conversations: payload.conversations ?? [],
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

function ChatContextBar({
	quota,
	workspaceId,
	agents,
	selectedAgentId,
	activeConversationId,
}: {
	quota: { used: number; limit: number } | null;
	workspaceId: string | null;
	agents: ChatAgent[];
	selectedAgentId: string | null;
	activeConversationId: string | null;
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

	function updateOpen(nextOpen: boolean) {
		setOpen(nextOpen);
		window.localStorage.setItem("chat-context-open-v2", String(nextOpen));
	}

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
					<ScheduledTaskManager
						workspaceId={workspaceId}
						agents={agents}
						selectedAgentId={selectedAgentId}
						activeConversationId={activeConversationId}
					/>
					{showQuota ? (
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
					) : null}
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
	const [conversations, setConversations] = useState<ChatConversation[]>([]);
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

	const selectedAgent = useMemo(
		() => agents.find((agent) => agent.id === selectedAgentId) ?? null,
		[agents, selectedAgentId],
	);
	const canChat = Boolean(activeVersion?.providerId && activeVersion?.modelId);

	const fetchConversationPage = useCallback(
		async ({
			before,
			signal,
		}: {
			before?: string | null;
			signal?: AbortSignal;
		} = {}) => {
			if (!workspaceId) {
				return { conversations: [], hasMore: false, nextCursor: null };
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
		onConversationCreated: (conversationId) => {
			skipNextMessageLoadRef.current = true;
			setActiveConversationId(conversationId);
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
			void handleSubmit(nextMessage.content.trim()).finally(() => {
				processingQueuedMessageRef.current = false;
			});
		});
	}, [canChat, handleSubmit, queuedMessages, sending]);

	useEffect(() => {
		if (!workspaceId) return;
		let cancelled = false;
		const controller = new AbortController();

		async function loadAgents() {
			try {
				const response = await fetchJson<
					{ agents?: ChatAgent[] } | ChatAgent[]
				>(`/api/workspace/agents?workspaceId=${workspaceId}`, {
					signal: controller.signal,
				});
				const data = (
					Array.isArray(response) ? response : (response.agents ?? [])
				) as ChatAgent[];
				if (cancelled) return;

				setAgents(data);
				const params = new URL(window.location.href).searchParams;
				const requestedAgentId = params.get("agentId");
				const requestedConversationId = params.get("conversationId");
				setSelectedAgentId(
					requestedAgentId &&
						data.some((agent) => agent.id === requestedAgentId)
						? requestedAgentId
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
			setMessages([]);
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
				setMessages(data.messages ?? []);
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
	}, []);

	const detachFromBottom = useCallback(() => {
		userDetachedRef.current = true;
		stickToBottomRef.current = false;
	}, []);

	const scrollToConversationBottom = useCallback(() => {
		const container = scrollContainerRef.current;
		if (!container || !stickToBottomRef.current) return;

		programmaticScrollRef.current = true;
		container.scrollTop = container.scrollHeight;
		lastScrollTopRef.current = container.scrollTop;
		requestAnimationFrame(() => {
			programmaticScrollRef.current = false;
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

	useLayoutEffect(() => {
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
		setQueuedMessages([]);
		setSelectedAgentId(agentId);
		setActiveVersion(null);
		const params = new URLSearchParams({ agentId });
		if (activeConversationId) {
			params.set("conversationId", activeConversationId);
		}
		window.history.replaceState(null, "", `/chat?${params.toString()}`);
	}

	function selectConversation(conversationId: string) {
		setQueuedMessages([]);
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
			window.history.replaceState(
				null,
				"",
				selectedAgentId ? `/chat?agentId=${selectedAgentId}` : "/chat",
			);
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
		const content = input.trim();
		if (!content || !canChat) return;
		setInput("");
		if (sending) {
			queueMessage(content);
			return;
		}
		void handleSubmit(content);
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

	if (workspaceLoading || loadingAgents) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-4">
				<div className="relative">
					<div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
						<Loader2
							className="size-6 animate-spin text-primary"
							aria-hidden="true"
						/>
					</div>
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
			<div className="mx-auto flex h-full w-full max-w-3xl items-center justify-center px-4 animate-in-up">
				<Empty className="min-h-80 w-full surface-panel">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<BotIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>{t("noAssistants")}</EmptyTitle>
						<EmptyDescription>{t("noAssistantsDescription")}</EmptyDescription>
					</EmptyHeader>
					<div className="flex flex-wrap justify-center gap-2">
						<Button asChild>
							<Link href="/setup">
								<PlusIcon className="size-4" aria-hidden="true" />
								{t("finishSetup")}
							</Link>
						</Button>
						<Button asChild variant="outline">
							<Link href="/agents">{t("manageAssistants")}</Link>
						</Button>
					</div>
				</Empty>
			</div>
		);
	}

	return (
		<ChatLayout
			agents={agents}
			conversations={conversations}
			selectedAgent={selectedAgent}
			selectedAgentId={selectedAgentId}
			activeConversationId={activeConversationId}
			canChat={canChat}
			loadingSidebar={loadingContext}
			hasMoreConversations={hasMoreConversations}
			loadingMoreConversations={loadingMoreConversations}
			onLoadMoreConversations={loadMoreConversations}
			onSelectAgent={selectAgent}
			onSelectConversation={selectConversation}
			onNewConversation={startNewConversation}
			onRenameConversation={(conversationId, title) =>
				void renameConversation(conversationId, title)
			}
			onDeleteConversation={(conversationId) =>
				void deleteConversation(conversationId)
			}
			onSetupComplete={() => void reloadAgentContext()}
		>
			<ChatContextBar
				quota={quota}
				workspaceId={workspaceId}
				agents={agents}
				selectedAgentId={selectedAgentId}
				activeConversationId={activeConversationId}
			/>
			<section
				ref={scrollContainerRef}
				className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [overflow-anchor:none] px-3 py-4 sm:px-4 sm:py-8"
			>
				{!loadingMessages && messages.length === 0 ? (
					<div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center px-4 py-12 sm:py-16 animate-in-fade">
						<div className="relative flex w-full flex-col items-center gap-6">
							{/* Icon */}
							<div
								className={cn(
									"mb-2 flex size-16 items-center justify-center rounded-2xl border",
									canChat
										? "border-primary/20 bg-primary/10 text-primary"
										: "border-border bg-muted/50 text-muted-foreground",
								)}
							>
								<BotIcon className="size-8" aria-hidden="true" />
							</div>

							<div className="text-center">
								<h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
									{canChat
										? selectedAgent
											? t("emptyTitleNamed", { name: selectedAgent.name })
											: t("emptyTitle")
										: t("finishSetup")}
								</h2>
								<p className="mt-2 max-w-sm text-sm text-muted-foreground">
									{canChat ? t("emptyDescription") : t("emptySetup")}
								</p>
							</div>

							<div className="flex flex-wrap justify-center gap-2">
								{canChat && conversations[0] ? (
									<Button
										type="button"
										variant="outline"
										onClick={() => selectConversation(conversations[0].id)}
									>
										{t("continueLast")}
									</Button>
								) : null}
								{canChat && selectedAgentId ? (
									<Button asChild variant="outline">
										<Link href={`/agents/${selectedAgentId}`}>
											<Settings2Icon className="size-4" aria-hidden="true" />
											{t("openSettings")}
										</Link>
									</Button>
								) : null}
								{!canChat ? (
									<Button asChild>
										<Link href="/setup">
											<Settings2Icon className="size-4" aria-hidden="true" />
											{t("finishSetup")}
										</Link>
									</Button>
								) : null}
							</div>
						</div>
					</div>
				) : null}
				<div ref={scrollContentRef}>
					<ChatMessageList
						key={activeConversationId ?? "new-conversation"}
						messages={messages}
						sending={sending}
						loading={loadingMessages}
						bottomRef={bottomRef}
						onEditMessage={editMessage}
						onDeleteMessage={deleteMessage}
						onResendMessage={resendMessage}
						onRegenerateAssistant={resendMessage}
						pendingApprovals={pendingApprovals}
						onApproveTool={(approval) =>
							void resolveApproval("approve", approval.invocationId)
						}
						onRejectTool={(approval) =>
							void resolveApproval("reject", approval.invocationId)
						}
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
			/>
		</ChatLayout>
	);
}
