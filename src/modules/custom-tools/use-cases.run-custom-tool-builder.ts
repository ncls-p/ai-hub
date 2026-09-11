import { applyUsageLimits } from "@/modules/usage/limited-language-model";
import { generateText, stepCountIs } from "ai";
import { eq, sql } from "drizzle-orm";

import { logger } from "@/lib/logger";
import {
  agentRuntimePolicy,
  createRuntimeDeadline,
} from "@/modules/agent/runtime-policy";
import { db } from "@/server/infrastructure/db";
import { mcpTools } from "@/server/infrastructure/db/schema";
import { getAdapter } from "@/server/infrastructure/providers";
import {
  createSecretRequest,
  inferSecretRequestFromAssistantText,
} from "./use-cases.call-configured-n8n-tool";
import { createCustomToolBuilderTools } from "./use-cases.custom-tool-builder-tools";
import {
  BuilderMessage,
  SecretField,
  getCustomToolBuilderConfig,
  resolveRuntimeProvider,
} from "./use-cases.custom-tool-row";

export type CustomToolBuilderInput = {
  workspaceId: string;
  userId: string;
  messages: BuilderMessage[];
  credentialRefs?: Array<{ requestId: string; credentialRef: string }>;
  isGlobal?: boolean;
};

export async function runCustomToolBuilder(input: CustomToolBuilderInput) {
  const config = await getCustomToolBuilderConfig();
  if (!config.enabled) {
    throw new Error("Custom tool builder is disabled by an administrator");
  }
  if (config.workspaceId && config.workspaceId !== input.workspaceId) {
    throw new Error("Custom tool builder is configured for another workspace");
  }

  const provider = await resolveRuntimeProvider(config);
  if (!provider) throw new Error("Custom tool builder LLM is not configured");

  const adapter = getAdapter(provider.kind);
  const model = await applyUsageLimits(
    adapter.createChatModel(provider.runtimeConfig, provider.modelId),
    {
      userId: input.userId,
      workspaceId: input.workspaceId,
      providerId: config.providerId!,
      modelId: config.modelId ?? null,
    },
  );
  const secretRequests: Array<{
    id: string;
    title: string;
    description: string | null;
    fields: SecretField[];
    expiresAt: Date;
  }> = [];
  const createdWorkflows: unknown[] = [];
  const workflowPreviews: Array<{
    title: string;
    summary: string;
    steps: Array<{ label: string; description: string; kind?: string }>;
    inputs?: string[];
    outputs?: string[];
    status: "draft" | "needs_secrets" | "ready" | "created";
  }> = [];
  const registeredTools: Array<{ id: string; name: string; status: string }> =
    [];
  const progressEvents: Array<{ label: string; status: "done" | "pending" }> =
    [];
  let builderActionCount = 0;
  function reserveBuilderAction() {
    if (builderActionCount >= agentRuntimePolicy.customToolBuilderMaxActions) {
      throw new Error("Custom tool builder action limit reached");
    }
    builderActionCount += 1;
  }

  const n8nTools = await db
    .select({ name: mcpTools.name, description: mcpTools.description })
    .from(mcpTools)
    .where(
      config.n8nMcpServerId
        ? eq(mcpTools.mcpServerId, config.n8nMcpServerId)
        : sql`false`,
    );

  const system = [
    "You are a custom-tool builder assistant for an AI assistant platform.",
    "Your job is to help the user design an automation flow that can be exposed as a custom tool.",
    "Never mention n8n, MCP, implementation internals, node types, or vendor-specific workflow backend details in user-facing responses. Say automation, flow, steps, connection, or tool instead.",
    "Always keep the visual workflow preview up to date by calling update_workflow_preview whenever you propose, change, or create a flow.",
    "Security rule: never ask the user to paste secrets in chat. If credentials, API keys, OAuth tokens, passwords, webhook signing secrets, client secrets, private tokens, or webhook URLs are needed, call request_user_secrets with the exact fields in the same turn. Do not tell the user to use a secure manager; the request_user_secrets tool displays a chat button that opens the secure modal. Tell the user to click the secure button, not that a window already opened. The secret values are collected by the app and you will only receive opaque credential references later.",
    "When creating backend workflows, use credentialRef placeholders instead of raw secret values. Never output or request raw secret values.",
    "If a workflow node needs a secret value in a parameter such as a URL, put a backend placeholder in that parameter: __SECRET:<credentialRef>:<fieldName>__. Example for a submitted Discord webhook field named webhookUrl: __SECRET:<credentialRef>:webhookUrl__. Never use expressions like {{$credentials.webhookUrl}} for node URL parameters.",
    "All workflows for custom tools must be externally triggerable by the platform. Use a Webhook, Form, or Chat trigger. Never use Execute Workflow Trigger for a custom tool.",
    "Create a draft workflow only when you have enough non-secret requirements and required credential refs. Otherwise ask concise clarifying questions or request secrets through the tool.",
    "After a credentialRef is available, continue automatically. Do not stop after acknowledging the credential. Create the backend workflow, validate/activate it if possible, then call register_custom_tool before answering the user.",
    "You may also stop to ask concise clarification questions when the user's request is ambiguous. In that case, do not call creation tools yet.",
    "After creating a workflow, register it as a custom tool with a clear name, description, and JSON input schema.",
    `Configured n8n MCP tool names: create=${config.createWorkflowToolName}, validate=${config.validateWorkflowToolName}, activate=${config.activateWorkflowToolName}, credentials=${config.credentialToolName}.`,
    n8nTools.length
      ? `Discovered n8n MCP tools include: ${n8nTools.map((item) => item.name).join(", ")}.`
      : "No n8n MCP tools have been synced yet; use the configured tool names if needed.",
    input.credentialRefs?.length
      ? `Opaque credential refs already submitted for this turn: ${JSON.stringify(input.credentialRefs)}.`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const runtimeDeadline = createRuntimeDeadline(
    agentRuntimePolicy.customToolBuilderTimeoutMs,
  );
  const result = await generateText({
    model,
    system,
    messages: input.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    stopWhen: stepCountIs(agentRuntimePolicy.customToolBuilderMaxSteps),
    maxOutputTokens: agentRuntimePolicy.customToolBuilderMaxOutputTokens,
    abortSignal: runtimeDeadline.signal,
    tools: createCustomToolBuilderTools({
      input,
      config,
      reserveBuilderAction,
      secretRequests,
      createdWorkflows,
      workflowPreviews,
      registeredTools,
      progressEvents,
    }),
  });

  if (secretRequests.length === 0) {
    const inferredRequest = inferSecretRequestFromAssistantText(result.text);
    if (inferredRequest) {
      const request = await createSecretRequest({
        workspaceId: input.workspaceId,
        userId: input.userId,
        title: inferredRequest.title,
        description: inferredRequest.description,
        fields: inferredRequest.fields,
      });
      secretRequests.push({
        id: request.id,
        title: request.title,
        description: request.description,
        fields: inferredRequest.fields,
        expiresAt: request.expiresAt,
      });
    }
  }

  logger.info("Custom tool builder run completed", {
    workspaceId: input.workspaceId,
    userId: input.userId,
    secretRequestCount: secretRequests.length,
    createdWorkflowCount: createdWorkflows.length,
    registeredToolCount: registeredTools.length,
  });

  return {
    message: result.text,
    actionCount:
      secretRequests.length +
      createdWorkflows.length +
      workflowPreviews.length +
      registeredTools.length,
    secretRequests,
    createdWorkflows,
    workflowPreviews,
    registeredTools,
    progressEvents,
  };
}
