"use client";

import {
  appendMessagePart,
  isChatStreamEvent,
  type ChatCitation,
  type ChatMessage,
  type ChatStreamEvent,
  type PendingToolApproval,
} from "@/components/chat/chat-types";

export type StoredChatStreamDraft = {
  conversationId: string;
  assistantMessage: ChatMessage;
  pendingApprovals?: PendingToolApproval[];
  pendingApproval?: PendingToolApproval | null;
  updatedAt: number;
};

const STREAM_DRAFT_PREFIX = "ai-hub-chat-stream-draft:";
export const STREAM_DRAFT_EVENT = "ai-hub-chat-stream-draft-updated";
const STREAM_DRAFT_TTL_MS = 30 * 60 * 1000;
export const STREAM_RENDER_BATCH_MS = 48;
export const STREAM_DRAFT_WRITE_BATCH_MS = 750;
export const TOOL_CALL_PART_TYPE = "tool-call";

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

export function storeChatStreamDraft(
  draft: StoredChatStreamDraft,
  options: { notify?: boolean } = {},
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    draftKey(draft.conversationId),
    JSON.stringify(draft),
  );
  if (options.notify === false) return;
  window.dispatchEvent(
    new CustomEvent(STREAM_DRAFT_EVENT, {
      detail: { conversationId: draft.conversationId, draft },
    }),
  );
}

export function mergeStoredDraft(
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

export function approvalsFromDraft(draft: StoredChatStreamDraft | null) {
  if (!draft) return [];
  if (draft.pendingApprovals) return draft.pendingApprovals;
  return draft.pendingApproval ? [draft.pendingApproval] : [];
}

export function upsertPendingApproval(
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

export function removePendingApproval(
  approvals: PendingToolApproval[],
  invocationId: string,
) {
  return approvals.filter((approval) => approval.invocationId !== invocationId);
}

export function filterResolvedApprovals(
  approvals: PendingToolApproval[],
  resolvedApprovalIds: Set<string>,
) {
  return approvals.filter(
    (approval) => !resolvedApprovalIds.has(approval.invocationId),
  );
}

export function parseStreamEventText(
  eventText: string,
): ChatStreamEvent | null {
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

export function applyStreamEvent(
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
      parts: [...message.parts, { type: TOOL_CALL_PART_TYPE, content }],
    }));
    return;
  }

  if (parsed.type === "tool_input_delta") {
    handlers.updateAssistant((message) => {
      const nextParts = [...message.parts];
      for (let i = nextParts.length - 1; i >= 0; i--) {
        if (nextParts[i].type !== TOOL_CALL_PART_TYPE) continue;
        try {
          const parsedPart = JSON.parse(nextParts[i].content) as Record<
            string,
            unknown
          >;
          if (parsedPart.toolCallId === parsed.toolCallId) {
            nextParts[i] = {
              type: TOOL_CALL_PART_TYPE,
              content: JSON.stringify({
                ...parsedPart,
                inputText: `${typeof parsedPart.inputText === "string" ? parsedPart.inputText : ""}${parsed.delta}`,
                streamingInput: true,
              }),
            };
            return { ...message, parts: nextParts };
          }
        } catch {
          // skip unparsable parts
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
        if (nextParts[i].type !== TOOL_CALL_PART_TYPE) continue;
        try {
          const parsedPart = JSON.parse(nextParts[i].content) as Record<
            string,
            unknown
          >;
          if (parsedPart.toolCallId === parsed.toolCallId) {
            nextParts[i] = {
              type: TOOL_CALL_PART_TYPE,
              content: JSON.stringify({
                ...parsedPart,
                streamingInput: false,
              }),
            };
            return { ...message, parts: nextParts };
          }
        } catch {
          // skip unparsable parts
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
        if (nextParts[i].type !== TOOL_CALL_PART_TYPE) continue;
        try {
          const parsedPart = JSON.parse(nextParts[i].content) as Record<
            string,
            unknown
          >;
          if (parsedPart.toolCallId === parsed.toolCallId) {
            nextParts[i] = { type: TOOL_CALL_PART_TYPE, content };
            return { ...message, parts: nextParts };
          }
        } catch {
          // skip unparsable parts
        }
      }
      return {
        ...message,
        parts: [...nextParts, { type: TOOL_CALL_PART_TYPE, content }],
      };
    });
    return;
  }

  if (parsed.type === "file") {
    handlers.updateAssistant((message) => ({
      ...message,
      parts: [
        ...message.parts,
        { type: "file", content: JSON.stringify(parsed.artifact) },
      ],
    }));
    return;
  }

  if (parsed.type === "tool_result") {
    // Merge result into the matching tool-call part by toolCallId, but keep
    // unmatched results visible for resumed or legacy streams.
    handlers.updateAssistant((message) => {
      const nextParts = [...message.parts];
      let matched = false;
      for (let i = 0; i < nextParts.length; i++) {
        if (nextParts[i].type !== TOOL_CALL_PART_TYPE) continue;
        try {
          const parsedPart = JSON.parse(nextParts[i].content) as Record<
            string,
            unknown
          >;
          if (parsedPart.toolCallId === parsed.toolCallId) {
            nextParts[i] = {
              type: TOOL_CALL_PART_TYPE,
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
          // skip unparsable parts
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
