import {
  createAgentRun,
  readAgentRunPayload,
} from "@/modules/agent/run-use-cases";
import { runtimeDeadlineAt } from "@/modules/agent/runtime-policy";
import { authorization } from "@/server/domain/services/authorization";
import { executeResolvedAgent } from "./runtime-executor.execute-resolved-agent";
import {
  AgentExecutionError,
  AgentExecutionResult,
  AgentRunStateError,
  ExecuteAgentInput,
  activeRunControllers,
  executionPolicy,
  resolveAgent,
} from "./runtime-executor.heartbeat-ms";

export async function executeAgent(
  input: ExecuteAgentInput,
): Promise<AgentExecutionResult> {
  const permission = await authorization.checkPermission(
    { principalType: "user", principalId: input.userId },
    "agents.chat",
    "agent",
    input.agentId,
  );
  if (!permission.granted) {
    throw new AgentExecutionError(
      permission.reason ?? "Agent execution is not allowed",
      "AGENT_RUN_FORBIDDEN",
    );
  }
  const resolved = await resolveAgent(input);
  const policy = executionPolicy(resolved);
  const deadlineAt = runtimeDeadlineAt(policy.timeoutMs);
  const created = await createAgentRun({
    workspaceId: input.workspaceId,
    agentId: resolved.agent.id,
    agentVersionId: resolved.version.id,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    trigger: input.trigger,
    payload: { prompt: input.prompt },
    requestedTokens: policy.maxTotalTokens,
    deadlineAt,
    conversationId: input.conversationId,
    messageId: input.messageId,
    scheduledTaskId: input.scheduledTaskId,
    idempotencyKey: input.idempotencyKey,
  });
  if (created.reused) {
    if (created.run.status === "success") {
      const payload = await readAgentRunPayload(created.run.id);
      const text =
        payload?.output &&
        typeof payload.output === "object" &&
        "text" in payload.output
          ? String(payload.output.text)
          : "";
      return {
        runId: created.run.id,
        text,
        inputTokens: created.run.inputTokens ?? 0,
        outputTokens: created.run.outputTokens ?? 0,
        totalTreeTokens:
          (created.run.inputTokens ?? 0) + (created.run.outputTokens ?? 0),
        usageBreakdown: [
          {
            modelId: resolved.version.modelId,
            inputTokens: created.run.inputTokens ?? 0,
            outputTokens: created.run.outputTokens ?? 0,
          },
        ],
        reused: true,
        visualOutputs: [],
      };
    }
    throw new AgentRunStateError(created.run.id, created.run.status);
  }

  const effectivePolicy =
    policy.maxTotalTokens === 0
      ? { ...policy, maxTotalTokens: created.run.reservedTokens }
      : policy;

  const controller = new AbortController();
  if (input.abortSignal) {
    if (input.abortSignal.aborted) {
      controller.abort(input.abortSignal.reason);
    } else {
      input.abortSignal.addEventListener(
        "abort",
        () => controller.abort(input.abortSignal?.reason),
        { once: true },
      );
    }
  }
  return executeResolvedAgent({
    billingWorkspaceId: input.billingWorkspaceId,
    resolved,
    workspaceId: input.workspaceId,
    userId: input.userId,
    prompt: input.prompt,
    messages: input.messages,
    systemContext: input.systemContext,
    availableAttachments: input.availableAttachments,
    trigger: input.trigger,
    budget: {
      policy: effectivePolicy,
      rootRunId: created.run.id,
      deadlineAt,
      controller,
      tokensUsed: 0,
      activeDelegations: 0,
      usageBreakdown: [],
    },
    deadlineAt,
    depth: 0,
    ancestry: [resolved.agent.id],
    existingRunId: created.run.id,
    conversationId: input.conversationId,
    messageId: input.messageId,
    scheduledTaskId: input.scheduledTaskId,
    idempotencyKey: input.idempotencyKey,
    dryRun: input.trigger === "dry_run",
    onProgress: input.onProgress,
    reasoningEffort: input.reasoningEffort,
  });
}

export function abortActiveAgentRun(runId: string) {
  const controller = activeRunControllers.get(runId);
  if (!controller) return false;
  controller.abort("Agent run cancelled");
  return true;
}
