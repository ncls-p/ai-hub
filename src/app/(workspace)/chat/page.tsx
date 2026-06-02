"use client";

import Link from "next/link";
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
	Code2Icon,
	FileTextIcon,
	LightbulbIcon,
	Loader2,
	PenToolIcon,
	PlusIcon,
	Settings2Icon,
	SparklesIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatLayout } from "@/components/chat/chat-layout";
import { ChatMessageList } from "@/components/chat/chat-message-list";
import { QuotaBanner } from "@/components/chat/quota-banner";
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

	function updateOpen(nextOpen: boolean) {
		setOpen(nextOpen);
		window.localStorage.setItem("chat-context-open-v2", String(nextOpen));
	}

	if (!showQuota) return null;

	return (
		<Collapsible
			open={open}
			onOpenChange={updateOpen}
			className="shrink-0 border-b border-border/60 bg-gradient-to-r from-background via-background/98 to-background"
		>
			<div className="mx-auto flex min-h-10 w-full max-w-4xl items-center justify-between gap-3 px-4 py-1.5">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<span className="truncate text-sm font-medium">Chat status</span>
					<Badge
						variant={quotaPercent >= 100 ? "destructive" : "outline"}
						className="rounded-lg border-amber-500/20 bg-amber-500/8 text-[11px] font-medium"
					>
						Usage {quotaPercent}%
					</Badge>
				</div>
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
			<CollapsibleContent>
				<div className="flex flex-col gap-0">
					{showQuota && quota ? (
						<QuotaBanner used={quota.used} limit={quota.limit} />
					) : null}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

export default function ChatPage() {
	const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
	const [agents, setAgents] = useState<ChatAgent[]>([]);
	const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
	const [conversations, setConversations] = useState<ChatConversation[]>([]);
	const [activeVersion, setActiveVersion] = useState<AgentVersion | null>(null);
	const [activeConversationId, setActiveConversationId] = useState<
		string | null
	>(null);
	const [loadingAgents, setLoadingAgents] = useState(true);
	const [loadingContext, setLoadingContext] = useState(false);
	const [loadingMessages, setLoadingMessages] = useState(false);
	const [input, setInput] = useState("");
	const [quota, setQuota] = useState<{ used: number; limit: number } | null>(
		null,
	);
	const bottomRef = useRef<HTMLDivElement | null>(null);
	const scrollContainerRef = useRef<HTMLElement | null>(null);
	const autoFollowRef = useRef(true);
	const programmaticScrollRef = useRef(false);
	const scrollAnimationRef = useRef<number | null>(null);
	const skipNextMessageLoadRef = useRef(false);

	const selectedAgent = useMemo(
		() => agents.find((agent) => agent.id === selectedAgentId) ?? null,
		[agents, selectedAgentId],
	);
	const canChat = Boolean(activeVersion?.providerId && activeVersion?.modelId);

	const refreshConversations = useCallback(async () => {
		if (!workspaceId) return;
		const data = await fetchJson<ChatConversation[]>(
			`/api/workspace/conversations?workspaceId=${workspaceId}`,
		);
		setConversations(data);
	}, [workspaceId]);

	const {
		messages,
		setMessages,
		sending,
		pendingApprovals,
		handleSubmit,
		resolveApproval,
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
		onConversationsRefresh: refreshConversations,
	});

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
				const conversationData = await fetchJson<ChatConversation[]>(
					`/api/workspace/conversations?workspaceId=${workspaceId}`,
					{ signal: controller.signal },
				);
				if (cancelled) return;
				setConversations(conversationData);
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
	}, [workspaceId]);

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
					conversation?: { agentId?: string };
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

	const scrollToConversationBottom = useCallback(() => {
		const container = scrollContainerRef.current;
		if (!container || !autoFollowRef.current) return;

		programmaticScrollRef.current = true;
		container.scrollTop = container.scrollHeight;
		requestAnimationFrame(() => {
			programmaticScrollRef.current = false;
		});
	}, []);

	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;

		function updateAutoFollow() {
			if (programmaticScrollRef.current) return;
			const c = scrollContainerRef.current;
			if (!c) return;
			const distanceFromBottom = c.scrollHeight - c.scrollTop - c.clientHeight;
			autoFollowRef.current = distanceFromBottom < 180;
		}

		function handleWheel(event: WheelEvent) {
			programmaticScrollRef.current = false;
			cancelScrollAnimation();
			if (event.deltaY < 0) {
				autoFollowRef.current = false;
				return;
			}
			updateAutoFollow();
		}

		updateAutoFollow();
		container.addEventListener("scroll", updateAutoFollow, { passive: true });
		container.addEventListener("wheel", handleWheel, { passive: true });
		return () => {
			container.removeEventListener("scroll", updateAutoFollow);
			container.removeEventListener("wheel", handleWheel);
		};
	}, [cancelScrollAnimation]);

	useLayoutEffect(() => {
		scrollToConversationBottom();
	}, [messages, pendingApprovals, scrollToConversationBottom]);

	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;

		const observer = new ResizeObserver(() => {
			if (autoFollowRef.current) scrollToConversationBottom();
		});
		observer.observe(container);
		return () => {
			observer.disconnect();
		};
	}, [scrollToConversationBottom]);

	useEffect(() => {
		return () => {
			cancelScrollAnimation();
		};
	}, [cancelScrollAnimation]);

	function selectAgent(agentId: string) {
		setSelectedAgentId(agentId);
		setActiveVersion(null);
		const params = new URLSearchParams({ agentId });
		if (activeConversationId) {
			params.set("conversationId", activeConversationId);
		}
		window.history.replaceState(null, "", `/chat?${params.toString()}`);
	}

	function selectConversation(conversationId: string) {
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
			setActiveConversationId(null);
			setMessages([]);
			window.history.replaceState(
				null,
				"",
				selectedAgentId ? `/chat?agentId=${selectedAgentId}` : "/chat",
			);
		}
	}

	function submitMessage() {
		const content = input.trim();
		if (!content || !canChat || sending) return;
		setInput("");
		void handleSubmit(content);
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
					<div className="absolute inset-0 animate-ping rounded-full bg-primary/10" />
					<div className="relative flex size-12 items-center justify-center rounded-full bg-primary/10">
						<Loader2
							className="size-6 animate-spin text-primary"
							aria-hidden="true"
						/>
					</div>
				</div>
				<div className="flex flex-col items-center gap-1 text-sm">
					<span className="font-medium text-foreground">Loading workspace</span>
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
						<EmptyMedia
							variant="icon"
							className="glow-primary-hover group relative"
						>
							<div className="absolute inset-0 animate-ping rounded-full bg-primary/10" />
							<BotIcon className="relative" aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>No assistants configured</EmptyTitle>
						<EmptyDescription>
							Run the short setup flow to connect a model provider and create
							your first AI assistant — it only takes a minute.
						</EmptyDescription>
					</EmptyHeader>
					<div className="flex flex-wrap justify-center gap-2">
						<Button
							asChild
							className="gap-2 transition-all duration-200 hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-0.5 active:translate-y-0"
						>
							<Link href="/setup">
								<PlusIcon className="size-4" aria-hidden="true" />
								Start setup
							</Link>
						</Button>
						<Button
							asChild
							variant="outline"
							className="gap-2 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
						>
							<Link href="/agents">Manage assistants</Link>
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
			<ChatContextBar quota={quota} />
			<section
				ref={scrollContainerRef}
				className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-4 sm:py-8"
			>
				{!loadingMessages && messages.length === 0 ? (
					<div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center px-4 py-12 sm:py-16 animate-in-fade">
						{/* Decorative orbs */}
						<div className="pointer-events-none absolute inset-0 overflow-hidden">
							<div className="orb orb--primary orb--top-left" />
							<div className="orb orb--muted orb--bottom-right" />
						</div>

						<div className="relative flex w-full flex-col items-center gap-6">
							{/* Icon */}
							<div
								className={cn(
									"relative mb-2 flex size-16 items-center justify-center rounded-2xl shadow-lg ring-1 transition-all duration-500",
									canChat
										? "bg-gradient-to-br from-primary/10 to-primary/5 ring-primary/20 glow-primary-hover"
										: "bg-muted/50 ring-border/60",
								)}
							>
								<div
									className={cn(
										"absolute inset-0 animate-ping rounded-2xl",
										canChat ? "bg-primary/10" : "bg-transparent",
									)}
								/>
								<BotIcon
									className={cn(
										"relative size-8 transition-all duration-300",
										canChat ? "text-primary" : "text-muted-foreground",
									)}
									aria-hidden="true"
								/>
							</div>

							{/* Title and description */}
							<div className="text-center">
								<h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
									{canChat
										? "What can I help you with?"
										: "Finish setup to start chatting"}
								</h2>
								<p className="mt-2 max-w-sm text-sm text-muted-foreground">
									{canChat
										? "Start a conversation or try one of these suggestions to get inspired."
										: "Connect a provider and pick a model to unlock your assistant."}
								</p>
							</div>

							{/* Suggestion cards */}
							{canChat ? (
								<div className="grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
									{[
										{
											icon: (
												<PenToolIcon className="size-4" aria-hidden="true" />
											),
											label: "Draft a system prompt",
											color:
												"from-blue-500/10 to-cyan-500/10 dark:from-blue-400/20 dark:to-cyan-400/20",
											borderColor:
												"hover:border-blue-500/30 dark:hover:border-blue-400/40",
											iconColor: "text-blue-500 dark:text-blue-400",
										},
										{
											icon: <Code2Icon className="size-4" aria-hidden="true" />,
											label: "Compare model options",
											color:
												"from-emerald-500/10 to-teal-500/10 dark:from-emerald-400/20 dark:to-teal-400/20",
											borderColor:
												"hover:border-emerald-500/30 dark:hover:border-emerald-400/40",
											iconColor: "text-emerald-500 dark:text-emerald-400",
										},
										{
											icon: (
												<FileTextIcon className="size-4" aria-hidden="true" />
											),
											label: "Write a support reply",
											color:
												"from-amber-500/10 to-orange-500/10 dark:from-amber-400/20 dark:to-orange-400/20",
											borderColor:
												"hover:border-amber-500/30 dark:hover:border-amber-400/40",
											iconColor: "text-amber-500 dark:text-amber-400",
										},
										{
											icon: (
												<LightbulbIcon className="size-4" aria-hidden="true" />
											),
											label: "Brainstorm project ideas",
											color:
												"from-violet-500/10 to-purple-500/10 dark:from-violet-400/20 dark:to-purple-400/20",
											borderColor:
												"hover:border-violet-500/30 dark:hover:border-violet-400/40",
											iconColor: "text-violet-500 dark:text-violet-400",
										},
										{
											icon: (
												<SparklesIcon className="size-4" aria-hidden="true" />
											),
											label: "Explain a concept",
											color:
												"from-pink-500/10 to-rose-500/10 dark:from-pink-400/20 dark:to-rose-400/20",
											borderColor:
												"hover:border-pink-500/30 dark:hover:border-pink-400/40",
											iconColor: "text-pink-500 dark:text-pink-400",
										},
										{
											icon: <BotIcon className="size-4" aria-hidden="true" />,
											label: "Build an AI workflow",
											color:
												"from-indigo-500/10 to-blue-500/10 dark:from-indigo-400/20 dark:to-blue-400/20",
											borderColor:
												"hover:border-indigo-500/30 dark:hover:border-indigo-400/40",
											iconColor: "text-indigo-500 dark:text-indigo-400",
										},
									].map((item, index) => (
										<button
											key={item.label}
											type="button"
											onClick={() => setInput(item.label)}
											className={cn(
												"group flex items-center gap-3 rounded-xl border border-border/50 bg-gradient-to-br p-3.5 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0",
												"animate-in-fade",
												item.color,
												item.borderColor,
											)}
											style={{ animationDelay: `${0.05 * (index + 1)}s` }}
										>
											<div
												className={cn(
													"flex size-8 shrink-0 items-center justify-center rounded-lg bg-background/80 transition-colors group-hover:text-primary",
													item.iconColor,
												)}
											>
												{item.icon}
											</div>
											<span className="text-sm font-medium text-foreground">
												{item.label}
											</span>
										</button>
									))}
								</div>
							) : (
								<Button
									asChild
									size="sm"
									className="gap-2 transition-all duration-200 hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-0.5 active:translate-y-0"
								>
									<Link
										href={
											selectedAgentId ? `/agents/${selectedAgentId}` : "/agents"
										}
									>
										<Settings2Icon className="size-4" aria-hidden="true" />
										Configure assistant
									</Link>
								</Button>
							)}
						</div>
					</div>
				) : null}
				<ChatMessageList
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
				/>
			</section>
			<ChatComposer
				input={input}
				canChat={canChat}
				sending={sending}
				onInputChange={setInput}
				onSubmit={submitMessage}
			/>
		</ChatLayout>
	);
}
