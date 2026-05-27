"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import {
	appendMessagePart,
	createLocalMessage,
	isChatStreamEvent,
	type ChatCitation,
	type ChatMessage,
	type PendingToolApproval,
} from "@/components/chat/chat-types";

interface UseChatStreamOptions {
	agentId: string | null;
	conversationId: string | null;
	canChat: boolean;
	onConversationCreated: (conversationId: string) => void;
	onConversationsRefresh: () => Promise<void>;
}

export function useChatStream({
	agentId,
	conversationId,
	canChat,
	onConversationCreated,
	onConversationsRefresh,
}: UseChatStreamOptions) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [sending, setSending] = useState(false);
	const [pendingApproval, setPendingApproval] =
		useState<PendingToolApproval | null>(null);
	const [citations, setCitations] = useState<ChatCitation[]>([]);

	const setMessagesDirect = useCallback((next: ChatMessage[]) => {
		setMessages(next);
		setCitations([]);
		setPendingApproval(null);
	}, []);

	async function handleSubmit(content: string) {
		if (!content || !agentId || !canChat || sending) return;

		const userMessage = createLocalMessage("user", content);
		const assistantMessage = createLocalMessage("assistant", "");
		setMessages((current) => [...current, userMessage, assistantMessage]);
		setSending(true);
		setPendingApproval(null);
		setCitations([]);

		let newConversationId: string | null = null;

		try {
			const res = await fetch(`/api/workspace/${agentId}/chat`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					content,
					conversationId: conversationId ?? undefined,
				}),
			});

			if (!res.ok || !res.body) {
				const error = await res.json().catch(() => null);
				throw new Error(error?.error || "Chat request failed");
			}

			const headerConversationId = res.headers.get("X-Conversation-Id");
			if (headerConversationId && !conversationId) {
				newConversationId = headerConversationId;
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			function handleStreamEvent(eventText: string) {
				if (!eventText.trim()) return;

				const data = eventText
					.split("\n")
					.map((line) => line.trimEnd())
					.filter((line) => line.startsWith("data:"))
					.map((line) => line.slice("data:".length).trimStart())
					.join("\n");
				const payload = data || eventText.trim();
				const parsed = JSON.parse(payload) as unknown;
				if (!isChatStreamEvent(parsed)) return;

				if (parsed.type === "error") {
					throw new Error(parsed.error);
				}

				if (parsed.type === "tool_approval_required") {
					setPendingApproval({
						invocationId: parsed.invocationId,
						toolName: parsed.toolName,
						input: parsed.input,
					});
					return;
				}

				if (parsed.type === "tool_call" || parsed.type === "tool_result") {
					const partType =
						parsed.type === "tool_call" ? "tool-call" : "tool-result";
					const content = JSON.stringify(
						parsed.type === "tool_call"
							? {
									toolCallId: parsed.toolCallId,
									toolName: parsed.toolName,
									input: parsed.input,
								}
							: {
									toolCallId: parsed.toolCallId,
									toolName: parsed.toolName,
									output: parsed.output,
								},
					);
					setMessages((current) =>
						current.map((message) =>
							message.id === assistantMessage.id
								? {
										...message,
										parts: [
											...message.parts,
											{ type: partType, content },
										],
									}
								: message,
						),
					);
					if (parsed.type === "tool_result") {
						setPendingApproval(null);
					}
					return;
				}

				if (parsed.type === "citations") {
					const citationList =
						"citations" in parsed
							? parsed.citations
							: "sources" in parsed
								? (parsed as { sources: ChatCitation[] }).sources
								: [];
					setCitations(citationList);
					setMessages((current) =>
						current.map((message) =>
							message.id === assistantMessage.id
								? {
										...message,
										parts: [
											...message.parts.filter(
												(part) => part.type !== "citations",
											),
											{
												type: "citations",
												content: JSON.stringify(citationList),
											},
										],
									}
								: message,
						),
					);
					return;
				}

				setMessages((current) =>
					current.map((message) =>
						message.id === assistantMessage.id
							? {
									...message,
									parts: appendMessagePart(
										message.parts,
										parsed.type,
										parsed.delta,
									),
								}
							: message,
					),
				);
			}

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const events = buffer.split("\n\n");
				buffer = events.pop() ?? "";
				for (const streamEvent of events) {
					handleStreamEvent(streamEvent);
				}
			}

			buffer += decoder.decode();
			if (buffer.trim()) handleStreamEvent(buffer);

			setMessages((current) =>
				current.map((message) =>
					message.id === assistantMessage.id
						? { ...message, status: "completed" }
						: message,
				),
			);
			setPendingApproval(null);

			await onConversationsRefresh();
			if (newConversationId) {
				onConversationCreated(newConversationId);
			}
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
			setPendingApproval(null);
		} finally {
			setSending(false);
		}
	}

	async function resolveApproval(action: "approve" | "reject") {
		if (!pendingApproval) return;
		const endpoint =
			action === "approve"
				? `/api/workspace/tool-invocations/${pendingApproval.invocationId}/approve`
				: `/api/workspace/tool-invocations/${pendingApproval.invocationId}/reject`;

		const res = await fetch(endpoint, { method: "POST" });
		if (!res.ok) {
			toast.error(`Failed to ${action} tool invocation`);
			return;
		}
		toast.success(
			action === "approve" ? "Tool approved" : "Tool invocation rejected",
		);
	}

	return {
		messages,
		setMessages: setMessagesDirect,
		sending,
		pendingApproval,
		citations,
		handleSubmit,
		resolveApproval,
		clearPendingApproval: () => setPendingApproval(null),
	};
}
