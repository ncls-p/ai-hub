import {
  normalizeOrchestrationPolicy,
  orchestrationPolicyDefaults,
  type OrchestrationPolicy,
} from "@/modules/agent/orchestration-policy";
import { type AgentProgressModelHistoryKind } from "@/modules/agent/progress-model-history";
import { type AgentRunTrigger } from "@/modules/agent/run-use-cases";
import {
  agentRuntimePolicy,
  resolveAgentRuntimeLimits,
} from "@/modules/agent/runtime-policy";
import {
  getActiveVersion,
  getAgentVersionById,
  getVisibleAgentById,
  type AgentRow,
  type AgentVersionRow,
} from "@/modules/agent/use-cases";
import { type ModelMessage } from "ai";
import type { ChatAttachment } from "@/modules/chat/attachments";
import type { AgentVisualOutput } from "./runtime-executor.visual-outputs";
import type { ReasoningPreset } from "./reasoning-presets";

export const HEARTBEAT_MS = 10_000;
export const delegationFailureModelMessage =
  "The specialist could not complete the delegated task.";
export const finalSynthesisInstruction =
  "This is the final execution step. Do not call tools or delegate again. Return the best complete answer using only the information already gathered. If something is missing or failed, state that clearly instead of inventing a result.";
export const emptyResponseRecoveryInstruction =
  "Your previous turn ended without a final text response after tools completed. Return the best complete final answer now using only the conversation and tool results already present. Do not call or request another tool. Do not mention this recovery instruction.";
export const minimumDelegationWindowMs = 5_000;
export const maximumParentSynthesisReserveMs = 30_000;
export const activeRunControllers = new Map<string, AbortController>();

export class AgentExecutionError extends Error {
  readonly code: string;

  constructor(
    message: string,
    code: string,
    readonly runId?: string,
    readonly safeDetail?: string,
  ) {
    super(message);
    this.name = "AgentExecutionError";
    this.code = code;
  }
}

export class AgentRunStateError extends AgentExecutionError {
  constructor(
    runId: string,
    readonly status: string,
  ) {
    super(`Agent run is ${status}`, "AGENT_RUN_NOT_EXECUTABLE", runId);
    this.name = "AgentRunStateError";
  }
}

type ExecutionBudget = {
  policy: OrchestrationPolicy;
  rootRunId: string;
  deadlineAt: Date;
  controller: AbortController;
  tokensUsed: number;
  activeDelegations: number;
  usageBreakdown?: AgentExecutionUsage[];
};

export type AgentExecutionUsage = {
  modelId: string | null;
  inputTokens: number;
  outputTokens: number;
};

export type ResolvedAgent = { agent: AgentRow; version: AgentVersionRow };

export type AgentToolProgressContext = {
  id: string;
  toolCallId: string;
  toolName: string;
  agentName: string;
  agentId: string;
  runId: string;
  parentRunId: string | null;
  depth: number;
  modelHistoryKind?: AgentProgressModelHistoryKind;
};

export type AgentToolProgressEvent =
  | (AgentToolProgressContext & { type: "tool-start"; input: unknown })
  | (AgentToolProgressContext & {
      type: "tool-end";
      durationMs: number;
      output: unknown;
    })
  | (AgentToolProgressContext & {
      type: "tool-end";
      durationMs: number;
      error: string;
      errorCode?: string;
    });

type AgentToolProgressCallback = (
  event: AgentToolProgressEvent,
) => void | Promise<void>;

export type SuccessfulToolResult = { toolName: string; output: unknown };

export type InternalExecutionInput = {
  billingWorkspaceId?: string;
  resolved: ResolvedAgent;
  workspaceId: string;
  userId: string;
  prompt: string;
  messages?: ModelMessage[];
  systemContext?: string;
  availableAttachments?: ChatAttachment[];
  trigger: AgentRunTrigger;
  budget: ExecutionBudget;
  deadlineAt: Date;
  depth: number;
  ancestry: string[];
  parentRunId?: string;
  existingRunId?: string;
  conversationId?: string | null;
  messageId?: string | null;
  scheduledTaskId?: string | null;
  idempotencyKey?: string | null;
  dryRun?: boolean;
  onProgress?: AgentToolProgressCallback;
  reasoningEffort?: ReasoningPreset;
};

export type ExecuteAgentInput = {
  billingWorkspaceId?: string;
  workspaceId: string;
  userId: string;
  agentId: string;
  agentVersionId?: string;
  prompt: string;
  messages?: ModelMessage[];
  systemContext?: string;
  availableAttachments?: ChatAttachment[];
  trigger: Exclude<AgentRunTrigger, "delegation">;
  conversationId?: string | null;
  messageId?: string | null;
  scheduledTaskId?: string | null;
  idempotencyKey?: string | null;
  abortSignal?: AbortSignal;
  onProgress?: AgentToolProgressCallback;
  reasoningEffort?: ReasoningPreset;
};

export type AgentExecutionResult = {
  runId: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  totalTreeTokens: number;
  usageBreakdown?: AgentExecutionUsage[];
  reused: boolean;
  visualOutputs: AgentVisualOutput[];
};

export function executionPolicy(resolved: ResolvedAgent) {
  if (resolved.agent.kind === "orchestrator") {
    return normalizeOrchestrationPolicy(
      resolved.version.orchestrationPolicyJson,
    );
  }
  const limits = resolveAgentRuntimeLimits({
    maxOutputTokens: resolved.version.maxOutputTokens,
    maxToolCalls: resolved.version.maxToolCalls,
  });
  return {
    ...orchestrationPolicyDefaults,
    maxDepth: 1,
    maxDelegations: 1,
    maxParallel: 1,
    maxChildSteps: 1,
    maxTotalTokens:
      resolved.version.maxOutputTokens === 0
        ? 0
        : Math.min(100_000, Math.max(1_000, limits.maxOutputTokens)),
    timeoutMs: agentRuntimePolicy.chatTimeoutMs,
  } satisfies OrchestrationPolicy;
}

export async function resolveAgent(input: {
  agentId: string;
  agentVersionId?: string;
  workspaceId: string;
  userId: string;
}): Promise<ResolvedAgent> {
  const agent = await getVisibleAgentById(
    input.agentId,
    input.workspaceId,
    input.userId,
    false,
  );
  if (!agent) {
    throw new AgentExecutionError("Agent not found", "AGENT_NOT_FOUND");
  }
  const version = input.agentVersionId
    ? await getAgentVersionById(input.agentVersionId)
    : await getActiveVersion(input.agentId);
  if (!version || version.agentId !== agent.id) {
    throw new AgentExecutionError(
      "Agent version not found",
      "AGENT_VERSION_NOT_FOUND",
    );
  }
  return { agent, version };
}

export function nextSequence() {
  let sequence = 0;
  return () => {
    sequence += 1;
    return sequence;
  };
}

export function emitToolProgress(
  callback: AgentToolProgressCallback | undefined,
  event: AgentToolProgressEvent,
) {
  if (!callback) return;
  try {
    void Promise.resolve(callback(event)).catch(() => undefined);
  } catch {
    // Live progress is best-effort and must never fail the durable run.
  }
}
