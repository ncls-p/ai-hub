export interface ChatAgent {
  id: string;
  name: string;
  description: string | null;
  activeVersionId: string | null;
  logoUrl?: string | null;
  modelDisplayName?: string | null;
  isGlobal?: boolean;
  isRecommended?: boolean;
  canEdit?: boolean;
  isOrganizationDefault?: boolean;
  promptSuggestions?: string[];
  modelLogoUrl?: string | null;
}

export interface ChatConversation {
  id: string;
  title: string;
  agentId: string;
  folderId?: string | null;
  pinnedAt?: string | null;
  sidebarOrder?: number | null;
  updatedAt: string;
}

export interface ChatConversationFolder {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentVersion {
  id: string;
  providerId: string | null;
  modelId: string | null;
  isActive: boolean;
}

export interface ChatMessagePart {
  type: string;
  content: string;
}

interface CodeWorkspaceFileSummary {
  path: string;
  size: number;
  mimeType: string;
  binary: boolean;
  hash: string;
  updatedAt: string;
}

export interface CodeWorkspaceArtifact {
  kind: "code_workspace_artifact";
  projectId: string;
  title: string;
  rootFile: string | null;
  version: number;
  previewUrl: string | null;
  downloadUrl: string;
  files: CodeWorkspaceFileSummary[];
  message?: string;
}

export interface ChatImageAttachment {
  kind: "chat_image";
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  hash: string;
  url: string;
}

export interface ChatFileAttachment {
  kind: "chat_file";
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  hash: string;
  url: string;
  category: "document" | "presentation" | "spreadsheet" | "text" | "file";
  extractionStatus: "readable" | "truncated" | "unreadable";
  extractedTextChars: number;
  extractionMessage?: string;
}

export type ChatAttachment = ChatImageAttachment | ChatFileAttachment;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  status?: string;
  parts: ChatMessagePart[];
  createdAt?: string;
}

export interface PendingToolApproval {
  invocationId: string;
  toolName: string;
  input: unknown;
}

export interface ChatCitation {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  score: number;
  knowledgeBaseId?: string;
  knowledgeBaseName?: string;
}

function sanitizeToolName(name: string) {
  return name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+|_+$/g, "");
}

export function toolNameMatches(
  toolCallName: string | undefined,
  approvalName: string,
) {
  if (!toolCallName) return false;
  if (toolCallName === approvalName) return true;
  const sanitizedApprovalName = sanitizeToolName(approvalName);
  return (
    toolCallName === sanitizedApprovalName ||
    toolCallName.endsWith(`_${sanitizedApprovalName}`)
  );
}

export type ChatStreamEvent =
  | { type: "text" | "reasoning"; delta: string }
  | { type: "done" }
  | { type: "error"; error: string }
  | { type: "conversation_title"; title: string }
  | { type: "suggestions"; suggestions: string[] }
  | {
      type: "tool_approval_required";
      invocationId: string;
      toolName: string;
      input: unknown;
    }
  | {
      type: "tool_input_start";
      toolCallId: string;
      toolName: string;
    }
  | {
      type: "tool_input_delta";
      toolCallId: string;
      delta: string;
    }
  | {
      type: "tool_input_end";
      toolCallId: string;
    }
  | {
      type: "tool_call";
      toolCallId: string;
      toolName: string;
      input: unknown;
    }
  | {
      type: "tool_result";
      toolCallId: string;
      toolName: string;
      output: unknown;
    }
  | { type: "file"; artifact: CodeWorkspaceArtifact }
  | { type: "citations"; citations: ChatCitation[] };

export function textFromMessage(message: ChatMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.content)
    .join("\n");
}

function parseToolPartRecord(part: ChatMessagePart) {
  try {
    return JSON.parse(part.content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function mergeToolParts(parts: ChatMessagePart[]): ChatMessagePart[] {
  const callsById = new Set<string>();
  const resultsByCallId = new Map<string, Record<string, unknown>>();

  for (const part of parts) {
    const parsed = parseToolPartRecord(part);
    if (!parsed || typeof parsed.toolCallId !== "string") continue;
    const callId = parsed.toolCallId;

    if (part.type === "tool-call") {
      callsById.add(callId);
    } else if (part.type === "tool-result") {
      resultsByCallId.set(callId, parsed);
    }
  }

  return parts.flatMap((part) => {
    if (part.type === "tool-call") {
      const parsed = parseToolPartRecord(part);
      if (!parsed || typeof parsed.toolCallId !== "string") return [part];

      const result = resultsByCallId.get(parsed.toolCallId);
      if (!result) return [part];

      return [
        {
          type: "tool-call",
          content: JSON.stringify({
            ...parsed,
            toolName: parsed.toolName ?? result.toolName,
            output: result.output,
          }),
        },
      ];
    }

    if (part.type === "tool-result") {
      const parsed = parseToolPartRecord(part);
      const callId = parsed?.toolCallId;
      return typeof callId === "string" && callsById.has(callId) ? [] : [part];
    }

    return [part];
  });
}

export function renderablePartsFromMessage(message: ChatMessage) {
  return mergeToolParts(message.parts).filter((part) =>
    [
      "text",
      "file",
      "reasoning",
      "tool-call",
      "tool-result",
      "suggestions",
    ].includes(part.type),
  );
}

export function citationsFromMessage(message: ChatMessage): ChatCitation[] {
  const part = message.parts.find((p) => p.type === "citations");
  if (!part?.content) return [];
  try {
    return JSON.parse(part.content) as ChatCitation[];
  } catch {
    return [];
  }
}

export function parseToolPart(content: string): {
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  inputText?: string;
  streamingInput?: boolean;
  denied?: boolean;
  message?: string;
} {
  if (!content) return {};
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return parsed as ReturnType<typeof parseToolPart>;
  } catch {
    return { output: content };
  }
}

function isDeniedToolOutput(output: unknown) {
  return (
    typeof output === "object" &&
    output !== null &&
    (output as { denied?: unknown }).denied === true
  );
}

export function getToolStatus(
  parsed: ReturnType<typeof parseToolPart>,
): "pending" | "completed" | "error" {
  if (parsed.denied || isDeniedToolOutput(parsed.output)) return "error";
  if (parsed.output !== undefined) return "completed";
  return "pending";
}

export function createLocalMessage(
  role: "user" | "assistant",
  content: string,
  extraParts: ChatMessagePart[] = [],
): ChatMessage {
  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    status: role === "assistant" ? "streaming" : "completed",
    parts: [{ type: "text", content }, ...extraParts],
    createdAt: new Date().toISOString(),
  };
}

export function appendMessagePart(
  parts: ChatMessage["parts"],
  type: "text" | "reasoning",
  delta: string,
) {
  const nextParts = [...parts];
  const lastPart = nextParts.at(-1);

  if (lastPart?.type !== type) {
    return [...nextParts, { type, content: delta }];
  }

  nextParts[nextParts.length - 1] = {
    ...lastPart,
    content: `${lastPart.content}${delta}`,
  };
  return nextParts;
}

type StreamEventCandidate = Record<string, unknown> & { type?: unknown };

type StreamEventValidator = (event: StreamEventCandidate) => boolean;

const hasStringDelta: StreamEventValidator = (event) =>
  typeof event.delta === "string";

const hasToolIdentity: StreamEventValidator = (event) =>
  typeof event.toolCallId === "string" && typeof event.toolName === "string";

const STREAM_EVENT_VALIDATORS: Record<string, StreamEventValidator> = {
  text: hasStringDelta,
  reasoning: hasStringDelta,
  error: (event) => typeof event.error === "string",
  done: () => true,
  tool_approval_required: (event) =>
    typeof event.invocationId === "string" &&
    typeof event.toolName === "string",
  tool_input_start: hasToolIdentity,
  tool_input_delta: (event) =>
    typeof event.toolCallId === "string" && typeof event.delta === "string",
  tool_input_end: (event) => typeof event.toolCallId === "string",
  tool_call: hasToolIdentity,
  tool_result: hasToolIdentity,
  file: (event) => typeof event.artifact === "object",
  conversation_title: (event) => typeof event.title === "string",
  suggestions: (event) =>
    Array.isArray(event.suggestions) &&
    event.suggestions.every((item) => typeof item === "string"),
  citations: (event) =>
    Array.isArray(event.citations) || Array.isArray(event.sources),
};

export function isChatStreamEvent(value: unknown): value is ChatStreamEvent {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }

  const event = value as StreamEventCandidate;
  const validator =
    typeof event.type === "string"
      ? STREAM_EVENT_VALIDATORS[event.type]
      : undefined;

  return validator?.(event) ?? false;
}
