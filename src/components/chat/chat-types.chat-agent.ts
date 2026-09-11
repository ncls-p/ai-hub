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
  toolCount?: number;
  hiddenInChat?: boolean;
}

export interface ChatConversation {
  workspaceId?: string;
  id: string;
  title: string;
  agentId: string;
  folderId?: string | null;
  pinnedAt?: string | null;
  sidebarOrder?: number | null;
  updatedAt: string;
  isOwner?: boolean;
  canContinue?: boolean;
  continuationMode?: "shared" | "fork";
  isEphemeral?: boolean;
  ephemeralTtlMinutes?: number;
  expiresAt?: string | null;
  publicShareId?: string | null;
  searchMatch?: {
    kind: "title" | "message";
    snippet: string;
  };
  latestAssistantMessageId?: string;
  latestAssistantConversationId?: string;
  latestAssistantStatus?: string;
  latestAssistantCompletedAt?: string | null;
  isStreaming?: boolean;
  isUnread?: boolean;
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
  generationSettingsJson?: {
    reasoningPresets?: string[];
  } | null;
  memoryPolicyJson?: {
    maxInputCharacters?: number;
  } | null;
}

export interface ChatMessagePart {
  type: string;
  content: string;
  state?: "streaming" | "done";
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
  streamGenerationId?: string;
  role: "user" | "assistant" | "system" | "tool";
  status?: string;
  parts: ChatMessagePart[];
  createdAt?: string;
  metrics?: import("@/modules/chat/message-metrics").ChatMessageMetrics;
  branch?: import("@/modules/chat/conversation-branches").ConversationBranchNavigation;
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

export type ChatUsageImpact = {
  inputTokens: number;
  outputTokens: number;
  cost: number | null;
  currency: string;
  energyKwh: number | null;
  co2Grams: number | null;
};

export function aggregateChatUsageImpact(
  messages: ChatMessage[],
): ChatUsageImpact | null {
  let found = false;
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  let hasCost = false;
  let currency: string | null = null;
  let currenciesMatch = true;
  let energyKwh = 0;
  let hasEnergy = false;
  let co2Grams = 0;
  let hasCo2 = false;

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type !== "impact") continue;
      try {
        const impact = JSON.parse(part.content) as Partial<ChatUsageImpact>;
        found = true;
        if (Number.isFinite(impact.inputTokens)) {
          inputTokens += impact.inputTokens ?? 0;
        }
        if (Number.isFinite(impact.outputTokens)) {
          outputTokens += impact.outputTokens ?? 0;
        }
        if (typeof impact.cost === "number" && Number.isFinite(impact.cost)) {
          const nextCurrency = impact.currency?.trim();
          if (nextCurrency) {
            currency ??= nextCurrency;
            currenciesMatch &&= currency === nextCurrency;
          }
          cost += impact.cost;
          hasCost = true;
        }
        if (
          typeof impact.energyKwh === "number" &&
          Number.isFinite(impact.energyKwh)
        ) {
          energyKwh += impact.energyKwh;
          hasEnergy = true;
        }
        if (
          typeof impact.co2Grams === "number" &&
          Number.isFinite(impact.co2Grams)
        ) {
          co2Grams += impact.co2Grams;
          hasCo2 = true;
        }
      } catch {
        // Ignore malformed historical parts without hiding valid metrics.
      }
    }
  }

  if (!found) return null;
  return {
    inputTokens,
    outputTokens,
    cost: hasCost && currenciesMatch ? cost : null,
    currency: currency ?? "EUR",
    energyKwh: hasEnergy ? energyKwh : null,
    co2Grams: hasCo2 ? co2Grams : null,
  };
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
