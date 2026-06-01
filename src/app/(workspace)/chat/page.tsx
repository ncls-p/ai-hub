"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BotIcon, ChevronDownIcon, Loader2, PlusIcon } from "lucide-react";
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
	EmptyContent,
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
	const hasItems = showQuota;

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

	if (!hasItems) return null;

	return (
		<Collapsible
			open={open}
			onOpenChange={updateOpen}
			className="shrink-0 border-b border-border/70 bg-background/95"
		>
			<div className="mx-auto flex min-h-11 w-full max-w-3xl items-center justify-between gap-3 px-4 py-2">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<span className="truncate text-sm font-medium">Chat status</span>
					{showQuota ? (
						<Badge variant={quotaPercent >= 100 ? "destructive" : "outline"}>
							Usage {quotaPercent}%
						</Badge>
					) : null}
				</div>
				<CollapsibleTrigger asChild>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						aria-label={open ? "Hide chat status" : "Show chat status"}
					>
						<ChevronDownIcon
							data-icon="inline-start"
							aria-hidden="true"
							className={cn("transition-transform", !open && "-rotate-90")}
						/>
						{open ? "Hide" : "Show"}
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

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, pendingApprovals]);

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
			<div className="flex h-full items-center justify-center">
				<Loader2
					className="animate-spin text-muted-foreground"
					aria-hidden="true"
				/>
			</div>
		);
	}

	if (agents.length === 0) {
		return (
			<div className="mx-auto flex h-full w-full max-w-3xl items-center px-4">
				<Empty className="min-h-80 w-full border border-border/70 bg-background/55">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<BotIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>No agents available</EmptyTitle>
						<EmptyDescription>
							Run the short setup flow to connect a model and create your first
							assistant.
						</EmptyDescription>
					</EmptyHeader>
					<div className="flex flex-wrap gap-2">
						<Button asChild>
							<Link href="/setup">
								<PlusIcon data-icon="inline-start" aria-hidden="true" />
								Start setup
							</Link>
						</Button>
						<Button asChild variant="outline">
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
			<section className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-4 sm:py-8">
				{!loadingMessages && messages.length === 0 ? (
					<div className="mx-auto flex h-full w-full max-w-4xl flex-col items-center justify-center py-16">
						<Empty className="min-h-64 border-0 bg-transparent p-6">
							<EmptyHeader>
								<EmptyMedia
									variant="icon"
									className={cn(
										"bg-card/90 shadow-sm ring-1 ring-border/70",
										canChat && "bg-primary/5 ring-primary/20",
									)}
								>
									<BotIcon
										className={cn(canChat && "text-primary")}
										aria-hidden="true"
									/>
								</EmptyMedia>
								<EmptyTitle>
									{canChat
										? "What can I help you with?"
										: "Finish setup to start chatting"}
								</EmptyTitle>
								<EmptyDescription>
									{canChat
										? "Send a message below or try one of these prompts."
										: "Connect a provider and pick a model to get started."}
								</EmptyDescription>
							</EmptyHeader>
							<EmptyContent className="flex flex-col gap-3">
								{canChat ? (
									<div className="flex flex-wrap justify-center gap-2">
										{[
											"Draft a system prompt",
											"Compare model options",
											"Write a support reply",
										].map((prompt) => (
											<Button
												key={prompt}
												type="button"
												variant="outline"
												size="sm"
												onClick={() => setInput(prompt)}
											>
												{prompt}
											</Button>
										))}
									</div>
								) : (
									<Button asChild size="sm">
										<Link
											href={
												selectedAgentId
													? `/agents/${selectedAgentId}`
													: "/agents"
											}
										>
											Configure assistant
										</Link>
									</Button>
								)}
							</EmptyContent>
						</Empty>
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
