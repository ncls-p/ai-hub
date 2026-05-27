"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BotIcon, Loader2, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatLayout } from "@/components/chat/chat-layout";
import { ChatMessageList } from "@/components/chat/chat-message-list";
import { QuotaBanner } from "@/components/chat/quota-banner";
import { ToolApprovalBanner } from "@/components/chat/tool-approval-banner";
import type {
	AgentVersion,
	ChatAgent,
	ChatConversation,
	ChatMessage,
} from "@/components/chat/chat-types";
import { Button } from "@/components/ui/button";
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

export default function ChatPage() {
	const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
	const [agents, setAgents] = useState<ChatAgent[]>([]);
	const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
	const [conversations, setConversations] = useState<ChatConversation[]>([]);
	const [activeVersion, setActiveVersion] = useState<AgentVersion | null>(
		null,
	);
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

	const selectedAgent = useMemo(
		() => agents.find((agent) => agent.id === selectedAgentId) ?? null,
		[agents, selectedAgentId],
	);
	const canChat = Boolean(activeVersion?.providerId && activeVersion?.modelId);

	const refreshConversations = async (agentId: string) => {
		const data = await fetchJson<ChatConversation[]>(
			`/api/workspace/conversations?agentId=${agentId}`,
		);
		setConversations(data);
	};

	const {
		messages,
		setMessages,
		sending,
		pendingApproval,
		handleSubmit,
		resolveApproval,
	} = useChatStream({
		agentId: selectedAgentId,
		conversationId: activeConversationId,
		canChat,
		onConversationCreated: setActiveConversationId,
		onConversationsRefresh: async () => {
			if (selectedAgentId) await refreshConversations(selectedAgentId);
		},
	});

	useEffect(() => {
		if (!workspaceId) return;
		let cancelled = false;
		const controller = new AbortController();

		async function loadAgents() {
			try {
				const response = await fetchJson<{ agents?: ChatAgent[] } | ChatAgent[]>(
					`/api/workspace/agents?workspaceId=${workspaceId}`,
					{ signal: controller.signal },
				);
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
		if (!selectedAgentId || !workspaceId) return;
		let cancelled = false;
		const controller = new AbortController();
		queueMicrotask(() => setLoadingContext(true));

		async function loadAgentChatContext() {
			try {
				const [conversationData, versionData] = await Promise.all([
					fetchJson<ChatConversation[]>(
						`/api/workspace/conversations?agentId=${selectedAgentId}`,
						{ signal: controller.signal },
					),
					fetchJson<AgentVersion[]>(
						`/api/workspace/agents/${selectedAgentId}/versions?workspaceId=${workspaceId}`,
						{ signal: controller.signal },
					),
				]);
				if (cancelled) return;
				setConversations(conversationData);
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

		void loadAgentChatContext();
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
			setMessages([]);
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
				if (data.conversation?.agentId) {
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
	}, [messages, pendingApproval]);

	function selectAgent(agentId: string) {
		setSelectedAgentId(agentId);
		setActiveVersion(null);
		setActiveConversationId(null);
		setMessages([]);
		window.history.replaceState(null, "", `/chat?agentId=${agentId}`);
	}

	function startNewConversation() {
		setActiveConversationId(null);
		setMessages([]);
	}

	async function reloadAgentContext() {
		if (!selectedAgentId || !workspaceId) return;
		setLoadingContext(true);
		try {
			const versionData = await fetchJson<AgentVersion[]>(
				`/api/workspace/agents/${selectedAgentId}/versions?workspaceId=${workspaceId}`,
			);
			setActiveVersion(
				versionData.find((version) => version.isActive) ?? null,
			);
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
							Create and configure an agent before starting a chat.
						</EmptyDescription>
					</EmptyHeader>
					<div className="flex flex-wrap gap-2">
						<Button asChild>
							<Link href="/agents">
								<PlusIcon data-icon="inline-start" aria-hidden="true" />
								Create agent
							</Link>
						</Button>
						<Button asChild variant="outline">
							<Link href="/providers">Add provider</Link>
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
			onSelectConversation={setActiveConversationId}
			onNewConversation={startNewConversation}
			onSetupComplete={() => void reloadAgentContext()}
		>
			{quota ? <QuotaBanner used={quota.used} limit={quota.limit} /> : null}
			<section className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
				{pendingApproval ? (
					<div className="mb-4">
						<ToolApprovalBanner
							approval={pendingApproval}
							onApprove={() => void resolveApproval("approve")}
							onReject={() => void resolveApproval("reject")}
						/>
					</div>
				) : null}
				<ChatMessageList
					messages={messages}
					sending={sending}
					loading={loadingMessages}
					bottomRef={bottomRef}
				/>
			</section>
			<ChatComposer
				input={input}
				canChat={canChat}
				sending={sending}
				hasMessages={messages.length > 0}
				onInputChange={setInput}
				onSubmit={() => void handleSubmit(input.trim())}
			/>
		</ChatLayout>
	);
}
