import { DefaultChatTransport, type UIMessage, type UIMessageChunk } from "ai";

import type {
  ChatCitation,
  ChatStreamEvent,
  CodeWorkspaceArtifact,
} from "@/components/chat/chat-types";

export type AiSdkUIChatStartMetadata = {
  conversationId?: string;
  messageId?: string;
  userMessageId?: string;
};

type StreamAiSdkUIChatOptions = {
  api: string;
  chatId: string;
  content: string;
  localUserMessageId: string;
  resendFromMessageId?: string;
  body: Record<string, unknown>;
  abortSignal: AbortSignal;
  onStart: (metadata: AiSdkUIChatStartMetadata) => void;
  onEvent: (event: ChatStreamEvent) => void;
};

function readMetadata(value: unknown): AiSdkUIChatStartMetadata {
  if (typeof value !== "object" || value === null) return {};
  const record = value as Record<string, unknown>;
  return {
    conversationId:
      typeof record.conversationId === "string"
        ? record.conversationId
        : undefined,
    messageId:
      typeof record.messageId === "string" ? record.messageId : undefined,
    userMessageId:
      typeof record.userMessageId === "string"
        ? record.userMessageId
        : undefined,
  };
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

function isCitationArray(value: unknown): value is ChatCitation[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (typeof item !== "object" || item === null) return false;
      const record = item as Record<string, unknown>;
      return (
        typeof record.chunkId === "string" &&
        typeof record.documentId === "string" &&
        typeof record.documentTitle === "string" &&
        typeof record.content === "string" &&
        typeof record.score === "number"
      );
    })
  );
}

function toolApprovalFromData(data: unknown): ChatStreamEvent | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  if (
    typeof record.invocationId !== "string" ||
    typeof record.toolName !== "string"
  ) {
    return null;
  }
  return {
    type: "tool_approval_required",
    invocationId: record.invocationId,
    toolName: record.toolName,
    input: record.input,
  };
}

function titleFromData(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const title = (data as Record<string, unknown>).title;
  return typeof title === "string" ? title : null;
}

async function* iterateChunks(stream: ReadableStream<UIMessageChunk>) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function streamAiSdkUIChat(options: StreamAiSdkUIChatOptions) {
  const toolNamesByCallId = new Map<string, string>();
  const transport = new DefaultChatTransport<UIMessage>({
    api: options.api,
    credentials: "same-origin",
    headers: { "X-AI-Hub-Stream-Protocol": "ai-sdk-ui" },
    prepareSendMessagesRequest: ({ body }) => ({
      body: body ?? {},
      headers: { "X-AI-Hub-Stream-Protocol": "ai-sdk-ui" },
      credentials: "same-origin",
    }),
  });

  const stream = await transport.sendMessages({
    trigger: options.resendFromMessageId
      ? "regenerate-message"
      : "submit-message",
    chatId: options.chatId,
    messageId: options.resendFromMessageId,
    messages: [
      {
        id: options.localUserMessageId,
        role: "user",
        parts: [{ type: "text", text: options.content }],
      },
    ],
    abortSignal: options.abortSignal,
    body: options.body,
  });

  for await (const chunk of iterateChunks(stream)) {
    switch (chunk.type) {
      case "start":
        options.onStart({
          ...readMetadata(chunk.messageMetadata),
          messageId:
            chunk.messageId ?? readMetadata(chunk.messageMetadata).messageId,
        });
        break;
      case "text-delta":
        options.onEvent({ type: "text", delta: chunk.delta });
        break;
      case "reasoning-delta":
        options.onEvent({ type: "reasoning", delta: chunk.delta });
        break;
      case "tool-input-start":
        toolNamesByCallId.set(chunk.toolCallId, chunk.toolName);
        options.onEvent({
          type: "tool_input_start",
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
        });
        break;
      case "tool-input-delta":
        options.onEvent({
          type: "tool_input_delta",
          toolCallId: chunk.toolCallId,
          delta: chunk.inputTextDelta,
        });
        break;
      case "tool-input-available":
        toolNamesByCallId.set(chunk.toolCallId, chunk.toolName);
        options.onEvent({
          type: "tool_call",
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          input: chunk.input,
        });
        break;
      case "tool-output-available":
        options.onEvent({
          type: "tool_result",
          toolCallId: chunk.toolCallId,
          toolName: toolNamesByCallId.get(chunk.toolCallId) ?? "tool",
          output: chunk.output,
        });
        break;
      case "tool-output-denied":
        options.onEvent({
          type: "tool_result",
          toolCallId: chunk.toolCallId,
          toolName: toolNamesByCallId.get(chunk.toolCallId) ?? "tool",
          output: { denied: true },
        });
        break;
      case "tool-output-error":
        options.onEvent({
          type: "tool_result",
          toolCallId: chunk.toolCallId,
          toolName: toolNamesByCallId.get(chunk.toolCallId) ?? "tool",
          output: { denied: true, message: chunk.errorText },
        });
        break;
      case "data-tool-approval": {
        const event = toolApprovalFromData(chunk.data);
        if (event) options.onEvent(event);
        break;
      }
      case "data-citations":
        if (isCitationArray(chunk.data)) {
          options.onEvent({ type: "citations", citations: chunk.data });
        }
        break;
      case "data-code-workspace-artifact":
        if (isCodeWorkspaceArtifact(chunk.data)) {
          options.onEvent({ type: "file", artifact: chunk.data });
        }
        break;
      case "data-suggestions":
        if (
          Array.isArray(chunk.data) &&
          chunk.data.every((item) => typeof item === "string")
        ) {
          options.onEvent({ type: "suggestions", suggestions: chunk.data });
        }
        break;
      case "data-conversation-title": {
        const title = titleFromData(chunk.data);
        if (title) options.onEvent({ type: "conversation_title", title });
        break;
      }
      case "error":
        options.onEvent({ type: "error", error: chunk.errorText });
        break;
      case "finish":
        options.onEvent({ type: "done" });
        break;
    }
  }
}
