"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	BotIcon,
	Loader2,
	MessageSquareIcon,
	PlusIcon,
	SendIcon,
	SparklesIcon,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

interface Agent {
	id: string;
	name: string;
	description: string | null;
	activeVersionId: string | null;
}

interface Conversation {
	id: string;
	title: string;
	agentId: string;
	updatedAt: string;
}

interface AgentVersion {
	id: string;
	providerId: string | null;
	modelId: string | null;
	isActive: boolean;
}

interface ChatMessage {
	id: string;
	role: "user" | "assistant" | "system" | "tool";
	status?: string;
	parts: Array<{ type: string; content: string }>;
	createdAt?: string;
}

function getBrowserWorkspaceId() {
	if (typeof window === "undefined") return null;
	return window.sessionStorage.getItem("active_workspace_id");
}

function textFromMessage(message: ChatMessage) {
	return message.parts
		.filter((part) => part.type === "text")
		.map((part) => part.content)
		.join("\n");
}

function toolPartsFromMessage(message: ChatMessage) {
	return message.parts.filter(
		(part) => part.type === "tool-call" || part.type === "tool-result",
	);
}

function summarizeToolPart(content: string) {
	try {
		const parsed = JSON.parse(content) as {
			toolName?: string;
			output?: unknown;
		};
		return (
			parsed.toolName ?? JSON.stringify(parsed.output ?? parsed).slice(0, 120)
		);
	} catch {
		return content.slice(0, 120);
	}
}

function createLocalMessage(
	role: "user" | "assistant",
	content: string,
): ChatMessage {
	return {
		id: typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}`,
		role,
		status: role === "assistant" ? "streaming" : "completed",
		parts: [{ type: "text", content }],
	};
}

export default function ChatPage() {
	const [workspaceId, setWorkspaceId] = useState<string | null>(() =>
		getBrowserWorkspaceId(),
	);
	const [agents, setAgents] = useState<Agent[]>([]);
	const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [activeVersion, setActiveVersion] = useState<AgentVersion | null>(null);
	const [activeConversationId, setActiveConversationId] = useState<
		string | null
	>(null);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState("");
	const [loading, setLoading] = useState(true);
	const [sending, setSending] = useState(false);
	const bottomRef = useRef<HTMLDivElement | null>(null);

	const selectedAgent = useMemo(
		() => agents.find((agent) => agent.id === selectedAgentId) ?? null,
		[agents, selectedAgentId],
	);
	const canChat = Boolean(activeVersion?.providerId && activeVersion?.modelId);

	useEffect(() => {
		if (workspaceId) return;
		let cancelled = false;

		async function loadWorkspace() {
			try {
				const res = await fetch("/api/workspaces");
				const data = await res.json();
				if (cancelled || !Array.isArray(data) || data.length === 0) return;

				const id = data[0].workspace?.id || data[0].id;
				if (id) {
					setWorkspaceId(id);
					window.sessionStorage.setItem("active_workspace_id", id);
				}
			} catch {
				toast.error("Unable to load workspace");
			}
		}

		void loadWorkspace();
		return () => {
			cancelled = true;
		};
	}, [workspaceId]);

	useEffect(() => {
		if (!workspaceId) return;
		let cancelled = false;
		const controller = new AbortController();

		async function loadAgents() {
			try {
				const res = await fetch(
					`/api/workspace/agents?workspaceId=${workspaceId}`,
					{
						signal: controller.signal,
					},
				);
				if (!res.ok) throw new Error("Failed to load agents");
				const data = (await res.json()) as Agent[];
				if (cancelled) return;

				setAgents(data);
				const requestedAgentId = new URL(window.location.href).searchParams.get(
					"agentId",
				);
				setSelectedAgentId(
					requestedAgentId &&
						data.some((agent) => agent.id === requestedAgentId)
						? requestedAgentId
						: (data[0]?.id ?? null),
				);
			} catch (err) {
				if (err instanceof Error && err.name !== "AbortError") {
					toast.error(err.message);
				}
			} finally {
				if (!cancelled) setLoading(false);
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

		async function loadAgentChatContext() {
			try {
				const [conversationRes, versionRes] = await Promise.all([
					fetch(`/api/workspace/conversations?agentId=${selectedAgentId}`, {
						signal: controller.signal,
					}),
					fetch(
						`/api/workspace/agents/${selectedAgentId}/versions?workspaceId=${workspaceId}`,
						{
							signal: controller.signal,
						},
					),
				]);
				if (!conversationRes.ok)
					throw new Error("Failed to load conversations");
				if (!versionRes.ok) throw new Error("Failed to load agent version");

				const conversationData =
					(await conversationRes.json()) as Conversation[];
				const versionData = (await versionRes.json()) as AgentVersion[];
				if (cancelled) return;
				setConversations(conversationData);
				setActiveVersion(
					versionData.find((version) => version.isActive) ?? null,
				);
			} catch (err) {
				if (err instanceof Error && err.name !== "AbortError") {
					toast.error(err.message);
				}
			}
		}

		void loadAgentChatContext();
		return () => {
			cancelled = true;
			controller.abort();
		};
	}, [selectedAgentId, workspaceId]);

	useEffect(() => {
		if (!activeConversationId) return;
		let cancelled = false;
		const controller = new AbortController();

		async function loadMessages() {
			try {
				const res = await fetch(
					`/api/workspace/conversations/${activeConversationId}`,
					{
						signal: controller.signal,
					},
				);
				if (!res.ok) throw new Error("Failed to load conversation");
				const data = await res.json();
				if (!cancelled) setMessages(data.messages ?? []);
			} catch (err) {
				if (err instanceof Error && err.name !== "AbortError") {
					toast.error(err.message);
				}
			}
		}

		void loadMessages();
		return () => {
			cancelled = true;
			controller.abort();
		};
	}, [activeConversationId]);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	async function refreshConversations(agentId: string) {
		const res = await fetch(`/api/workspace/conversations?agentId=${agentId}`);
		if (res.ok) setConversations((await res.json()) as Conversation[]);
	}

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

	async function handleSubmit(event: { preventDefault: () => void }) {
		event.preventDefault();
		const content = input.trim();
		if (!content || !selectedAgentId || !canChat || sending) return;

		const userMessage = createLocalMessage("user", content);
		const assistantMessage = createLocalMessage("assistant", "");
		setMessages((current) => [...current, userMessage, assistantMessage]);
		setInput("");
		setSending(true);

		try {
			const res = await fetch(`/api/workspace/${selectedAgentId}/chat`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					content,
					conversationId: activeConversationId ?? undefined,
				}),
			});

			if (!res.ok || !res.body) {
				const error = await res.json().catch(() => null);
				throw new Error(error?.error || "Chat request failed");
			}

			const conversationId = res.headers.get("X-Conversation-Id");
			if (conversationId && !activeConversationId) {
				setActiveConversationId(conversationId);
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let assistantText = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				assistantText += decoder.decode(value, { stream: true });
				setMessages((current) =>
					current.map((message) =>
						message.id === assistantMessage.id
							? {
									...message,
									parts: [{ type: "text", content: assistantText }],
								}
							: message,
					),
				);
			}

			assistantText += decoder.decode();
			setMessages((current) =>
				current.map((message) =>
					message.id === assistantMessage.id
						? {
								...message,
								status: "completed",
								parts: [{ type: "text", content: assistantText }],
							}
						: message,
				),
			);

			await refreshConversations(selectedAgentId);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Chat request failed");
			setMessages((current) =>
				current.map((message) =>
					message.id === assistantMessage.id
						? {
								...message,
								status: "failed",
								parts: [
									{ type: "text", content: "The assistant failed to respond." },
								],
							}
						: message,
				),
			);
		} finally {
			setSending(false);
		}
	}

	if (loading) {
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
					<Button asChild>
						<Link href="/agents">
							<PlusIcon data-icon="inline-start" aria-hidden="true" />
							Create agent
						</Link>
					</Button>
				</Empty>
			</div>
		);
	}

	return (
		<div className="grid h-full min-h-0 bg-background lg:grid-cols-[18rem_1fr]">
			<aside className="hidden min-h-0 border-r border-border/70 bg-card/40 lg:flex lg:flex-col">
				<div className="flex items-center justify-between border-b border-border/70 p-3">
					<div className="flex items-center gap-2 text-sm font-medium">
						<SparklesIcon aria-hidden="true" />
						Chat
					</div>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={startNewConversation}
					>
						<PlusIcon data-icon="inline-start" aria-hidden="true" />
						New
					</Button>
				</div>

				<div className="flex flex-col gap-3 overflow-y-auto p-3">
					<div className="flex flex-col gap-2">
						<div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							Agents
						</div>
						{agents.map((agent) => (
							<button
								key={agent.id}
								type="button"
								onClick={() => selectAgent(agent.id)}
								className={cn(
									"rounded-xl border border-transparent px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
									selectedAgentId === agent.id &&
										"border-border bg-card shadow-sm",
								)}
							>
								<span className="block font-medium">{agent.name}</span>
								<span className="block truncate text-xs text-muted-foreground">
									{agent.id === selectedAgentId && !canChat
										? "Needs configuration"
										: "Agent workspace"}
								</span>
							</button>
						))}
					</div>

					<div className="flex flex-col gap-2">
						<div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							Conversations
						</div>
						{conversations.length === 0 ? (
							<p className="rounded-xl border border-dashed border-border/70 p-3 text-xs text-muted-foreground">
								No conversations yet.
							</p>
						) : (
							conversations.map((conversation) => (
								<button
									key={conversation.id}
									type="button"
									onClick={() => setActiveConversationId(conversation.id)}
									className={cn(
										"rounded-xl border border-transparent px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
										activeConversationId === conversation.id &&
											"border-border bg-card shadow-sm",
									)}
								>
									<span className="block truncate font-medium">
										{conversation.title}
									</span>
									<span className="block text-xs text-muted-foreground">
										{new Date(conversation.updatedAt).toLocaleDateString()}
									</span>
								</button>
							))
						)}
					</div>
				</div>
			</aside>

			<main className="flex min-h-0 flex-col">
				<header className="flex shrink-0 items-center justify-between border-b border-border/70 px-4 py-3">
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<h1 className="truncate font-semibold">
								{selectedAgent?.name ?? "Chat"}
							</h1>
							{canChat ? (
								<Badge variant="secondary">configured</Badge>
							) : (
								<Badge variant="outline">needs setup</Badge>
							)}
						</div>
						<p className="truncate text-xs text-muted-foreground">
							{selectedAgent?.description ||
								"Ask your configured agent anything."}
						</p>
					</div>
					<Button asChild variant="outline" size="sm">
						<Link href="/agents">Agents</Link>
					</Button>
				</header>

				<section className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
					<div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
						{messages.length === 0 ? (
							<Card className="border-dashed bg-card/55">
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<MessageSquareIcon aria-hidden="true" />
										Start a new conversation
									</CardTitle>
									<CardDescription>
										Messages are streamed live and stored encrypted in the
										workspace database.
									</CardDescription>
								</CardHeader>
								<CardContent className="flex flex-wrap gap-2">
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
								</CardContent>
							</Card>
						) : (
							messages.map((message, index) => {
								const content = textFromMessage(message);
								const isAssistant = message.role === "assistant";
								return (
									<article
										key={message.id}
										className={cn(
											"flex",
											message.role === "user" ? "justify-end" : "justify-start",
										)}
									>
										<div
											className={cn(
												"max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6",
												message.role === "user"
													? "bg-primary text-primary-foreground"
													: "border border-border/70 bg-card",
											)}
										>
											{isAssistant ? (
												<div className="flex flex-col gap-2">
													{toolPartsFromMessage(message).map(
														(part, partIndex) => (
															<div
																key={`${message.id}-${part.type}-${partIndex}`}
																className="rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground"
															>
																<span className="font-medium text-foreground">
																	{part.type === "tool-call"
																		? "Tool call"
																		: "Tool result"}
																</span>{" "}
																{summarizeToolPart(part.content)}
															</div>
														),
													)}
													<Streamdown
														plugins={{ code }}
														caret="block"
														isAnimating={
															sending &&
															index === messages.length - 1 &&
															message.status === "streaming"
														}
														className="text-sm"
													>
														{content || "Thinking..."}
													</Streamdown>
												</div>
											) : (
												content
											)}
										</div>
									</article>
								);
							})
						)}
						<div ref={bottomRef} />
					</div>
				</section>

				<form
					onSubmit={handleSubmit}
					className="shrink-0 border-t border-border/70 p-3 sm:p-4"
				>
					<div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-3xl border border-border/70 bg-card/90 p-2 shadow-lg shadow-foreground/5">
						<textarea
							aria-label="Message"
							value={input}
							onChange={(event) => setInput(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter" && !event.shiftKey) {
									event.preventDefault();
									event.currentTarget.form?.requestSubmit();
								}
							}}
							placeholder={
								canChat
									? "Message your agent"
									: "Configure this agent before chatting"
							}
							disabled={sending || !canChat}
							className="max-h-40 min-h-12 flex-1 resize-none bg-transparent px-3 py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70"
						/>
						<Button
							type="submit"
							size="icon"
							disabled={sending || !input.trim() || !canChat}
							aria-label="Send message"
						>
							{sending ? (
								<Loader2 className="animate-spin" aria-hidden="true" />
							) : (
								<SendIcon aria-hidden="true" />
							)}
						</Button>
					</div>
				</form>
			</main>
		</div>
	);
}
