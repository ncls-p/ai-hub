/* ─── Types ─────────────────────────────────────────────────────────── */

export type Agent = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl?: string | null;
  activeVersionId?: string | null;
  sharingMode: "personal" | "marketplace" | "specific_user";
  shareTargetEmail?: string | null;
  isGlobal: boolean;
  isRecommended: boolean;
  isOrganizationDefault?: boolean;
  organizationDisplayOrder?: number;
  curationLabel: string | null;
  promptSuggestions?: string[];
  canAdminCurate: boolean;
  canEdit?: boolean;
  canClone?: boolean;
};

export type Provider = { id: string; name: string; kind: string };
export type Model = {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string | null;
  logoUrl?: string | null;
};
export type BuiltinTool = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  riskLevel: string;
  category?: string;
};
export type McpServer = { id: string; name: string; requireApproval: boolean };
export type McpTool = {
  id: string;
  name: string;
  description: string | null;
  mcpServerId: string;
  enabled: boolean;
  requireApproval: boolean;
};
export type CustomTool = {
  id: string;
  name: string;
  description: string | null;
  status: string;
};
export type KnowledgeBase = { id: string; name: string };
export type AgentSkill = {
  id: string;
  name: string;
  description: string | null;
};
export type ToolBinding = {
  toolSource: string;
  toolId: string;
  requireApproval: boolean;
};
export type KnowledgeBinding = {
  knowledgeBaseId: string;
  name: string;
};
export type SkillBinding = {
  skillId: string;
  name: string;
  description: string | null;
};

type AgentToolChoice = "auto" | "required" | "none";
type AgentResponseFormat = "text" | "json_object";

interface AgentGenerationSettings {
  topK: string;
  presencePenalty: string;
  frequencyPenalty: string;
  seed: string;
  maxRetries: string;
  stopSequences: string;
}

interface AgentMemoryPolicy {
  enabled: boolean;
  maxMessages: number;
}

interface AgentGuardrails {
  enabled: boolean;
  blockedTopics: string[];
}

interface AgentApprovalPolicy {
  requireApprovalForAllTools: boolean;
  defaultDecision?: "allow" | "deny" | "require_approval";
  requireApprovalRiskLevels?: Array<"low" | "medium" | "high" | "critical">;
  requireApprovalToolNames?: string[];
  denyToolNames?: string[];
  requireApprovalSources?: Array<"builtin" | "custom" | "mcp">;
}

export type AgentForm = {
  name: string;
  slug: string;
  description: string;
  systemPrompt: string;
  promptSuggestions: string;
  providerId: string;
  modelId: string;
  temperature: string;
  topP: string;
  maxOutputTokens: string;
  maxToolCalls: string;
  toolChoice: AgentToolChoice;
  generationSettings: AgentGenerationSettings;
  responseFormat: AgentResponseFormat;
  memoryPolicy: AgentMemoryPolicy;
  guardrails: AgentGuardrails;
  approvalPolicy: AgentApprovalPolicy;
  sharingMode: Agent["sharingMode"];
  shareTargetEmail: string;
  originalSharingMode: Agent["sharingMode"];
  isGlobal: boolean;
  isRecommended: boolean;
  curationLabel: string;
};

export type ToolBindingState = Record<
  string,
  { enabled: boolean; requireApproval: boolean }
>;

/* ─── Constants ─────────────────────────────────────────────────────── */

export const defaultGenParams = {
  temperature: "0.7",
  topP: "1",
  maxOutputTokens: "30000",
  maxToolCalls: "6",
};

export function createEmptyForm(): AgentForm {
  return {
    name: "",
    slug: "",
    description: "",
    systemPrompt: "",
    promptSuggestions: "",
    providerId: "",
    modelId: "",
    temperature: defaultGenParams.temperature,
    topP: defaultGenParams.topP,
    maxOutputTokens: defaultGenParams.maxOutputTokens,
    maxToolCalls: defaultGenParams.maxToolCalls,
    toolChoice: "auto",
    generationSettings: {
      topK: "",
      presencePenalty: "",
      frequencyPenalty: "",
      seed: "",
      maxRetries: "",
      stopSequences: "",
    },
    responseFormat: "text",
    memoryPolicy: { enabled: false, maxMessages: 50 },
    guardrails: { enabled: false, blockedTopics: [] },
    approvalPolicy: { requireApprovalForAllTools: false },
    sharingMode: "personal",
    shareTargetEmail: "",
    originalSharingMode: "personal",
    isGlobal: false,
    isRecommended: false,
    curationLabel: "none",
  };
}
