import { reasoningPresetSchema } from "@/modules/agent/reasoning-presets";
import { isEphemeralTtlMinutes } from "@/modules/chat/ephemeral-retention";
import {
  projectToolMessagePayload,
  safeToolErrorMessage,
} from "@/modules/tool/safe-payload";
import { registerAiSdkDevTools } from "@/server/infrastructure/ai-sdk/devtools";
import { parsePartialJson } from "ai";
import { z } from "zod";
import {
  MAX_GENERATION_OUTPUT_TOKENS,
  MAX_INPUT_CHARACTERS,
} from "@/modules/chat/conversation-context-policy";

registerAiSdkDevTools();

export const chatRequestSchema = z.object({
  workspaceId: z.uuid().optional(),
  content: z.string().trim().min(1).max(MAX_INPUT_CHARACTERS),
  conversationId: z.uuid().nullable().optional(),
  ephemeral: z.boolean().optional(),
  ephemeralTtlMinutes: z
    .number()
    .int()
    .refine(isEphemeralTtlMinutes)
    .optional(),
  resendFromMessageId: z.uuid().nullable().optional(),
  regenerateAssistantMessageId: z.uuid().nullable().optional(),
  continueFromMessageId: z.uuid().nullable().optional(),
  codeWorkspaceId: z.uuid().optional(),
  attachmentIds: z.array(z.uuid()).optional(),
  imageAttachmentIds: z.array(z.uuid()).optional(),
  reasoningEffort: reasoningPresetSchema.optional(),
  capabilityOverrides: z
    .object({
      disabledTools: z
        .array(
          z.object({
            source: z.enum(["builtin", "mcp", "custom"]),
            id: z.string().trim().min(1).max(255),
          }),
        )
        .max(256),
      disabledSkillIds: z.array(z.uuid()).max(128),
      enabledTools: z
        .array(
          z.object({
            source: z.enum(["builtin", "mcp", "custom"]),
            id: z.uuid(),
          }),
        )
        .max(256)
        .default([]),
      enabledSkillIds: z.array(z.uuid()).max(128).default([]),
      enabledKnowledgeIds: z.array(z.uuid()).max(128).default([]),
    })
    .optional(),
});

export const defaultMaxToolCalls = 20;
export const defaultMaxOutputTokens = MAX_GENERATION_OUTPUT_TOKENS;
export const BUILTIN_TOOL_SOURCE = "builtin";
export const KNOWLEDGE_SEARCH_TOOL_NAME = "search_knowledge";
export const KNOWLEDGE_CONTEXT_TOOL_NAME = "read_knowledge_context";
export const KNOWLEDGE_SEARCH_TOOL_ID = "00000000-0000-4000-8000-000000000101";
export const KNOWLEDGE_CONTEXT_TOOL_ID = "00000000-0000-4000-8000-000000000102";
export const MAX_OPENAI_TOOL_NAME_LENGTH = 64;
export const TOOL_GATE_RETURN = "return" as const;
export type ToolGateResult =
  | { status: "continue" }
  | { status: typeof TOOL_GATE_RETURN; output: unknown };

export type ToolApprovalRequiredEvent = {
  invocationId: string;
  toolName: string;
  input: unknown;
};

export type BoundToolApprovalMetadata = {
  toolSource: typeof BUILTIN_TOOL_SOURCE | "custom" | "mcp";
  toolName: string;
  riskLevel?: string | null;
  bindingRequiresApproval?: boolean;
  serverRequiresApproval?: boolean;
  toolRequiresApproval?: boolean;
  skipDefaultRiskApproval?: boolean;
};

export type KnowledgeToolCitation = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  score: number;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
};

export function knowledgeCitationsFromToolOutput(
  value: unknown,
): KnowledgeToolCitation[] {
  if (!value || typeof value !== "object") return [];
  const output = value as { kind?: unknown; results?: unknown };
  if (
    output.kind !== "knowledge_search_results" ||
    !Array.isArray(output.results)
  ) {
    return [];
  }
  return output.results.filter((result): result is KnowledgeToolCitation => {
    if (!result || typeof result !== "object") return false;
    const row = result as Partial<KnowledgeToolCitation>;
    return (
      typeof row.chunkId === "string" &&
      typeof row.documentId === "string" &&
      typeof row.documentTitle === "string" &&
      typeof row.content === "string" &&
      typeof row.score === "number" &&
      typeof row.knowledgeBaseId === "string" &&
      typeof row.knowledgeBaseName === "string"
    );
  });
}

const githubPublishToolNames = [
  "github_get_publish_status",
  "github_publish_code_workspace",
];

const codeWorkspaceEditToolNames = [
  "code_workspace_list_files",
  "code_workspace_read_file",
  "code_workspace_write_file",
  "code_workspace_replace_text",
  "code_workspace_delete_file",
  ...githubPublishToolNames,
];

export const codeWorkspaceCreateToolNames = [
  "code_workspace_create_project",
  ...codeWorkspaceEditToolNames,
];

function userFilePartIdentity(metadata: unknown) {
  if (typeof metadata !== "object" || metadata === null) return null;
  const record = metadata as Record<string, unknown>;
  if (
    (record.kind === "chat_file" || record.kind === "chat_image") &&
    typeof record.id === "string"
  ) {
    return `${record.kind}:${record.id}`;
  }
  if (
    record.kind === "code_workspace_artifact" &&
    typeof record.projectId === "string"
  ) {
    return `${record.kind}:${record.projectId}`;
  }
  return null;
}

export function mergeUserFilePartMetadata(
  persisted: unknown[],
  requested: unknown[],
) {
  const merged: unknown[] = [];
  const indexesByIdentity = new Map<string, number>();
  for (const metadata of [...persisted, ...requested]) {
    const identity = userFilePartIdentity(metadata);
    if (!identity) {
      merged.push(metadata);
      continue;
    }
    const existingIndex = indexesByIdentity.get(identity);
    if (existingIndex === undefined) {
      indexesByIdentity.set(identity, merged.length);
      merged.push(metadata);
    } else {
      merged[existingIndex] = metadata;
    }
  }
  return merged;
}

export function streamToolCallId(part: unknown) {
  const record = part as Record<string, unknown>;
  return typeof record.toolCallId === "string"
    ? record.toolCallId
    : typeof record.id === "string"
      ? record.id
      : "";
}

export function streamToolInputDelta(part: unknown) {
  const record = part as Record<string, unknown>;
  return typeof record.delta === "string"
    ? record.delta
    : typeof record.inputTextDelta === "string"
      ? record.inputTextDelta
      : "";
}

export async function projectStreamedToolInput(inputText: string) {
  const parsed = await parsePartialJson(inputText);
  if (parsed.value === undefined) return "";
  return JSON.stringify(projectToolMessagePayload(parsed.value), null, 2);
}

export function streamToolErrorOutput(part: unknown, originalError?: unknown) {
  const record = part as Record<string, unknown>;
  const sourceError = originalError ?? record.error;
  const errorRecord =
    typeof sourceError === "object" && sourceError !== null
      ? (sourceError as Record<string, unknown>)
      : null;
  const isUnavailableTool =
    errorRecord?.name === "AI_NoSuchToolError" ||
    errorRecord?.name === "NoSuchToolError";

  return {
    ok: false,
    code: isUnavailableTool ? "tool_unavailable" : "tool_execution_failed",
    error: isUnavailableTool
      ? "The requested tool is not available for this assistant."
      : safeToolErrorMessage(record.error, "Tool execution failed"),
  };
}

export function sanitizeToolKeyPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/^_+|_+$/g, "");
}
