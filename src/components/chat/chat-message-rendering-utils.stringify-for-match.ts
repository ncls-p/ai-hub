import {
  parseToolPart,
  type ChatImageAttachment,
  type ChatMessagePart,
} from "@/components/chat/chat-types";
import { isCodeWorkspaceArtifactOutput } from "@/components/chat/code-workspace-artifact-card";
import { summarizeToolInput } from "@/components/chat/tool-approval-banner";
import {
  chatTodoListFromUnknown,
  type ChatTodoList,
} from "@/modules/chat/todo-list";
import { parseAgentToolDisplayContext } from "@/modules/agent/tool-progress-payload";
import {
  isCodeSandboxToolName,
  htmlArtifactFromInputText,
  htmlArtifactFromToolInput,
  shouldShowCodeSandboxToUser,
} from "./chat-message-rendering-utils.code-sandbox-input-from-unknown";
import {
  codeSandboxOutputFromUnknown,
  isChatImageAttachmentOutput,
} from "./chat-message-rendering-utils.latest-chat-todo-list-from-messages";

export function stringifyForMatch(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function formatToolName(toolName: string | undefined) {
  if (!toolName) return "Tool";
  const withoutPrefix = toolName.replace(/^mcp_[0-9a-f_]{36,}_(.+)$/i, "$1");
  return withoutPrefix
    .replace(/__+/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function summarizeToolBody(
  toolName: string | undefined,
  body: unknown,
  isCall: boolean,
) {
  if (isCall) return summarizeToolInput(formatToolName(toolName), body);
  if (body === null || body === undefined) return "The tool finished.";
  if (isHtmlArtifactOutput(body)) return `Rendered ${body.title}.`;
  if (isCodeWorkspaceArtifactOutput(body)) return `Updated ${body.title}.`;
  if (typeof body === "string") return body.slice(0, 180);
  if (Array.isArray(body))
    return `Returned ${body.length} item${body.length === 1 ? "" : "s"}.`;
  if (typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.text === "string") return record.text.slice(0, 180);
    if (typeof record.content === "string") return record.content.slice(0, 180);
    if (typeof record.result === "string") return record.result.slice(0, 180);
    if (typeof record.message === "string") return record.message.slice(0, 180);
    const keys = Object.keys(record);
    return keys.length > 0
      ? `Returned ${keys.slice(0, 3).join(", ")}${keys.length > 3 ? "…" : ""}.`
      : "The tool finished.";
  }
  return String(body).slice(0, 180);
}

export type KnowledgeSearchResult = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  knowledgeBaseName: string;
  score: number;
};

export function knowledgeSearchResultsFromUnknown(
  value: unknown,
): KnowledgeSearchResult[] | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    record.kind !== "knowledge_search_results" ||
    !Array.isArray(record.results)
  ) {
    return null;
  }
  return record.results.filter((result): result is KnowledgeSearchResult => {
    if (typeof result !== "object" || result === null) return false;
    const row = result as Partial<KnowledgeSearchResult>;
    return (
      typeof row.chunkId === "string" &&
      typeof row.documentId === "string" &&
      typeof row.documentTitle === "string" &&
      typeof row.content === "string" &&
      typeof row.knowledgeBaseName === "string" &&
      typeof row.score === "number"
    );
  });
}

export function knowledgeContextChunkCount(value: unknown) {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.kind !== "knowledge_context" || record.found !== true) {
    return null;
  }
  return Array.isArray(record.chunks) ? record.chunks.length : 0;
}

export function delegationFailureDetails(output: unknown): {
  errorCode: string | null;
  reason: string | null;
} {
  if (typeof output !== "object" || output === null) {
    return { errorCode: null, reason: null };
  }
  const record = output as Record<string, unknown>;
  return {
    errorCode: typeof record.errorCode === "string" ? record.errorCode : null,
    reason: typeof record.error === "string" ? record.error : null,
  };
}

export type HtmlArtifactOutput = {
  kind: "html_artifact";
  title: string;
  html: string;
  css: string;
  js: string;
  height: number;
};

export type GeneratedImageOutput = {
  kind: "generated_image";
  attachment: ChatImageAttachment;
  prompt: string;
  size: string;
  provider: string;
  model: string;
  impact: {
    cost: number | null;
    currency: string;
    energyKwh: number | null;
    co2Grams: number | null;
  };
};

export function isGeneratedImageOutput(
  value: unknown,
): value is GeneratedImageOutput {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "generated_image" &&
    isChatImageAttachmentOutput(record.attachment) &&
    typeof record.prompt === "string" &&
    typeof record.model === "string"
  );
}

export function isHtmlArtifactOutput(
  value: unknown,
): value is HtmlArtifactOutput {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "html_artifact" &&
    typeof record.title === "string" &&
    typeof record.html === "string" &&
    typeof record.css === "string" &&
    typeof record.js === "string" &&
    typeof record.height === "number"
  );
}

export type GitHubPublishOutput = {
  kind: "github_publish_result";
  mode: "pull_request" | "direct_push";
  repository: string;
  targetBranch: string;
  sourceBranch: string | null;
  commitSha: string;
  pullRequestUrl: string | null;
  message: string;
};

export function isGitHubPublishOutput(
  value: unknown,
): value is GitHubPublishOutput {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "github_publish_result" &&
    typeof record.repository === "string" &&
    typeof record.targetBranch === "string" &&
    typeof record.commitSha === "string"
  );
}

export function toolPartHasStandaloneRendering(part: ChatMessagePart) {
  if (part.type !== "tool-call" && part.type !== "tool-result") return false;
  const parsed = parseToolPart(part.content);
  const agentContext = parseAgentToolDisplayContext(parsed.agentContext);
  if (agentContext && agentContext.depth > 0) return false;
  const visualToolName = parsed.toolName ?? "";
  const showSandboxToUser = shouldShowCodeSandboxToUser(
    parsed.input,
    parsed.inputText,
  );
  return Boolean(
    visualToolName === "render_html_artifact" ||
    visualToolName === "generate_image" ||
    (isCodeSandboxToolName(visualToolName) &&
      (showSandboxToUser || parsed.streamingInput)) ||
    visualToolName === "github_publish_code_workspace" ||
    visualToolName.startsWith("code_workspace_") ||
    (codeSandboxOutputFromUnknown(parsed.output) && showSandboxToUser) ||
    isHtmlArtifactOutput(parsed.output) ||
    isGeneratedImageOutput(parsed.output) ||
    isCodeWorkspaceArtifactOutput(parsed.output) ||
    isGitHubPublishOutput(parsed.output) ||
    htmlArtifactFromToolInput(parsed.input) ||
    htmlArtifactFromInputText(parsed.inputText),
  );
}

export function chatTodoListFromToolPart(
  part: ChatMessagePart,
): ChatTodoList | null {
  if (part.type !== "tool-call" && part.type !== "tool-result") return null;
  return chatTodoListFromUnknown(parseToolPart(part.content).output);
}
