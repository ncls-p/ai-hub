import { type AgentToolPreset } from "@/modules/agent/onboarding-tools";
import {
  type DelegationBindingInput,
  type OrchestrationPolicy,
} from "@/modules/agent/orchestration-policy";
import type { AiHubToolApprovalPolicy } from "@/modules/tool/approval-policy";
import { type ToolBindingInput } from "@/modules/tool/use-cases";
import type { AgentAccessScope } from "./access-scope";
import type { ReasoningPreset } from "./reasoning-presets";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  agentVersions,
  users,
} from "@/server/infrastructure/db/schema";
import { and, eq } from "drizzle-orm";

// ─── Types ─────────────────────────────────────────────────────────────

export type AgentRow = typeof agents.$inferSelect;
export type AgentVersionRow = typeof agentVersions.$inferSelect;
type AgentSharingMode = "personal" | "marketplace" | "specific_user";
type AgentKind = "assistant" | "orchestrator";
export type AgentCurationLabel =
  "recommended" | "organization_created" | "none";

export interface CreateAgentInput {
  workspaceId: string;
  userId: string;
  name: string;
  slug?: string;
  kind?: AgentKind;
  description?: string;
  logoUrl?: string | null;
  systemPrompt?: string;
  providerId?: string;
  modelId?: string;
  temperature?: string;
  topP?: string;
  maxOutputTokens?: number;
  maxToolCalls?: number;
  toolPreset?: AgentToolPreset;
  toolBindings?: ToolBindingInput[];
  knowledgeBindings?: string[];
  skillBindings?: string[];
  orchestrationPolicy?: OrchestrationPolicy;
  delegationBindings?: DelegationBindingInput[];
  sharingMode?: AgentSharingMode;
  shareTargetEmail?: string;
  accessScope?: AgentAccessScope;
  accessTeamId?: string;
  isGlobal?: boolean;
  isRecommended?: boolean;
  curationLabel?: AgentCurationLabel;
  canAdminCurate?: boolean;
  promptSuggestions?: string[];
}

export interface CloneAgentInput {
  agentId: string;
  workspaceId: string;
  userId: string;
  canAdminCurate?: boolean;
  name?: string;
  slug?: string;
}

type AgentToolChoice = "auto" | "required" | "none";
type AgentResponseFormat = "text" | "json_object";

interface AgentGenerationSettings {
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
  maxRetries?: number;
  stopSequences?: string[];
  reasoningPresets?: ReasoningPreset[];
}

interface AgentMemoryPolicy {
  enabled?: boolean;
  summaryThresholdTokens?: number;
  summaryMaxTokens?: number;
  contextWindowTokens?: number;
  maxMessages?: number;
  maxInputCharacters?: number;
}

interface AgentGuardrails {
  enabled?: boolean;
  blockedTopics?: string[];
}

type AgentApprovalPolicy = AiHubToolApprovalPolicy;

export interface UpdateAgentInput {
  agentId: string;
  workspaceId: string;
  userId: string;
  baseVersionId: string | null;
  name?: string;
  slug?: string;
  description?: string;
  logoUrl?: string | null;
  systemPrompt?: string;
  providerId?: string;
  modelId?: string;
  temperature?: string;
  topP?: string;
  maxOutputTokens?: number;
  maxToolCalls?: number;
  toolChoice?: AgentToolChoice;
  generationSettings?: AgentGenerationSettings;
  responseFormat?: AgentResponseFormat;
  memoryPolicy?: AgentMemoryPolicy;
  guardrails?: AgentGuardrails;
  approvalPolicy?: AgentApprovalPolicy;
  toolBindings?: ToolBindingInput[];
  knowledgeBindings?: string[];
  skillBindings?: string[];
  orchestrationPolicy?: OrchestrationPolicy;
  delegationBindings?: DelegationBindingInput[];
  sharingMode?: AgentSharingMode;
  shareTargetEmail?: string | null;
  accessScope?: AgentAccessScope;
  accessTeamId?: string | null;
  isGlobal?: boolean;
  isRecommended?: boolean;
  curationLabel?: AgentCurationLabel;
  canAdminCurate?: boolean;
  promptSuggestions?: string[];
}

export class AgentVersionConflictError extends Error {
  readonly code = "AGENT_VERSION_CONFLICT";

  constructor(readonly currentVersionId: string | null) {
    super("Agent configuration changed since it was loaded");
    this.name = "AgentVersionConflictError";
  }
}

export interface AgentDefaultPreferences {
  organizationDefaultAgentId: string | null;
  userDefaultAgentId: string | null;
  effectiveDefaultAgentId: string | null;
  hiddenAgentIds: string[];
}

async function resolveShareTargetUserId(
  email: string | null | undefined,
): Promise<string | null> {
  if (!email) return null;

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);

  if (!target) throw new Error("Share target user not found");
  return target.id;
}

export async function requireShareTargetUserId(
  email: string | null | undefined,
) {
  if (!email?.trim()) throw new Error("Share target user is required");
  return await resolveShareTargetUserId(email);
}

export function normalizeCurationLabel(
  label: AgentCurationLabel | undefined,
  isRecommended?: boolean,
) {
  if (label === "none") return null;
  if (label === "organization_created") return label;
  if (isRecommended || label === "recommended") return "recommended";
  return null;
}

export function slugifyAgentName(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "assistant"
  );
}

export function normalizePromptSuggestions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .slice(0, 12);
}

export function preparePromptSuggestions(input: string[] | undefined) {
  return normalizePromptSuggestions(input).map((suggestion) =>
    suggestion.slice(0, 240),
  );
}

export async function agentSlugExists(workspaceId: string, slug: string) {
  const [existing] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.slug, slug)))
    .limit(1);
  return Boolean(existing);
}
