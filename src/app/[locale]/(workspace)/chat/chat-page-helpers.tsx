import { useEffect, useState } from "react";
import { ChevronDownIcon } from "lucide-react";

import type { QueuedChatMessage } from "@/components/chat/chat-composer";
import { QuotaBanner } from "@/components/chat/quota-banner";
import type {
	ChatConversation,
	ChatConversationFolder,
	ChatMessage,
	CodeWorkspaceArtifact,
} from "@/components/chat/chat-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export function createQueuedMessage(content: string): QueuedChatMessage {
	return {
		id:
			typeof crypto !== "undefined" && "randomUUID" in crypto
				? crypto.randomUUID()
				: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		content,
	};
}

export const CHAT_INTERFACE_MODE = "chat";
export const CODING_INTERFACE_MODE = "coding";
export type InterfaceMode =
	| typeof CHAT_INTERFACE_MODE
	| typeof CODING_INTERFACE_MODE;

export const CONVERSATION_PAGE_SIZE = 50;

export function uploadPathForFile(file: File) {
	const relativePath = (file as File & { webkitRelativePath?: string })
		.webkitRelativePath;
	return relativePath?.trim() || file.name;
}

export type ConversationListPage = {
	conversations: ChatConversation[];
	folders: ChatConversationFolder[];
	hasMore: boolean;
	nextCursor: string | null;
};

export type ConversationListPayload = ChatConversation[] | ConversationListPage;

export function normalizeConversationList(
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

export function mergeConversationPages(
	current: ChatConversation[],
	incoming: ChatConversation[],
) {
	const existingIds = new Set(current.map((conversation) => conversation.id));
	return [
		...current,
		...incoming.filter((conversation) => !existingIds.has(conversation.id)),
	];
}

export function conversationTitleFromFirstMessage(content: string) {
	const normalized = content.trim().replace(/\s+/g, " ");
	return normalized.length > 100 ? `${normalized.slice(0, 97)}…` : normalized;
}

export function rotatePromptSuggestions(suggestions: string[], seed: string) {
	if (suggestions.length <= 3) return suggestions;
	const offset =
		Array.from(seed).reduce((total, char) => total + char.charCodeAt(0), 0) %
		suggestions.length;
	return [...suggestions.slice(offset), ...suggestions.slice(0, offset)].slice(
		0,
		3,
	);
}

export function upsertConversation(
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

export function latestCodeWorkspaceArtifact(messages: ChatMessage[]) {
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

export function ChatContextBar({
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
