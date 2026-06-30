import type { UIMessage } from "ai";

import type {
  ChatCitation,
  ChatMessage,
  ChatMessagePart,
  CodeWorkspaceArtifact,
  PendingToolApproval,
} from "@/components/chat/chat-types";
import { parseToolPart } from "@/components/chat/chat-types";

type AiHubUIMessageMetadata = {
  protocol?: "ai-hub-ui";
  createdAt?: string;
  status?: string;
  conversationId?: string;
  messageId?: string;
  userMessageId?: string;
  stopped?: boolean;
};

type AiHubUIMessageData = {
  citations: ChatCitation[];
  suggestions: string[];
  "tool-approval": PendingToolApproval;
  "code-workspace-artifact": CodeWorkspaceArtifact;
  "conversation-title": { title: string };
};

export type AiHubUIMessage = UIMessage<
  AiHubUIMessageMetadata,
  AiHubUIMessageData
>;

type MutableAiHubUIParts = AiHubUIMessage["parts"];
type MutableAiHubUIPart = MutableAiHubUIParts[number];

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCodeWorkspaceArtifact(
  value: unknown,
): value is CodeWorkspaceArtifact {
  return (
    isRecord(value) &&
    value.kind === "code_workspace_artifact" &&
    typeof value.projectId === "string" &&
    typeof value.version === "number" &&
    Array.isArray(value.files)
  );
}

function isCitationArray(value: unknown): value is ChatCitation[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (!isRecord(item)) return false;
      return (
        typeof item.chunkId === "string" &&
        typeof item.documentId === "string" &&
        typeof item.documentTitle === "string" &&
        typeof item.content === "string" &&
        typeof item.score === "number"
      );
    })
  );
}

function chatToolPartToUIPart(
  part: ChatMessagePart,
): MutableAiHubUIPart | null {
  const parsed = parseToolPart(part.content);
  const toolCallId = parsed.toolCallId;
  const toolName = parsed.toolName ?? "tool";
  if (!toolCallId) return null;

  if (part.type === "tool-call") {
    if (parsed.output !== undefined) {
      if (parsed.denied) {
        return {
          type: "dynamic-tool",
          toolCallId,
          toolName,
          state: "output-denied",
          input: parsed.input ?? {},
          approval: {
            id: toolCallId,
            approved: false,
            reason: parsed.message,
          },
        };
      }
      return {
        type: "dynamic-tool",
        toolCallId,
        toolName,
        state: "output-available",
        input: parsed.input ?? {},
        output: parsed.output,
      };
    }
    return {
      type: "dynamic-tool",
      toolCallId,
      toolName,
      state: parsed.streamingInput ? "input-streaming" : "input-available",
      input: parsed.input ?? parsed.inputText ?? {},
    };
  }

  if (part.type === "tool-result") {
    if (parsed.denied) {
      return {
        type: "dynamic-tool",
        toolCallId,
        toolName,
        state: "output-denied",
        input: parsed.input ?? {},
        approval: {
          id: toolCallId,
          approved: false,
          reason: parsed.message,
        },
      };
    }
    return {
      type: "dynamic-tool",
      toolCallId,
      toolName,
      state: "output-available",
      input: parsed.input ?? {},
      output: parsed.output,
    };
  }

  return null;
}

function partToUIParts(part: ChatMessagePart): MutableAiHubUIParts {
  if (part.type === "text") return [{ type: "text", text: part.content }];
  if (part.type === "reasoning") {
    return [{ type: "reasoning", text: part.content, state: "done" }];
  }
  if (part.type === "tool-call" || part.type === "tool-result") {
    const uiPart = chatToolPartToUIPart(part);
    return uiPart ? [uiPart] : [];
  }
  if (part.type === "suggestions") {
    const suggestions = parseJson(part.content);
    return Array.isArray(suggestions) &&
      suggestions.every((item) => typeof item === "string")
      ? [
          {
            type: "data-suggestions",
            id: "suggestions",
            data: suggestions,
          },
        ]
      : [];
  }
  if (part.type === "citations") {
    const citations = parseJson(part.content);
    if (!isCitationArray(citations)) return [];
    return [
      { type: "data-citations", id: "citations", data: citations },
      ...citations.map(
        (citation): MutableAiHubUIPart => ({
          type: "source-document",
          sourceId: citation.chunkId,
          mediaType: "text/plain",
          title: citation.documentTitle,
        }),
      ),
    ];
  }
  if (part.type === "file") {
    const parsed = parseJson(part.content);
    if (isCodeWorkspaceArtifact(parsed)) {
      return [
        {
          type: "data-code-workspace-artifact",
          id: parsed.projectId,
          data: parsed,
        },
      ];
    }
  }
  return [];
}

export function toAiSdkUIMessages(messages: ChatMessage[]): AiHubUIMessage[] {
  return messages
    .filter(
      (message) =>
        message.role === "system" ||
        message.role === "user" ||
        message.role === "assistant",
    )
    .map((message) => ({
      id: message.id,
      role: message.role as "system" | "user" | "assistant",
      metadata: {
        protocol: "ai-hub-ui",
        createdAt: message.createdAt,
        status: message.status,
      },
      parts: message.parts.flatMap(partToUIParts),
    }));
}
