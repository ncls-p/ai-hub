import { applyUsageLimits } from "@/modules/usage/limited-language-model";
import { stepCountIs, streamText } from "ai";
import { NextRequest, NextResponse } from "next/server";

import { logHandledWarning } from "@/lib/logger";
import {
  handleRoute,
  requireResourcePermissionAsync,
} from "@/lib/route-handler";
import { createRuntimeDeadline } from "@/modules/agent/runtime-policy";
import {
  getActiveVersion,
  getAgentById,
  getAgentDefaultPreferences,
  listAgents,
  resolveProviderForVersion,
} from "@/modules/agent/use-cases";
import {
  searchWebWithSearxng,
  webSearchInputSchema,
} from "@/modules/tool/builtin-tool-primitives";
import { workflowAgenticRequestSchema } from "@/modules/workflows/agentic";
import {
  appendWorkflowAgentMessage,
  consumeWorkflowAgentInputRequest,
  getWorkflowAgentHistory,
} from "@/modules/workflows/agentic-history";
import { getWorkflowAgentTodoList } from "@/modules/workflows/agentic-todo-list";
import { getConfiguredWorkflowBuilderAgentId } from "@/modules/workflows/builder-settings";
import { getWorkflowDetail } from "@/modules/workflows/use-cases";
import { getAdapter } from "@/server/infrastructure/providers";

import { workflowErrorResponse } from "../../route-support";
import { WorkflowAgenticState } from "./route.agentic-state";
import { paramsSchema } from "./route.params-schema";
import { createWorkflowAgentStream } from "./route.stream-response";
import { createWorkflowAgentSystemPrompt } from "./route.system-prompt";
import { createWorkflowAgentTools } from "./route.tools-validation";

type AvailableAgent = Awaited<ReturnType<typeof listAgents>>[number];

async function resolveBuilderAgent(input: {
  workspaceId: string;
  userId: string;
  availableAgents: AvailableAgent[];
  configuredBuilderAgentId: string | null;
}) {
  const { workspaceId, userId, availableAgents, configuredBuilderAgentId } =
    input;
  let agent = configuredBuilderAgentId
    ? await getAgentById(configuredBuilderAgentId, workspaceId)
    : null;
  let version = agent ? await getActiveVersion(agent.id) : null;
  let provider = version ? await resolveProviderForVersion(version) : null;
  if (configuredBuilderAgentId && !agent)
    return {
      error:
        "The workflow builder assistant configured by an administrator is unavailable",
    } as const;
  if (configuredBuilderAgentId && (!version || !provider?.modelId))
    return {
      error:
        "The workflow builder assistant configured by an administrator requires an active model",
    } as const;
  if (!agent) {
    const availableAgentIds = new Set(availableAgents.map(({ id }) => id));
    const preferences = await getAgentDefaultPreferences(
      workspaceId,
      userId,
      availableAgentIds,
    );
    const preferred = availableAgents.find(
      ({ id }) => id === preferences.effectiveDefaultAgentId,
    );
    const candidates = [
      ...(preferred ? [preferred] : []),
      ...availableAgents.filter(({ id }) => id !== preferred?.id),
    ];
    for (const candidate of candidates) {
      const candidateVersion = await getActiveVersion(candidate.id);
      if (!candidateVersion) continue;
      const candidateProvider =
        await resolveProviderForVersion(candidateVersion);
      if (!candidateProvider?.modelId) continue;
      agent = candidate;
      version = candidateVersion;
      provider = candidateProvider;
      break;
    }
  }
  if (!agent || !version || !provider?.modelId)
    return {
      error: "No ready assistant is available for agentic mode",
    } as const;
  return { agent, version, provider } as const;
}

async function performInitialResearch(workflowId: string, content: string) {
  try {
    const research = await searchWebWithSearxng(
      webSearchInputSchema.parse({ query: content.slice(0, 512), limit: 6 }),
    );
    return {
      research,
      error: research.ok
        ? null
        : (research.error ?? "No web search results were returned."),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logHandledWarning("Workflow builder web research failed", {
      workflowId,
      error: message,
    });
    return { research: null, error: message };
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsedBody = workflowAgenticRequestSchema.safeParse(
        await req.json(),
      );
      if (!parsedParams.success || !parsedBody.success)
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      const { workflowId } = parsedParams.data;
      const { workspaceId } = parsedBody.data;
      const forbidden = await requireResourcePermissionAsync(
        session.user.id,
        workspaceId,
        "workflows.update",
        "workflow",
        workflowId,
      );
      if (forbidden) return forbidden;

      const [
        workflow,
        availableAgents,
        configuredBuilderAgentId,
        history,
        currentTodoList,
      ] = await Promise.all([
        getWorkflowDetail(workflowId, workspaceId),
        listAgents(workspaceId, session.user.id, false),
        getConfiguredWorkflowBuilderAgentId(workspaceId),
        getWorkflowAgentHistory({
          workflowId,
          workspaceId,
          userId: session.user.id,
          limit: 40,
        }),
        getWorkflowAgentTodoList({
          workflowId,
          workspaceId,
          userId: session.user.id,
        }),
      ]);
      const builder = await resolveBuilderAgent({
        workspaceId,
        userId: session.user.id,
        availableAgents,
        configuredBuilderAgentId,
      });
      if ("error" in builder)
        return NextResponse.json({ error: builder.error }, { status: 400 });

      const turn = parsedBody.data.inputRequestId
        ? await consumeWorkflowAgentInputRequest({
            requestId: parsedBody.data.inputRequestId,
            workflowId,
            workspaceId,
            userId: session.user.id,
          })
        : {
            displayContent: parsedBody.data.message as string,
            modelContent: parsedBody.data.message as string,
          };
      await appendWorkflowAgentMessage({
        workflowId,
        workspaceId,
        userId: session.user.id,
        role: "user",
        content: turn.displayContent,
        modelContent: turn.modelContent,
      });
      const messages = [
        ...history.messages
          .slice(-18)
          .map(({ role, modelContent: content }) => ({ role, content })),
        { role: "user" as const, content: turn.modelContent },
      ];
      const { research, error: initialWebResearchError } =
        await performInitialResearch(workflowId, turn.modelContent);
      const availableAgentIds = new Set(availableAgents.map(({ id }) => id));
      const state = new WorkflowAgenticState(
        parsedBody.data.draft,
        workflowId,
        workflow.latestVersion,
        availableAgentIds,
      );
      const system = createWorkflowAgentSystemPrompt({
        draft: state.draft,
        availableAgents,
        currentTodoList,
        initialWebResearch: research,
        initialWebResearchOk: Boolean(research?.ok),
        initialWebResearchError,
      });
      const adapter = getAdapter(builder.provider.providerKind);
      const model = await applyUsageLimits(
        adapter.createChatModel(
          builder.provider.runtimeConfig,
          builder.provider.modelId,
        ),
        {
          userId: session.user.id,
          workspaceId,
          providerId: builder.provider.providerId,
          modelId: builder.provider.modelRecordId ?? null,
        },
      );
      const deadline = createRuntimeDeadline(0, req.signal);
      const result = streamText({
        model,
        system,
        messages,
        maxOutputTokens: Math.min(
          builder.version.maxOutputTokens ?? 4_000,
          4_000,
        ),
        temperature: builder.version.temperature
          ? Number.parseFloat(builder.version.temperature)
          : undefined,
        topP: builder.version.topP
          ? Number.parseFloat(builder.version.topP)
          : undefined,
        abortSignal: deadline.signal,
        stopWhen: stepCountIs(24),
        tools: createWorkflowAgentTools({
          state,
          workflowId,
          workspaceId,
          userId: session.user.id,
          latestVersion: workflow.latestVersion,
        }),
      });
      const stream = createWorkflowAgentStream({
        result,
        state,
        workflowId,
        workspaceId,
        userId: session.user.id,
        builderAgentName: builder.agent.name,
        initialWebResearchError,
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    },
    {
      logLabel: "Failed to edit workflow with agentic mode",
      expectedError: workflowErrorResponse,
    },
  );
}
