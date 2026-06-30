import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

type StreamEvent = Record<string, unknown>;

export type AiHubChatUIMessageMetadata = {
  protocol: "ai-hub-ui";
  conversationId?: string;
  messageId?: string;
  userMessageId?: string;
  stopped?: boolean;
};

type Subscriber = {
  enqueue: (event: StreamEvent) => void;
  close: () => void;
};

type StreamRun = {
  events: StreamEvent[];
  done: boolean;
  subscribers: Set<Subscriber>;
  abortController?: AbortController;
};

const globalStore = globalThis as typeof globalThis & {
  __aiHubChatStreamRuns?: Map<string, StreamRun>;
};

const runs = globalStore.__aiHubChatStreamRuns ?? new Map<string, StreamRun>();
globalStore.__aiHubChatStreamRuns = runs;

function getRun(messageId: string) {
  let run = runs.get(messageId);
  if (!run) {
    run = { events: [], done: false, subscribers: new Set() };
    runs.set(messageId, run);
  }
  return run;
}

export function publishChatStreamEvent(messageId: string, event: StreamEvent) {
  const run = getRun(messageId);
  run.events.push(event);
  for (const subscriber of run.subscribers) {
    subscriber.enqueue(event);
  }
}

export function registerChatStreamAbortController(
  messageId: string,
  abortController: AbortController,
) {
  const run = getRun(messageId);
  run.abortController = abortController;
}

export function abortChatStream(messageId: string) {
  const run = runs.get(messageId);
  if (!run || run.done) return false;
  run.abortController?.abort();
  publishChatStreamEvent(messageId, { type: "done", stopped: true });
  completeChatStream(messageId);
  return true;
}

export function completeChatStream(messageId: string) {
  const run = getRun(messageId);
  run.done = true;
  run.abortController = undefined;
  for (const subscriber of run.subscribers) {
    subscriber.close();
  }
  run.subscribers.clear();
  setTimeout(() => runs.delete(messageId), 5 * 60 * 1000);
}

export function hasActiveChatStream(messageId: string) {
  const run = runs.get(messageId);
  return Boolean(run && !run.done);
}

export function subscribeToChatStream(
  messageId: string,
  subscriber: Subscriber,
  options: { replay?: boolean } = {},
) {
  const run = getRun(messageId);
  if (options.replay ?? true) {
    for (const event of run.events) {
      subscriber.enqueue(event);
    }
  }
  if (run.done) {
    subscriber.close();
    return () => undefined;
  }
  run.subscribers.add(subscriber);
  return () => {
    run.subscribers.delete(subscriber);
  };
}

export function createChatStreamResponse(
  messageId: string,
  headers: Record<string, string> = {},
  options: { replay?: boolean } = {},
) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let unsubscribe: () => void = () => undefined;
      unsubscribe = subscribeToChatStream(
        messageId,
        {
          enqueue(event) {
            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
              );
            } catch {
              unsubscribe();
            }
          },
          close() {
            try {
              controller.close();
            } catch {
              // already closed
            }
          },
        },
        options,
      );
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...headers,
    },
  });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function outputIsDenied(output: unknown) {
  return (
    typeof output === "object" &&
    output !== null &&
    (output as { denied?: unknown }).denied === true
  );
}

function metadataFromHeaders(headers: Record<string, string>) {
  return {
    protocol: "ai-hub-ui" as const,
    conversationId: headers["X-Conversation-Id"],
    messageId: headers["X-Message-Id"],
    userMessageId: headers["X-User-Message-Id"],
  };
}

/**
 * AI SDK UI-compatible view of the existing AI Hub stream bus. This lets the
 * current chat runtime keep its audited custom events while clients can consume
 * the standard UIMessage stream protocol through DefaultChatTransport/useChat.
 */
export function createChatUIMessageStreamResponse(
  messageId: string,
  headers: Record<string, string> = {},
  options: { replay?: boolean } = {},
) {
  const stream = createUIMessageStream({
    execute: ({ writer }) =>
      new Promise<void>((resolve) => {
        const metadata = metadataFromHeaders(headers);
        let textPartId: string | null = null;
        let reasoningPartId: string | null = null;
        let partSequence = 0;
        let settled = false;

        function nextPartId(prefix: string) {
          partSequence += 1;
          return `${prefix}-${partSequence}`;
        }

        function finishTextParts() {
          if (textPartId) {
            writer.write({ type: "text-end", id: textPartId });
            textPartId = null;
          }
          if (reasoningPartId) {
            writer.write({ type: "reasoning-end", id: reasoningPartId });
            reasoningPartId = null;
          }
        }

        function settle(stopped = false) {
          if (settled) return;
          settled = true;
          finishTextParts();
          writer.write({
            type: "finish",
            finishReason: stopped ? "stop" : "stop",
            messageMetadata: { ...metadata, stopped },
          });
          resolve();
        }

        writer.write({
          type: "start",
          messageId,
          messageMetadata: metadata,
        });

        let unsubscribe: () => void = () => undefined;
        unsubscribe = subscribeToChatStream(
          messageId,
          {
            enqueue(event) {
              const type = stringValue(event.type);
              if (type === "text") {
                const delta = stringValue(event.delta);
                if (!delta) return;
                if (!textPartId) {
                  textPartId = nextPartId("text");
                  writer.write({ type: "text-start", id: textPartId });
                }
                writer.write({ type: "text-delta", id: textPartId, delta });
                return;
              }

              if (type === "reasoning") {
                const delta = stringValue(event.delta);
                if (!delta) return;
                if (!reasoningPartId) {
                  reasoningPartId = nextPartId("reasoning");
                  writer.write({
                    type: "reasoning-start",
                    id: reasoningPartId,
                  });
                }
                writer.write({
                  type: "reasoning-delta",
                  id: reasoningPartId,
                  delta,
                });
                return;
              }

              if (type === "tool_input_start") {
                const toolCallId = stringValue(event.toolCallId);
                const toolName = stringValue(event.toolName);
                if (toolCallId && toolName) {
                  writer.write({
                    type: "tool-input-start",
                    toolCallId,
                    toolName,
                  });
                }
                return;
              }

              if (type === "tool_input_delta") {
                const toolCallId = stringValue(event.toolCallId);
                const inputTextDelta = stringValue(event.delta);
                if (toolCallId && inputTextDelta) {
                  writer.write({
                    type: "tool-input-delta",
                    toolCallId,
                    inputTextDelta,
                  });
                }
                return;
              }

              if (type === "tool_call") {
                const toolCallId = stringValue(event.toolCallId);
                const toolName = stringValue(event.toolName);
                if (toolCallId && toolName) {
                  writer.write({
                    type: "tool-input-available",
                    toolCallId,
                    toolName,
                    input: event.input,
                  });
                }
                return;
              }

              if (type === "tool_result") {
                const toolCallId = stringValue(event.toolCallId);
                if (!toolCallId) return;
                if (outputIsDenied(event.output)) {
                  writer.write({ type: "tool-output-denied", toolCallId });
                } else {
                  writer.write({
                    type: "tool-output-available",
                    toolCallId,
                    output: event.output,
                  });
                }
                return;
              }

              if (type === "tool_approval_required") {
                const invocationId = stringValue(event.invocationId);
                if (invocationId) {
                  writer.write({
                    type: "data-tool-approval",
                    id: invocationId,
                    data: {
                      invocationId,
                      toolName: event.toolName,
                      input: event.input,
                    },
                  });
                }
                return;
              }

              if (type === "citations" && Array.isArray(event.citations)) {
                writer.write({
                  type: "data-citations",
                  id: "citations",
                  data: event.citations,
                });
                for (const citation of event.citations) {
                  if (
                    typeof citation === "object" &&
                    citation !== null &&
                    typeof (citation as { chunkId?: unknown }).chunkId ===
                      "string"
                  ) {
                    writer.write({
                      type: "source-document",
                      sourceId: (citation as { chunkId: string }).chunkId,
                      mediaType: "text/plain",
                      title:
                        stringValue(
                          (citation as { documentTitle?: unknown })
                            .documentTitle,
                        ) ?? "Knowledge source",
                    });
                  }
                }
                return;
              }

              if (type === "file") {
                writer.write({
                  type: "data-code-workspace-artifact",
                  id: stringValue(
                    (event.artifact as { projectId?: unknown })?.projectId,
                  ),
                  data: event.artifact,
                });
                return;
              }

              if (type === "suggestions") {
                writer.write({
                  type: "data-suggestions",
                  id: "suggestions",
                  data: event.suggestions,
                });
                return;
              }

              if (type === "conversation_title") {
                writer.write({
                  type: "data-conversation-title",
                  id: "conversation-title",
                  data: { title: event.title },
                  transient: true,
                });
                return;
              }

              if (type === "error") {
                writer.write({
                  type: "error",
                  errorText: stringValue(event.error) ?? "Chat stream failed",
                });
                settle(false);
                unsubscribe();
                return;
              }

              if (type === "done") {
                settle(event.stopped === true);
                unsubscribe();
              }
            },
            close() {
              settle(false);
            },
          },
          options,
        );
      }),
    onError: (error) =>
      error instanceof Error ? error.message : "Chat stream failed",
  });

  return createUIMessageStreamResponse({
    stream,
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      ...headers,
    },
  });
}
