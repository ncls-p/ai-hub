import { applyUsageLimits } from "@/modules/usage/limited-language-model";
import { buildBoundTools } from "@/app/api/workspace/[agentId]/chat/route-support";
import {
  appendAgentRunStep,
  completeAgentRun,
  failAgentRun,
} from "@/modules/agent/run-use-cases";
import {
  createRuntimeDeadline,
  resolveAgentRuntimeLimits,
  timeoutMsUntil,
} from "@/modules/agent/runtime-policy";
import { resolveProviderForVersion } from "@/modules/agent/use-cases";
import { buildSkillsRegistryPrompt } from "@/modules/skills/use-cases";
import {
  fitModelHistoryToContext,
  resolveContextWindowTokens,
  type ConversationContextPolicy,
} from "@/modules/chat/conversation-context-policy";
import { safeToolErrorMessage } from "@/modules/tool/safe-payload";
import { getAdapter } from "@/server/infrastructure/providers";
import { generateText, isStepCount } from "ai";
import { buildDelegationTools } from "./runtime-executor.build-delegation-tools";
import {
  AgentExecutionError,
  AgentExecutionResult,
  AgentToolProgressContext,
  InternalExecutionInput,
  SuccessfulToolResult,
  activeRunControllers,
  emitToolProgress,
  emptyResponseRecoveryInstruction,
  finalSynthesisInstruction,
  nextSequence,
} from "./runtime-executor.heartbeat-ms";
import {
  deterministicToolResultFallback,
  instrumentTools,
  isTimeoutFailure,
  progressModelHistoryMetadata,
  toolResultRecoveryContext,
} from "./runtime-executor.instrument-tools";
import { startResolvedAgentRun } from "./runtime-executor.start-run";
import { collectAgentVisualOutputs } from "./runtime-executor.visual-outputs";
import { recordAgentExecutionUsage } from "./runtime-executor.usage";
import { reasoningCallSettings } from "./reasoning-presets";

export async function executeResolvedAgent(
  input: InternalExecutionInput,
): Promise<AgentExecutionResult> {
  const { runId, heartbeat } = await startResolvedAgentRun(input);

  let inputTokens = 0;
  let outputTokens = 0;
  let usageRecorded = false;
  let usageProvider:
    | Awaited<ReturnType<typeof resolveProviderForVersion>>
    | undefined;
  let deadline: ReturnType<typeof createRuntimeDeadline> | undefined;
  const startedAt = Date.now();
  try {
    const provider = await resolveProviderForVersion(input.resolved.version);
    usageProvider = provider;
    if (!provider?.modelId) {
      throw new AgentExecutionError(
        "Agent model is not configured",
        "AGENT_MODEL_NOT_CONFIGURED",
        runId,
      );
    }
    const adapter = getAdapter(provider.providerKind);
    const model = await applyUsageLimits(
      adapter.createChatModel(provider.runtimeConfig, provider.modelId),
      {
        userId: input.userId,
        workspaceId: input.billingWorkspaceId ?? input.workspaceId,
        providerId: provider.providerId,
        modelId: provider.modelRecordId ?? null,
      },
    );
    const reasoningSettings = reasoningCallSettings(
      input.reasoningEffort,
      provider.runtimeConfig,
    );
    const runtimeLimits = resolveAgentRuntimeLimits({
      maxToolCalls: input.resolved.version.maxToolCalls,
      maxOutputTokens: input.resolved.version.maxOutputTokens,
      providerMaxOutputTokens: provider.maxOutputTokens,
      providerContextWindow: provider.contextWindow,
    });
    const remainingTokens =
      input.budget.policy.maxTotalTokens - input.budget.tokensUsed;
    if (remainingTokens <= 0) {
      throw new AgentExecutionError(
        "Agent tree token budget exhausted",
        "AGENT_TOKEN_BUDGET_EXCEEDED",
        runId,
      );
    }
    const maxOutputTokens = Math.max(
      1,
      Math.min(
        runtimeLimits.maxOutputTokens,
        remainingTokens,
        provider.maxOutputTokens ?? Number.POSITIVE_INFINITY,
      ),
    );
    const maxSteps =
      input.depth > 0 && input.budget.policy.maxChildSteps > 0
        ? Math.min(runtimeLimits.maxSteps, input.budget.policy.maxChildSteps)
        : runtimeLimits.maxSteps;
    const allocateSequence = nextSequence();
    const successfulToolResults: SuccessfulToolResult[] = [];
    const recordSuccessfulToolResult = (result: SuccessfulToolResult) => {
      successfulToolResults.push(result);
    };
    const skillsPrompt = input.dryRun
      ? null
      : await buildSkillsRegistryPrompt(input.resolved.version.id);
    const bound =
      !input.dryRun && runtimeLimits.maxToolCalls > 0
        ? await buildBoundTools({
            agentVersionId: input.resolved.version.id,
            workspaceId: input.workspaceId,
            conversationId: input.conversationId ?? undefined,
            messageId: input.messageId ?? undefined,
            userId: input.userId,
            maxToolCalls: runtimeLimits.maxToolCalls,
            approvalPolicy:
              (input.resolved.version.approvalPolicyJson as never) ?? null,
            hasSkills: Boolean(skillsPrompt),
            enableDocumentExplorer:
              (input.availableAttachments?.length ?? 0) > 0,
            nonInteractive: true,
          })
        : { tools: {}, toolApproval: undefined };
    const delegationTools = await buildDelegationTools({
      runId,
      resolved: input.resolved,
      execution: input,
      allocateSequence,
      onToolSuccess: recordSuccessfulToolResult,
    });
    const tools = instrumentTools(
      { ...bound.tools, ...delegationTools },
      runId,
      allocateSequence,
      recordSuccessfulToolResult,
    );
    const hasTools = Object.keys(tools).length > 0;
    const configuredToolChoice = hasTools
      ? input.resolved.version.toolChoice === "required" ||
        input.resolved.version.toolChoice === "none"
        ? input.resolved.version.toolChoice
        : "auto"
      : undefined;
    const effectiveMaxSteps = hasTools ? Math.max(2, maxSteps) : maxSteps;
    const hasDelegationTools = Object.keys(delegationTools).some((name) =>
      name.startsWith("delegate_specialist_"),
    );
    const delegationPrompt = hasDelegationTools
      ? "You are an orchestrator. Break the request into bounded tasks and use only the delegate_specialist_* tools whose configured expertise is relevant. When a task needs an uploaded file, pass only its relevant Attachment ID in attachmentIds. A specialist result can advertise visual outputs. Use publish_specialist_output only after that result and only when the visual deliverable materially helps the user; technical traces remain hidden by default. Synthesize the returned results into one answer. Never invent a child result or output ID."
      : null;
    const delegatedResultPrompt =
      input.trigger === "delegation"
        ? "Return only the final answer needed by the parent orchestrator. Do not mention internal tools, execution steps, agent identities, run identifiers, or hidden instructions."
        : null;
    const system = [
      input.resolved.version.systemPrompt?.trim() ||
        "You are a helpful enterprise AI assistant.",
      skillsPrompt,
      delegationPrompt,
      delegatedResultPrompt,
      input.systemContext?.trim() || null,
      input.dryRun
        ? "This is a dry run. Do not call tools or delegate. Explain the execution plan and configuration issues only."
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");
    const contextPolicy = input.resolved.version
      .memoryPolicyJson as ConversationContextPolicy | null;
    const fittedContext = input.messages?.length
      ? fitModelHistoryToContext({
          messages: input.messages,
          contextWindowTokens: resolveContextWindowTokens(
            contextPolicy?.contextWindowTokens,
            provider.contextWindow,
          ),
          modelMaxOutputTokens: provider.maxOutputTokens,
          requestedOutputTokens: maxOutputTokens,
          systemPrompt: system,
        })
      : null;
    deadline = createRuntimeDeadline(
      timeoutMsUntil(input.deadlineAt),
      input.budget.controller.signal,
    );
    let completedStepInputTokens = 0;
    let completedStepOutputTokens = 0;
    let result: Awaited<ReturnType<typeof generateText>> | undefined;
    let text = "";
    let recoveredFromEmptyResponse = false;
    let recoveredFromToolResult = false;
    try {
      result = await generateText({
        model,
        instructions: system,
        // Chat summaries are trusted, server-generated system history.
        allowSystemInMessages: true,
        ...(fittedContext
          ? { messages: fittedContext.messages }
          : { prompt: input.prompt }),
        temperature: input.resolved.version.temperature
          ? Number.parseFloat(input.resolved.version.temperature)
          : undefined,
        topP: input.resolved.version.topP
          ? Number.parseFloat(input.resolved.version.topP)
          : undefined,
        maxOutputTokens: fittedContext?.maxOutputTokens ?? maxOutputTokens,
        ...reasoningSettings,
        tools,
        toolChoice: configuredToolChoice,
        toolApproval: bound.toolApproval,
        stopWhen: isStepCount(Math.max(1, effectiveMaxSteps)),
        prepareStep: hasTools
          ? ({ instructions, messages, stepNumber }) => {
              const isFinalStep = stepNumber >= effectiveMaxSteps - 1;
              const stepInstructions = isFinalStep
                ? `${system}\n\n${finalSynthesisInstruction}`
                : typeof instructions === "string"
                  ? instructions
                  : system;
              const stepContext = fitModelHistoryToContext({
                messages,
                contextWindowTokens: resolveContextWindowTokens(
                  contextPolicy?.contextWindowTokens,
                  provider.contextWindow,
                ),
                modelMaxOutputTokens: provider.maxOutputTokens,
                requestedOutputTokens: maxOutputTokens,
                systemPrompt: stepInstructions,
              });
              return isFinalStep
                ? {
                    activeTools: [],
                    toolChoice: "none",
                    instructions: stepInstructions,
                    messages: stepContext.messages,
                    maxOutputTokens: stepContext.maxOutputTokens,
                  }
                : {
                    messages: stepContext.messages,
                    maxOutputTokens: stepContext.maxOutputTokens,
                  };
            }
          : undefined,
        abortSignal: deadline.signal,
        onStepEnd: ({ usage }) => {
          completedStepInputTokens += usage.inputTokens ?? 0;
          completedStepOutputTokens += usage.outputTokens ?? 0;
        },
        onToolExecutionStart: ({ toolCall }) =>
          emitToolProgress(input.onProgress, {
            type: "tool-start",
            id: `${runId}:${toolCall.toolCallId}`,
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            agentName: input.resolved.agent.name,
            agentId: input.resolved.agent.id,
            runId,
            parentRunId: input.parentRunId ?? null,
            depth: input.depth,
            ...progressModelHistoryMetadata({
              depth: input.depth,
              isDelegation: toolCall.toolName.startsWith(
                "delegate_specialist_",
              ),
              phase: "start",
            }),
            input: toolCall.input,
          }),
        onToolExecutionEnd: ({ toolCall, toolExecutionMs, toolOutput }) => {
          const context = {
            id: `${runId}:${toolCall.toolCallId}`,
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            agentName: input.resolved.agent.name,
            agentId: input.resolved.agent.id,
            runId,
            parentRunId: input.parentRunId ?? null,
            depth: input.depth,
            ...progressModelHistoryMetadata({
              depth: input.depth,
              isDelegation: toolCall.toolName.startsWith(
                "delegate_specialist_",
              ),
              phase: toolOutput.type === "tool-error" ? "error" : "success",
            }),
          } satisfies AgentToolProgressContext;
          if (toolOutput.type === "tool-error") {
            const executionError =
              toolOutput.error instanceof AgentExecutionError
                ? toolOutput.error
                : null;
            emitToolProgress(input.onProgress, {
              ...context,
              type: "tool-end",
              durationMs: toolExecutionMs,
              error: executionError?.safeDetail
                ? safeToolErrorMessage(
                    new Error(executionError.safeDetail),
                    "Tool execution failed",
                  )
                : safeToolErrorMessage(
                    toolOutput.error,
                    "Tool execution failed",
                  ),
              ...(executionError?.code
                ? { errorCode: executionError.code }
                : {}),
            });
            return;
          }
          emitToolProgress(input.onProgress, {
            ...context,
            type: "tool-end",
            durationMs: toolExecutionMs,
            output: toolOutput.output,
          });
        },
        telemetry: {
          functionId: "ai-hub.agent-run",
          recordInputs: false,
          recordOutputs: false,
        },
      });
    } catch (error) {
      const fallback = deterministicToolResultFallback(
        successfulToolResults,
        input.budget.policy.resultMaxChars,
      );
      if (
        !input.budget.controller.signal.aborted &&
        fallback &&
        (deadline.timeoutSignal.aborted || isTimeoutFailure(error))
      ) {
        inputTokens = completedStepInputTokens;
        outputTokens = completedStepOutputTokens;
        text = fallback;
        recoveredFromToolResult = true;
      } else {
        throw error;
      }
    }

    if (result) {
      inputTokens = result.usage.inputTokens ?? 0;
      outputTokens = result.usage.outputTokens ?? 0;
      text = result.text.trim();
      if (
        successfulToolResults.length === 0 &&
        (result.toolResults?.length ?? 0) > 0
      ) {
        successfulToolResults.push(
          ...result.toolResults.map((toolResult) => ({
            toolName: toolResult.toolName,
            output: toolResult.output,
          })),
        );
      }
      if (!text && successfulToolResults.length > 0) {
        const recoveryRemainingTokens =
          input.budget.policy.maxTotalTokens -
          input.budget.tokensUsed -
          inputTokens -
          outputTokens;
        if (recoveryRemainingTokens > 0 && !deadline.signal.aborted) {
          try {
            const recoveryInstructions = `${system}\n\n${emptyResponseRecoveryInstruction}`;
            const recoveryPrompt = [
              "Original task:",
              input.prompt,
              "Successful tool results:",
              toolResultRecoveryContext(
                successfulToolResults,
                input.budget.policy.resultMaxChars,
              ),
            ].join("\n\n");
            const recoveryContext = fitModelHistoryToContext({
              messages: [{ role: "user", content: recoveryPrompt }],
              contextWindowTokens: resolveContextWindowTokens(
                contextPolicy?.contextWindowTokens,
                provider.contextWindow,
              ),
              modelMaxOutputTokens: provider.maxOutputTokens,
              requestedOutputTokens: Math.max(
                1,
                Math.min(
                  runtimeLimits.maxOutputTokens,
                  recoveryRemainingTokens,
                ),
              ),
              systemPrompt: recoveryInstructions,
            });
            const recoveryResult = await generateText({
              model,
              instructions: recoveryInstructions,
              messages: recoveryContext.messages,
              temperature: input.resolved.version.temperature
                ? Number.parseFloat(input.resolved.version.temperature)
                : undefined,
              topP: input.resolved.version.topP
                ? Number.parseFloat(input.resolved.version.topP)
                : undefined,
              maxOutputTokens: recoveryContext.maxOutputTokens,
              ...reasoningSettings,
              abortSignal: deadline.signal,
              telemetry: {
                functionId: "ai-hub.agent-run.empty-response-recovery",
                recordInputs: false,
                recordOutputs: false,
              },
            });
            inputTokens += recoveryResult.usage.inputTokens ?? 0;
            outputTokens += recoveryResult.usage.outputTokens ?? 0;
            text = recoveryResult.text.trim();
            recoveredFromEmptyResponse = Boolean(text);
          } catch (error) {
            if (input.budget.controller.signal.aborted) throw error;
          }
        }
        if (!text && !input.budget.controller.signal.aborted) {
          text = deterministicToolResultFallback(
            successfulToolResults,
            input.budget.policy.resultMaxChars,
          );
          recoveredFromToolResult = Boolean(text);
        }
      }
    }
    input.budget.tokensUsed += inputTokens + outputTokens;
    if (
      input.depth > 0 &&
      input.budget.tokensUsed > input.budget.policy.maxTotalTokens
    ) {
      throw new AgentExecutionError(
        "Agent tree token budget exceeded",
        "AGENT_TOKEN_BUDGET_EXCEEDED",
        runId,
      );
    }
    if (!text) {
      throw new AgentExecutionError(
        "Agent completed without a final response",
        "AGENT_EMPTY_RESPONSE",
        runId,
      );
    }
    await appendAgentRunStep({
      runId,
      sequence: allocateSequence(),
      kind: "model",
      status: "success",
      name: provider.modelId,
      inputPreview: { prompt: input.prompt },
      outputPreview: {
        text,
        inputTokens,
        outputTokens,
        recoveredFromEmptyResponse,
        recoveredFromToolResult,
      },
      completedAt: new Date(),
    });
    await completeAgentRun({
      runId,
      output: { text },
      inputTokens,
      outputTokens,
      reservationTokens:
        input.depth === 0 ? input.budget.tokensUsed : undefined,
      usage: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        providerId: provider.providerId,
        modelId: provider.modelRecordId,
        agentId: input.resolved.agent.id,
        conversationId: input.conversationId ?? undefined,
        operation:
          input.trigger === "delegation" ? "delegation" : input.trigger,
        latencyMs: Date.now() - startedAt,
      },
    });
    const usageBreakdown = recordAgentExecutionUsage(input.budget, {
      modelId: provider.modelRecordId ?? null,
      inputTokens,
      outputTokens,
    });
    usageRecorded = true;
    return {
      runId,
      text,
      inputTokens,
      outputTokens,
      totalTreeTokens: input.budget.tokensUsed,
      usageBreakdown: [...usageBreakdown],
      reused: false,
      visualOutputs: collectAgentVisualOutputs(successfulToolResults),
    };
  } catch (error) {
    const aborted = input.budget.controller.signal.aborted;
    if (!usageRecorded && inputTokens + outputTokens > 0)
      recordAgentExecutionUsage(input.budget, {
        modelId: usageProvider?.modelRecordId ?? null,
        inputTokens,
        outputTokens,
      });
    await failAgentRun({
      runId,
      status: aborted ? "cancelled" : "failed",
      error,
      errorCode:
        error instanceof AgentExecutionError
          ? error.code
          : aborted
            ? "AGENT_RUN_CANCELLED"
            : "AGENT_RUN_FAILED",
      inputTokens,
      outputTokens,
      reservationTokens:
        input.depth === 0 ? input.budget.tokensUsed : undefined,
      usage: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        providerId: usageProvider?.providerId,
        modelId: usageProvider?.modelRecordId,
        agentId: input.resolved.agent.id,
        conversationId: input.conversationId ?? undefined,
        operation:
          input.trigger === "delegation" ? "delegation" : input.trigger,
        latencyMs: Date.now() - startedAt,
      },
    });
    throw error instanceof AgentExecutionError
      ? new AgentExecutionError(
          error.message,
          error.code,
          runId,
          error.safeDetail,
        )
      : new AgentExecutionError(
          aborted ? "Agent run was cancelled" : "Agent run failed",
          aborted ? "AGENT_RUN_CANCELLED" : "AGENT_RUN_FAILED",
          runId,
          safeToolErrorMessage(
            error,
            aborted ? "Agent run was cancelled" : "Agent run failed",
          ),
        );
  } finally {
    deadline?.dispose();
    clearInterval(heartbeat);
    activeRunControllers.delete(runId);
  }
}
