"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
	appendMessagePart,
	createLocalMessage,
	isChatStreamEvent,
	toolNameMatches,
	type ChatCitation,
	type ChatMessage,
	type ChatStreamEvent,
	type PendingToolApproval,
} from "@/components/chat/chat-types";

interface UseChatStreamOptions {
	agentId: string | null;
	conversationId: string | null;
	workspaceId: string | null;
	canChat: boolean;
	onConversationCreated: (conversationId: string) => void;
	onConversationTitle?: (conversationId: string, title: string) => void;
	onConversationsRefresh: () => Promise<void>;
}

type SubmitOptions = {
	resendFromMessageId?: string;
	reuseUserMessage?: boolean;
};

type StoredChatStreamDraft = {
	conversationId: string;
	assistantMessage: ChatMessage;
	pendingApprovals?: PendingToolApproval[];
	pendingApproval?: PendingToolApproval | null;
	updatedAt: number;
};

const STREAM_DRAFT_PREFIX = "ai-hub-chat-stream-draft:";
const STREAM_DRAFT_EVENT = "ai-hub-chat-stream-draft-updated";
const STREAM_DRAFT_TTL_MS = 30 * 60 * 1000;

function draftKey(conversationId: string) {
	return `${STREAM_DRAFT_PREFIX}${conversationId}`;
}

export function getStoredChatStreamDraft(
	conversationId: string,
): StoredChatStreamDraft | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(draftKey(conversationId));
		if (!raw) return null;
		const draft = JSON.parse(raw) as StoredChatStreamDraft;
		if (
			!draft?.assistantMessage ||
			Date.now() - draft.updatedAt > STREAM_DRAFT_TTL_MS
		) {
			window.localStorage.removeItem(draftKey(conversationId));
			return null;
		}
		return draft;
	} catch {
		return null;
	}
}

export function clearStoredChatStreamDraft(conversationId: string) {
	if (typeof window === "undefined") return;
	window.localStorage.removeItem(draftKey(conversationId));
	window.dispatchEvent(
		new CustomEvent(STREAM_DRAFT_EVENT, {
			detail: { conversationId, draft: null },
		}),
	);
}

function storeChatStreamDraft(draft: StoredChatStreamDraft) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(
		draftKey(draft.conversationId),
		JSON.stringify(draft),
	);
	window.dispatchEvent(
		new CustomEvent(STREAM_DRAFT_EVENT, {
			detail: { conversationId: draft.conversationId, draft },
		}),
	);
}

function mergeStoredDraft(
	messages: ChatMessage[],
	draft: StoredChatStreamDraft | null,
) {
	if (!draft) return messages;
	const existingIndex = messages.findIndex(
		(message) => message.id === draft.assistantMessage.id,
	);
	if (existingIndex === -1) {
		return [...messages, draft.assistantMessage];
	}

	const existing = messages[existingIndex];
	if (existing.status === "completed" || existing.status === "failed") {
		clearStoredChatStreamDraft(draft.conversationId);
		return messages;
	}

	const next = [...messages];
	next[existingIndex] = {
		...existing,
		...draft.assistantMessage,
		parts:
			draft.assistantMessage.parts.length > 0
				? draft.assistantMessage.parts
				: existing.parts,
	};
	return next;
}

function approvalsFromDraft(draft: StoredChatStreamDraft | null) {
	if (!draft) return [];
	if (draft.pendingApprovals) return draft.pendingApprovals;
	return draft.pendingApproval ? [draft.pendingApproval] : [];
}

function upsertPendingApproval(
	approvals: PendingToolApproval[],
	approval: PendingToolApproval,
) {
	const existingIndex = approvals.findIndex(
		(item) => item.invocationId === approval.invocationId,
	);
	if (existingIndex === -1) return [...approvals, approval];
	const next = [...approvals];
	next[existingIndex] = approval;
	return next;
}

function removePendingApproval(
	approvals: PendingToolApproval[],
	invocationId: string,
) {
	return approvals.filter((approval) => approval.invocationId !== invocationId);
}

function filterResolvedApprovals(
	approvals: PendingToolApproval[],
	resolvedApprovalIds: Set<string>,
) {
	return approvals.filter(
		(approval) => !resolvedApprovalIds.has(approval.invocationId),
	);
}

function parseStreamEventText(eventText: string): ChatStreamEvent | null {
	if (!eventText.trim()) return null;

	const data = eventText
		.split("\n")
		.map((line) => line.trimEnd())
		.filter((line) => line.startsWith("data:"))
		.map((line) => line.slice("data:".length).trimStart())
		.join("\n");
	const payload = data || eventText.trim();
	const parsed = JSON.parse(payload) as unknown;
	return isChatStreamEvent(parsed) ? parsed : null;
}

function applyStreamEvent(
	parsed: ChatStreamEvent,
	handlers: {
		updateAssistant: (updater: (message: ChatMessage) => ChatMessage) => void;
		addPendingApproval: (approval: PendingToolApproval) => void;
		clearPendingApprovals: () => void;
		setCitations: (citations: ChatCitation[]) => void;
		onConversationTitle?: (title: string) => void;
		onDone?: () => void;
	},
) {
	if (parsed.type === "error") {
		throw new Error(parsed.error);
	}

	if (parsed.type === "done") {
		handlers.updateAssistant((message) => ({
			...message,
			status: "completed",
		}));
		handlers.clearPendingApprovals();
		handlers.onDone?.();
		return;
	}

	if (parsed.type === "conversation_title") {
		handlers.onConversationTitle?.(parsed.title);
		return;
	}

	if (parsed.type === "tool_approval_required") {
		handlers.addPendingApproval({
			invocationId: parsed.invocationId,
			toolName: parsed.toolName,
			input: parsed.input,
		});
		return;
	}

	if (parsed.type === "tool_input_start") {
		const content = JSON.stringify({
			toolCallId: parsed.toolCallId,
			toolName: parsed.toolName,
			inputText: "",
			streamingInput: true,
		});
		handlers.updateAssistant((message) => ({
			...message,
			parts: [...message.parts, { type: "tool-call", content }],
		}));
		return;
	}

	if (parsed.type === "tool_input_delta") {
		handlers.updateAssistant((message) => {
			const nextParts = [...message.parts];
			for (let i = nextParts.length - 1; i >= 0; i--) {
				if (nextParts[i].type !== "tool-call") continue;
				try {
					const parsedPart = JSON.parse(nextParts[i].content) as Record<
						string,
						unknown
					>;
					if (parsedPart.toolCallId === parsed.toolCallId) {
						nextParts[i] = {
							type: "tool-call",
							content: JSON.stringify({
								...parsedPart,
								inputText: `${typeof parsedPart.inputText === "string" ? parsedPart.inputText : ""}${parsed.delta}`,
								streamingInput: true,
							}),
						};
						return { ...message, parts: nextParts };
					}
				} catch {
					// skip unparseable parts
				}
			}
			return message;
		});
		return;
	}

	if (parsed.type === "tool_input_end") {
		handlers.updateAssistant((message) => {
			const nextParts = [...message.parts];
			for (let i = nextParts.length - 1; i >= 0; i--) {
				if (nextParts[i].type !== "tool-call") continue;
				try {
					const parsedPart = JSON.parse(nextParts[i].content) as Record<
						string,
						unknown
					>;
					if (parsedPart.toolCallId === parsed.toolCallId) {
						nextParts[i] = {
							type: "tool-call",
							content: JSON.stringify({
								...parsedPart,
								streamingInput: false,
							}),
						};
						return { ...message, parts: nextParts };
					}
				} catch {
					// skip unparseable parts
				}
			}
			return message;
		});
		return;
	}

	if (parsed.type === "tool_call") {
		const content = JSON.stringify({
			toolCallId: parsed.toolCallId,
			toolName: parsed.toolName,
			input: parsed.input,
		});
		handlers.updateAssistant((message) => {
			const nextParts = [...message.parts];
			for (let i = nextParts.length - 1; i >= 0; i--) {
				if (nextParts[i].type !== "tool-call") continue;
				try {
					const parsedPart = JSON.parse(nextParts[i].content) as Record<
						string,
						unknown
					>;
					if (parsedPart.toolCallId === parsed.toolCallId) {
						nextParts[i] = { type: "tool-call", content };
						return { ...message, parts: nextParts };
					}
				} catch {
					// skip unparseable parts
				}
			}
			return {
				...message,
				parts: [...nextParts, { type: "tool-call", content }],
			};
		});
		return;
	}

	if (parsed.type === "tool_result") {
		// Merge result into the matching tool-call part by toolCallId, but keep
		// unmatched results visible for resumed or legacy streams.
		handlers.updateAssistant((message) => {
			const nextParts = [...message.parts];
			let matched = false;
			for (let i = 0; i < nextParts.length; i++) {
				if (nextParts[i].type !== "tool-call") continue;
				try {
					const parsedPart = JSON.parse(nextParts[i].content) as Record<
						string,
						unknown
					>;
					if (parsedPart.toolCallId === parsed.toolCallId) {
						nextParts[i] = {
							type: "tool-call",
							content: JSON.stringify({
								...parsedPart,
								toolName: parsedPart.toolName ?? parsed.toolName,
								output: parsed.output,
							}),
						};
						matched = true;
						break;
					}
				} catch {
					// skip unparseable parts
				}
			}
			if (!matched) {
				nextParts.push({
					type: "tool-result",
					content: JSON.stringify({
						toolCallId: parsed.toolCallId,
						toolName: parsed.toolName,
						output: parsed.output,
					}),
				});
			}
			return { ...message, parts: nextParts };
		});
		return;
	}

	if (parsed.type === "suggestions") {
		handlers.updateAssistant((message) => ({
			...message,
			parts: [
				...message.parts.filter((part) => part.type !== "suggestions"),
				{
					type: "suggestions",
					content: JSON.stringify(parsed.suggestions),
				},
			],
		}));
		return;
	}

	if (parsed.type === "citations") {
		const citationList =
			"citations" in parsed
				? parsed.citations
				: "sources" in parsed
					? (parsed as { sources: ChatCitation[] }).sources
					: [];
		handlers.setCitations(citationList);
		handlers.updateAssistant((message) => ({
			...message,
			parts: [
				...message.parts.filter((part) => part.type !== "citations"),
				{
					type: "citations",
					content: JSON.stringify(citationList),
				},
			],
		}));
		return;
	}

	handlers.updateAssistant((message) => ({
		...message,
		parts: appendMessagePart(message.parts, parsed.type, parsed.delta),
	}));
}

export function useChatStream({
	agentId,
	conversationId,
	workspaceId,
	canChat,
	onConversationCreated,
	onConversationTitle,
	onConversationsRefresh,
}: UseChatStreamOptions) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [sending, setSending] = useState(false);
	const [resuming, setResuming] = useState(false);
	const [pendingApprovals, setPendingApprovals] = useState<
		PendingToolApproval[]
	>([]);
	const [citations, setCitations] = useState<ChatCitation[]>([]);
	const activeRequestControllerRef = useRef<AbortController | null>(null);
	const activeConversationIdRef = useRef<string | null>(null);
	const stopRequestedRef = useRef(false);
	const resolvedApprovalIdsRef = useRef(new Set<string>());
	const streamingMessageId = useMemo(() => {
		return (
			[...messages]
				.reverse()
				.find(
					(message) =>
						message.role === "assistant" && message.status === "streaming",
				)?.id ?? null
		);
	}, [messages]);

	const setMessagesDirect = useCallback(
		(next: ChatMessage[]) => {
			if (next.length === 0 || !conversationId) {
				resolvedApprovalIdsRef.current.clear();
				setMessages(next);
				setCitations([]);
				setPendingApprovals([]);
				return;
			}

			const draft = getStoredChatStreamDraft(conversationId);
			setMessages(mergeStoredDraft(next, draft));
			setCitations([]);
			setPendingApprovals(
				filterResolvedApprovals(
					approvalsFromDraft(draft),
					resolvedApprovalIdsRef.current,
				),
			);
		},
		[conversationId],
	);

	useEffect(() => {
		if (!conversationId) return;

		function handleDraftEvent(event: Event) {
			const detail = (
				event as CustomEvent<{
					conversationId?: string;
					draft?: StoredChatStreamDraft | null;
				}>
			).detail;
			if (detail?.conversationId !== conversationId) return;
			if (!detail.draft) {
				setPendingApprovals([]);
				return;
			}

			setMessages((current) => mergeStoredDraft(current, detail.draft ?? null));
			setPendingApprovals(
				filterResolvedApprovals(
					approvalsFromDraft(detail.draft),
					resolvedApprovalIdsRef.current,
				),
			);
		}

		window.addEventListener(STREAM_DRAFT_EVENT, handleDraftEvent);
		return () => {
			window.removeEventListener(STREAM_DRAFT_EVENT, handleDraftEvent);
		};
	}, [conversationId]);

	useEffect(() => {
		if (!workspaceId || !conversationId) return;
		const draft = getStoredChatStreamDraft(conversationId);
		const draftApprovals = filterResolvedApprovals(
			approvalsFromDraft(draft),
			resolvedApprovalIdsRef.current,
		);
		if (draftApprovals.length > 0) {
			queueMicrotask(() => setPendingApprovals(draftApprovals));
			return;
		}

		let cancelled = false;
		async function loadPendingApproval() {
			const params = new URLSearchParams({
				workspaceId: workspaceId ?? "",
				status: "awaiting_approval",
				limit: "10",
				conversationId: conversationId ?? "",
			});
			const res = await fetch(
				`/api/workspace/tool-invocations?${params.toString()}`,
			);
			if (!res.ok) return;
			const invocations = (await res.json()) as Array<{
				id: string;
				toolName: string;
				input: unknown;
			}>;
			if (cancelled) return;
			setPendingApprovals(
				filterResolvedApprovals(
					invocations.map((invocation) => ({
						invocationId: invocation.id,
						toolName: invocation.toolName,
						input: invocation.input,
					})),
					resolvedApprovalIdsRef.current,
				),
			);
		}

		void loadPendingApproval();
		return () => {
			cancelled = true;
		};
	}, [workspaceId, conversationId]);

	const reloadConversationMessages = useCallback(async () => {
		if (!conversationId) return;
		const res = await fetch(`/api/workspace/conversations/${conversationId}`);
		if (!res.ok) return;
		const data = (await res.json()) as { messages?: ChatMessage[] };
		setMessages(data.messages ?? []);
	}, [conversationId]);

	useEffect(() => {
		if (!conversationId || !streamingMessageId || sending) return;

		const activeConversationId = conversationId;
		const activeStreamingMessageId = streamingMessageId;
		const controller = new AbortController();
		activeRequestControllerRef.current = controller;
		activeConversationIdRef.current = activeConversationId;
		let completed = false;
		queueMicrotask(() => setResuming(true));

		function updateAssistant(updater: (message: ChatMessage) => ChatMessage) {
			setMessages((current) =>
				current.map((message) =>
					message.id === activeStreamingMessageId ? updater(message) : message,
				),
			);
			const draft = getStoredChatStreamDraft(activeConversationId);
			if (draft?.assistantMessage.id === activeStreamingMessageId) {
				storeChatStreamDraft({
					...draft,
					assistantMessage: updater(draft.assistantMessage),
					updatedAt: Date.now(),
				});
			}
		}

		function updatePendingApprovals(
			updater: (approvals: PendingToolApproval[]) => PendingToolApproval[],
		) {
			setPendingApprovals((current) =>
				filterResolvedApprovals(
					updater(current),
					resolvedApprovalIdsRef.current,
				),
			);
			const draft = getStoredChatStreamDraft(activeConversationId);
			if (draft?.assistantMessage.id === activeStreamingMessageId) {
				const nextApprovals = filterResolvedApprovals(
					updater(approvalsFromDraft(draft)),
					resolvedApprovalIdsRef.current,
				);
				storeChatStreamDraft({
					...draft,
					pendingApprovals: nextApprovals,
					pendingApproval: nextApprovals[0] ?? null,
					updatedAt: Date.now(),
				});
			}
		}

		function addPendingApproval(approval: PendingToolApproval) {
			if (resolvedApprovalIdsRef.current.has(approval.invocationId)) return;
			updatePendingApprovals((approvals) =>
				upsertPendingApproval(approvals, approval),
			);
		}

		function clearPendingApprovals() {
			updatePendingApprovals(() => []);
		}

		async function resumeStream() {
			try {
				const res = await fetch(
					`/api/workspace/conversations/${activeConversationId}/stream`,
					{ signal: controller.signal },
				);
				if (res.status === 404 || res.status === 409) {
					clearStoredChatStreamDraft(activeConversationId);
					await reloadConversationMessages();
					await onConversationsRefresh();
					return;
				}
				if (!res.ok || !res.body) {
					const error = await res.json().catch(() => null);
					throw new Error(error?.error || "Failed to resume chat stream");
				}

				updateAssistant((message) => ({ ...message, parts: [] }));
				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";

				function handleStreamEvent(eventText: string) {
					const parsed = parseStreamEventText(eventText);
					if (!parsed) return;
					applyStreamEvent(parsed, {
						updateAssistant,
						addPendingApproval,
						clearPendingApprovals,
						setCitations,
						onDone: () => {
							completed = true;
							clearStoredChatStreamDraft(activeConversationId);
						},
					});
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

				if (!controller.signal.aborted) {
					if (completed) {
						await onConversationsRefresh();
					} else {
						await reloadConversationMessages();
					}
				}
			} catch (err) {
				if (err instanceof Error && err.name === "AbortError") return;
				toast.error(err instanceof Error ? err.message : "Chat stream failed");
				updateAssistant((message) => ({
					...message,
					status: "failed",
					parts:
						message.parts.length > 0
							? message.parts
							: [{ type: "text", content: "The assistant failed to respond." }],
				}));
				clearPendingApprovals();
				clearStoredChatStreamDraft(activeConversationId);
			} finally {
				if (activeRequestControllerRef.current === controller) {
					activeRequestControllerRef.current = null;
					activeConversationIdRef.current = null;
				}
				if (!controller.signal.aborted) setResuming(false);
			}
		}

		void resumeStream();
		return () => {
			controller.abort();
			if (activeRequestControllerRef.current === controller) {
				activeRequestControllerRef.current = null;
				activeConversationIdRef.current = null;
			}
			queueMicrotask(() => setResuming(false));
		};
	}, [
		conversationId,
		streamingMessageId,
		sending,
		reloadConversationMessages,
		onConversationsRefresh,
	]);

	async function handleSubmit(content: string, options: SubmitOptions = {}) {
		if (!content || !agentId || !canChat || sending) return;

		const userMessage = createLocalMessage("user", content);
		const assistantMessage = createLocalMessage("assistant", "");
		let activeConversationId = conversationId;
		let assistantMessageId = assistantMessage.id;
		let assistantDraft = assistantMessage;
		let pendingApprovalsDraft: PendingToolApproval[] = [];

		function persistDraft() {
			if (!activeConversationId) return;
			const visibleApprovals = filterResolvedApprovals(
				pendingApprovalsDraft,
				resolvedApprovalIdsRef.current,
			);
			storeChatStreamDraft({
				conversationId: activeConversationId,
				assistantMessage: assistantDraft,
				pendingApprovals: visibleApprovals,
				pendingApproval: visibleApprovals[0] ?? null,
				updatedAt: Date.now(),
			});
		}

		function updatePendingApprovals(
			updater: (approvals: PendingToolApproval[]) => PendingToolApproval[],
		) {
			pendingApprovalsDraft = filterResolvedApprovals(
				updater(pendingApprovalsDraft),
				resolvedApprovalIdsRef.current,
			);
			setPendingApprovals(pendingApprovalsDraft);
			persistDraft();
		}

		function addPendingApproval(approval: PendingToolApproval) {
			if (resolvedApprovalIdsRef.current.has(approval.invocationId)) return;
			updatePendingApprovals((approvals) =>
				upsertPendingApproval(approvals, approval),
			);
		}

		function clearPendingApprovals() {
			updatePendingApprovals(() => []);
		}

		function updateAssistantDraft(
			updater: (message: ChatMessage) => ChatMessage,
		) {
			assistantDraft = updater(assistantDraft);
			setMessages((current) =>
				current.map((message) =>
					message.id === assistantMessage.id ||
					message.id === assistantMessageId
						? assistantDraft
						: message,
				),
			);
			persistDraft();
		}

		stopRequestedRef.current = false;
		setMessages((current) => {
			if (options.reuseUserMessage && options.resendFromMessageId) {
				const messageIndex = current.findIndex(
					(message) => message.id === options.resendFromMessageId,
				);
				if (messageIndex >= 0) {
					return [...current.slice(0, messageIndex + 1), assistantMessage];
				}
			}
			return [...current, userMessage, assistantMessage];
		});
		setSending(true);
		clearPendingApprovals();
		setCitations([]);
		persistDraft();

		const controller = new AbortController();
		activeRequestControllerRef.current = controller;
		activeConversationIdRef.current = activeConversationId;

		try {
			const res = await fetch(`/api/workspace/${agentId}/chat`, {
				method: "POST",
				signal: controller.signal,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					content,
					conversationId: conversationId ?? undefined,
					resendFromMessageId: options.resendFromMessageId,
				}),
			});

			if (!res.ok || !res.body) {
				const error = await res.json().catch(() => null);
				throw new Error(error?.error || "Chat request failed");
			}

			const headerConversationId = res.headers.get("X-Conversation-Id");
			const headerAssistantMessageId = res.headers.get("X-Message-Id");
			const headerUserMessageId = res.headers.get("X-User-Message-Id");
			if (headerConversationId) {
				activeConversationId = headerConversationId;
				activeConversationIdRef.current = headerConversationId;
			}
			if (headerAssistantMessageId) {
				assistantMessageId = headerAssistantMessageId;
				assistantDraft = { ...assistantDraft, id: headerAssistantMessageId };
				setMessages((current) =>
					current.map((message) =>
						message.id === assistantMessage.id ? assistantDraft : message,
					),
				);
				persistDraft();
			}
			if (headerUserMessageId) {
				setMessages((current) =>
					current.map((message) =>
						message.id === userMessage.id
							? { ...message, id: headerUserMessageId! }
							: message,
					),
				);
			}
			if (headerConversationId && !conversationId) {
				onConversationCreated(headerConversationId);
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			function handleStreamEvent(eventText: string) {
				const parsed = parseStreamEventText(eventText);
				if (!parsed) return;
				applyStreamEvent(parsed, {
					updateAssistant: updateAssistantDraft,
					addPendingApproval,
					clearPendingApprovals,
					setCitations,
					onConversationTitle: (title) => {
						const targetConversationId = activeConversationIdRef.current;
						if (targetConversationId) {
							onConversationTitle?.(targetConversationId, title);
						}
					},
				});
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

			updateAssistantDraft((message) => ({ ...message, status: "completed" }));
			clearPendingApprovals();
			if (activeConversationId)
				clearStoredChatStreamDraft(activeConversationId);

			await onConversationsRefresh();
		} catch (err) {
			if (err instanceof Error && err.name === "AbortError") {
				updateAssistantDraft((message) => ({
					...message,
					status: "completed",
				}));
				clearPendingApprovals();
				if (activeConversationId)
					clearStoredChatStreamDraft(activeConversationId);
				return;
			}
			toast.error(err instanceof Error ? err.message : "Chat request failed");
			updateAssistantDraft((message) => ({
				...message,
				status: "failed",
				parts: [{ type: "text", content: "The assistant failed to respond." }],
			}));
			clearPendingApprovals();
			if (activeConversationId)
				clearStoredChatStreamDraft(activeConversationId);
		} finally {
			if (activeRequestControllerRef.current === controller) {
				activeRequestControllerRef.current = null;
				activeConversationIdRef.current = null;
			}
			stopRequestedRef.current = false;
			setSending(false);
		}
	}

	const stopGeneration = useCallback(async () => {
		if (stopRequestedRef.current) return;
		stopRequestedRef.current = true;
		activeRequestControllerRef.current?.abort();

		const targetConversationId =
			activeConversationIdRef.current ?? conversationId;
		if (targetConversationId) {
			try {
				await fetch(
					`/api/workspace/conversations/${targetConversationId}/stop`,
					{
						method: "POST",
					},
				);
			} catch {
				// Local abort still stops rendering immediately; ignore network failures.
			}
			clearStoredChatStreamDraft(targetConversationId);
		}

		setMessages((current) =>
			current.map((message) =>
				message.role === "assistant" && message.status === "streaming"
					? { ...message, status: "completed" }
					: message,
			),
		);
		setPendingApprovals([]);
		setSending(false);
		setResuming(false);
		toast.success("Generation stopped");
	}, [conversationId]);

	async function resolveApproval(
		action: "approve" | "reject",
		invocationId: string,
	) {
		const approval = pendingApprovals.find(
			(item) => item.invocationId === invocationId,
		);
		if (!approval) return;
		const endpoint =
			action === "approve"
				? `/api/workspace/tool-invocations/${approval.invocationId}/approve`
				: `/api/workspace/tool-invocations/${approval.invocationId}/reject`;

		const res = await fetch(endpoint, { method: "POST" });
		if (!res.ok) {
			const error = await res.json().catch(() => null);
			toast.error(error?.error || `Failed to ${action} tool invocation`);
			return;
		}
		resolvedApprovalIdsRef.current.add(approval.invocationId);
		setPendingApprovals((current) =>
			removePendingApproval(current, approval.invocationId),
		);

		// When rejecting, mark only the matching tool-call part as denied so it
		// displays in red while avoiding unrelated calls with the same name.
		if (action === "reject") {
			setMessages((current) =>
				current.map((message) => {
					const nextParts = message.parts.map((part) => {
						if (part.type !== "tool-call") return part;
						try {
							const parsed = JSON.parse(part.content) as Record<
								string,
								unknown
							>;
							const inputMatches =
								parsed.input === undefined ||
								JSON.stringify(parsed.input) === JSON.stringify(approval.input);
							if (
								inputMatches &&
								toolNameMatches(
									parsed.toolName as string | undefined,
									approval.toolName,
								)
							) {
								return {
									type: part.type,
									content: JSON.stringify({ ...parsed, denied: true }),
								};
							}
						} catch {
							// skip unparseable parts
						}
						return part;
					});
					return { ...message, parts: nextParts };
				}),
			);
		}

		if (conversationId) {
			const draft = getStoredChatStreamDraft(conversationId);
			if (draft) {
				const nextApprovals = removePendingApproval(
					approvalsFromDraft(draft),
					approval.invocationId,
				);
				storeChatStreamDraft({
					...draft,
					pendingApprovals: nextApprovals,
					pendingApproval: nextApprovals[0] ?? null,
					updatedAt: Date.now(),
				});
			}
		}
		toast.success(
			action === "approve" ? "Tool approved" : "Tool invocation rejected",
		);
	}

	return {
		messages,
		setMessages: setMessagesDirect,
		sending: sending || resuming,
		pendingApprovals,
		citations,
		handleSubmit,
		resolveApproval,
		stopGeneration,
		clearPendingApprovals: () => setPendingApprovals([]),
	};
}
