import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { generateText, tool } from "ai";
import { z } from "zod";

import { decryptValue, encryptValue } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { callRemoteMcpTool } from "@/modules/mcp/client";
import { getMcpServer } from "@/modules/mcp/use-cases";
import { registerAiSdkDevTools } from "@/server/infrastructure/ai-sdk/devtools";
import {
  getAdapter,
  type ProviderKind,
  type ProviderRuntimeConfig,
} from "@/server/infrastructure/providers";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
  aiModels,
  aiProviders,
  appSettings,
  customToolCredentialRefs,
  customToolSecretRequests,
  customTools,
  mcpServers,
  mcpTools,
} from "@/server/infrastructure/db/schema";

registerAiSdkDevTools();

const CUSTOM_TOOL_BUILDER_SETTING_KEY = "customToolBuilder";

const secretFieldSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9_.-]+$/),
  label: z.string().trim().min(1).max(120),
  type: z
    .enum(["secret", "text", "url", "email", "password"])
    .default("secret"),
  required: z.boolean().default(true),
  description: z.string().trim().max(500).optional(),
});

export type SecretField = z.infer<typeof secretFieldSchema>;

const builderConfigSchema = z.object({
  enabled: z.boolean().default(false),
  workspaceId: z.uuid().optional(),
  providerId: z.uuid().optional(),
  modelId: z.uuid().optional(),
  n8nMcpServerId: z.uuid().optional(),
  createWorkflowToolName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .default("n8n_create_workflow"),
  validateWorkflowToolName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .default("n8n_validate_workflow"),
  activateWorkflowToolName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .default("n8n_update_partial_workflow"),
  credentialToolName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .default("n8n_manage_credentials"),
  allowWorkflowActivation: z.boolean().default(false),
});

export type CustomToolBuilderConfig = z.infer<typeof builderConfigSchema>;

type BuilderMessage = {
  role: "user" | "assistant";
  content: string;
};

function defaultBuilderConfig(): CustomToolBuilderConfig {
  return {
    enabled: false,
    createWorkflowToolName: "n8n_create_workflow",
    validateWorkflowToolName: "n8n_validate_workflow",
    activateWorkflowToolName: "n8n_update_partial_workflow",
    credentialToolName: "n8n_manage_credentials",
    allowWorkflowActivation: false,
  };
}

function parseBuilderConfig(value: unknown): CustomToolBuilderConfig {
  const parsed = builderConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultBuilderConfig();
}

async function getCustomToolBuilderConfig() {
  const [row] = await db
    .select({ valueJson: appSettings.valueJson })
    .from(appSettings)
    .where(eq(appSettings.key, CUSTOM_TOOL_BUILDER_SETTING_KEY))
    .limit(1);
  return parseBuilderConfig(row?.valueJson);
}

export async function setCustomToolBuilderConfig(
  input: CustomToolBuilderConfig,
  updatedById: string,
) {
  const value = builderConfigSchema.parse(input);
  await db
    .insert(appSettings)
    .values({
      key: CUSTOM_TOOL_BUILDER_SETTING_KEY,
      valueJson: value,
      updatedById,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { valueJson: value, updatedById, updatedAt: new Date() },
    });
  return getCustomToolBuilderConfig();
}

export async function getCustomToolBuilderAdminState() {
  const [config, providers, servers] = await Promise.all([
    getCustomToolBuilderConfig(),
    db
      .select({
        id: aiProviders.id,
        workspaceId: aiProviders.workspaceId,
        name: aiProviders.name,
        kind: aiProviders.kind,
        enabled: aiProviders.enabled,
      })
      .from(aiProviders)
      .where(and(eq(aiProviders.enabled, true), isNull(aiProviders.archivedAt)))
      .orderBy(aiProviders.name),
    db
      .select({
        id: mcpServers.id,
        workspaceId: mcpServers.workspaceId,
        name: mcpServers.name,
        transport: mcpServers.transport,
        url: mcpServers.url,
        enabled: mcpServers.enabled,
      })
      .from(mcpServers)
      .where(and(eq(mcpServers.enabled, true), isNull(mcpServers.archivedAt)))
      .orderBy(mcpServers.name),
  ]);

  const models = await db
    .select({
      id: aiModels.id,
      providerId: aiModels.providerId,
      modelId: aiModels.modelId,
      displayName: aiModels.displayName,
      enabled: aiModels.enabled,
    })
    .from(aiModels)
    .where(eq(aiModels.enabled, true))
    .orderBy(aiModels.displayName, aiModels.modelId);

  return { config, providers, models, mcpServers: servers };
}

async function resolveRuntimeProvider(config: CustomToolBuilderConfig) {
  if (!config.providerId || !config.modelId) return null;
  const [provider] = await db
    .select()
    .from(aiProviders)
    .where(
      and(
        eq(aiProviders.id, config.providerId),
        eq(aiProviders.enabled, true),
        isNull(aiProviders.archivedAt),
      ),
    )
    .limit(1);
  if (!provider) return null;

  const [model] = await db
    .select()
    .from(aiModels)
    .where(
      and(
        eq(aiModels.id, config.modelId),
        eq(aiModels.providerId, provider.id),
        eq(aiModels.enabled, true),
      ),
    )
    .limit(1);
  if (!model) return null;

  let apiKey: string | undefined;
  if (provider.encryptedApiKey)
    apiKey = await decryptValue(provider.encryptedApiKey);

  let headers: Record<string, string> | undefined;
  if (provider.encryptedHeadersJson) {
    headers = {};
    for (const [key, value] of Object.entries(
      provider.encryptedHeadersJson as Record<string, string>,
    )) {
      headers[key] = await decryptValue(value);
    }
  }

  const runtimeConfig: ProviderRuntimeConfig = {
    kind: provider.kind as ProviderKind,
    name: provider.name,
    baseUrl: provider.baseUrl || undefined,
    authType: provider.authType,
    apiKey,
    headers,
    queryParams: provider.queryParamsJson as Record<string, string> | undefined,
  };

  return {
    runtimeConfig,
    kind: provider.kind as ProviderKind,
    modelId: model.modelId,
  };
}

function compactMcpResult(result: unknown) {
  if (typeof result !== "object" || result === null) return result;
  const record = result as Record<string, unknown>;
  if (record.structuredContent !== undefined) return record.structuredContent;
  if (record.content !== undefined) return record.content;
  return result;
}

function slugifyWorkflowPath(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || `custom-tool-${Date.now()}`
  );
}

function ensureExternallyTriggerableWorkflow(input: {
  name: string;
  nodes: Array<Record<string, unknown>>;
  connections: Record<string, unknown>;
}) {
  const externalTriggerTypes = new Set([
    "n8n-nodes-base.webhook",
    "n8n-nodes-base.formTrigger",
    "@n8n/n8n-nodes-langchain.chatTrigger",
  ]);
  const unsupportedTriggerTypes = new Set([
    "n8n-nodes-base.executeWorkflowTrigger",
  ]);
  const path = slugifyWorkflowPath(input.name);
  const nodes = input.nodes.map((node, index) => {
    const nodeType = typeof node.type === "string" ? node.type : "";
    if (!unsupportedTriggerTypes.has(nodeType)) return node;
    return {
      ...node,
      name: typeof node.name === "string" ? node.name : "Receive input",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2.1,
      position: Array.isArray(node.position)
        ? node.position
        : [240, 300 + index * 120],
      parameters: {
        path,
        httpMethod: "POST",
        responseMode: "lastNode",
        responseData: "firstEntryJson",
      },
    };
  });

  if (nodes.some((node) => externalTriggerTypes.has(String(node.type)))) {
    return { nodes, connections: input.connections };
  }

  const firstNode = nodes[0];
  const firstNodeName =
    typeof firstNode?.name === "string" ? firstNode.name : null;
  const webhookName = "Receive input";
  return {
    nodes: [
      {
        id: `webhook-${Date.now()}`,
        name: webhookName,
        type: "n8n-nodes-base.webhook",
        typeVersion: 2.1,
        position: [240, 300],
        parameters: {
          path,
          httpMethod: "POST",
          responseMode: "lastNode",
          responseData: "firstEntryJson",
        },
      },
      ...nodes,
    ],
    connections: firstNodeName
      ? {
          ...input.connections,
          [webhookName]: {
            main: [[{ node: firstNodeName, type: "main", index: 0 }]],
          },
        }
      : input.connections,
  };
}

function extractWorkflowId(result: unknown) {
  const raw =
    Array.isArray(result) && typeof result[0]?.text === "string"
      ? result[0].text
      : result;
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const data = record.data as Record<string, unknown> | undefined;
  const workflow = record.workflow as Record<string, unknown> | undefined;
  const id = data?.id ?? workflow?.id ?? record.id;
  return typeof id === "string" ? id : null;
}

type SecretPayload = {
  credentialRef: string;
  values: Record<string, string>;
};

function findSecretValue(payloads: SecretPayload[], requestedField?: string) {
  const candidates = requestedField
    ? [requestedField]
    : ["webhookUrl", "webhookUri", "webhook_url", "webhook", "url"];
  for (const payload of payloads) {
    for (const candidate of candidates) {
      const direct = payload.values[candidate];
      if (direct) return direct;
      const insensitiveKey = Object.keys(payload.values).find(
        (key) => key.toLowerCase() === candidate.toLowerCase(),
      );
      if (insensitiveKey && payload.values[insensitiveKey]) {
        return payload.values[insensitiveKey];
      }
    }
  }
  return undefined;
}

function replaceSecretPlaceholders(
  value: unknown,
  payloads: SecretPayload[],
): unknown {
  if (typeof value === "string") {
    let next = value.replace(
      /__SECRET:([0-9a-f-]{36}):([A-Za-z0-9_.-]+)__/gi,
      (match, credentialRef: string, fieldName: string) => {
        const payload = payloads.find(
          (item) => item.credentialRef === credentialRef,
        );
        return payload?.values[fieldName] ?? match;
      },
    );
    next = next.replace(
      /\{\{\s*secret\.([0-9a-f-]{36})\.([A-Za-z0-9_.-]+)\s*\}\}/gi,
      (match, credentialRef: string, fieldName: string) => {
        const payload = payloads.find(
          (item) => item.credentialRef === credentialRef,
        );
        return payload?.values[fieldName] ?? match;
      },
    );
    if (next.includes("$credentials.")) {
      return findSecretValue(payloads) ?? next;
    }
    return next;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceSecretPlaceholders(item, payloads));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        replaceSecretPlaceholders(nested, payloads),
      ]),
    );
  }
  return value;
}

async function loadSecretPayloads(
  workspaceId: string,
  userId: string,
  refs: Array<{ credentialRef: string }> | undefined,
) {
  const payloads: SecretPayload[] = [];
  for (const ref of refs ?? []) {
    const [row] = await db
      .select()
      .from(customToolCredentialRefs)
      .where(
        and(
          eq(customToolCredentialRefs.id, ref.credentialRef),
          eq(customToolCredentialRefs.workspaceId, workspaceId),
          eq(customToolCredentialRefs.userId, userId),
        ),
      )
      .limit(1);
    if (!row) continue;
    payloads.push({
      credentialRef: ref.credentialRef,
      values: JSON.parse(await decryptValue(row.encryptedPayload)) as Record<
        string,
        string
      >,
    });
  }
  return payloads;
}

async function resolveConfiguredMcpToolName(
  serverId: string,
  toolName: string,
) {
  const tools = await db
    .select({ name: mcpTools.name })
    .from(mcpTools)
    .where(eq(mcpTools.mcpServerId, serverId));
  const names = tools.map((item) => item.name);
  if (names.includes(toolName)) return toolName;
  const suffixMatch = names.find((name) => name.endsWith(`__${toolName}`));
  if (suffixMatch) return suffixMatch;
  const compactName = toolName.replace(/^n8n_/, "");
  const compactMatch = names.find(
    (name) =>
      name.endsWith(`__${compactName}`) ||
      name.endsWith(`__n8n_${compactName}`),
  );
  if (compactMatch) return compactMatch;
  return toolName;
}

async function callConfiguredN8nTool(input: {
  config: CustomToolBuilderConfig;
  workspaceId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}) {
  if (!input.config.n8nMcpServerId) {
    throw new Error("n8n MCP server is not configured");
  }
  const server = await getMcpServer(
    input.config.n8nMcpServerId,
    input.workspaceId,
  );
  if (!server)
    throw new Error(
      "Configured n8n MCP server was not found in this workspace",
    );
  if (!server.enabled) throw new Error("Configured n8n MCP server is disabled");
  if (!server.url)
    throw new Error(
      "Configured n8n MCP server must expose an SSE or streamable HTTP URL for web usage",
    );
  const toolName = await resolveConfiguredMcpToolName(
    server.id,
    input.toolName,
  );
  const result = await callRemoteMcpTool(server, toolName, input.arguments);
  return compactMcpResult(result);
}

function safeCredentialSummary(fields: SecretField[], credentialRefId: string) {
  return {
    credentialRef: credentialRefId,
    fields: fields.map((field) => ({
      name: field.name,
      label: field.label,
      type: field.type,
      received: true,
    })),
  };
}

function inferSecretRequestFromAssistantText(
  text: string,
): { title: string; description: string; fields: SecretField[] } | null {
  const normalized = text.toLowerCase();
  const saysSecretIsAlreadyHandled =
    normalized.includes("aucun secret") ||
    normalized.includes("secret n’a été exposé") ||
    normalized.includes("secret n'a été exposé") ||
    normalized.includes("secrets reçus") ||
    normalized.includes("connexion sécurisée reçue") ||
    normalized.includes("connexion sécurisée a bien été reçue");
  if (saysSecretIsAlreadyHandled) return null;

  const asksForSecureInput =
    /(il me manque|j'ai besoin|j’ai besoin|fournir|renseigner|ajoute|clique|ne la colle pas|webhook discord|url du webhook|connexion .*cible)/.test(
      normalized,
    ) &&
    /(secret|token|api key|clé api|webhook|credential|connexion sécurisée|gestionnaire sécurisé)/.test(
      normalized,
    );
  if (!asksForSecureInput) return null;

  if (normalized.includes("discord") && normalized.includes("webhook")) {
    return {
      title: "Connexion Discord",
      description:
        "Ajoute l’URL du webhook Discord. Elle sera chiffrée et masquée à l’assistant.",
      fields: [
        {
          name: "discord_webhook_url",
          label: "URL du webhook Discord",
          type: "secret",
          required: true,
          description: "Colle l’URL du webhook du salon cible.",
        },
      ],
    };
  }

  if (normalized.includes("webhook")) {
    return {
      title: "Connexion webhook",
      description:
        "Ajoute l’URL du webhook. Elle sera chiffrée et masquée à l’assistant.",
      fields: [
        {
          name: "webhook_url",
          label: "URL du webhook",
          type: "secret",
          required: true,
        },
      ],
    };
  }

  return {
    title: "Connexion sécurisée",
    description:
      "Ajoute le secret requis. Il sera chiffré et masqué à l’assistant.",
    fields: [
      {
        name: "secret_value",
        label: normalized.includes("token") ? "Token" : "Secret",
        type: "secret",
        required: true,
      },
    ],
  };
}

async function createSecretRequest(input: {
  workspaceId: string;
  userId: string;
  title: string;
  description?: string;
  fields: SecretField[];
  customToolId?: string;
}) {
  const fields = z.array(secretFieldSchema).min(1).max(12).parse(input.fields);
  const [request] = await db
    .insert(customToolSecretRequests)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      customToolId: input.customToolId ?? null,
      title: input.title,
      description: input.description ?? null,
      fieldsJson: fields,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    })
    .returning();

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "customTool.secretRequestCreated",
    resourceType: "custom_tool_secret_request",
    resourceId: request.id,
    outcome: "success",
    metadata: { fieldNames: fields.map((field) => field.name) },
  });

  return request;
}

export async function submitSecretRequest(input: {
  workspaceId: string;
  userId: string;
  requestId: string;
  values: Record<string, string>;
  provider?: string;
  label?: string;
}) {
  const [request] = await db
    .select()
    .from(customToolSecretRequests)
    .where(
      and(
        eq(customToolSecretRequests.id, input.requestId),
        eq(customToolSecretRequests.workspaceId, input.workspaceId),
        eq(customToolSecretRequests.userId, input.userId),
      ),
    )
    .limit(1);
  if (!request) throw new Error("Secret request not found");
  if (request.status !== "pending")
    throw new Error("Secret request is no longer pending");
  if (request.expiresAt.getTime() < Date.now())
    throw new Error("Secret request expired");

  const fields = z.array(secretFieldSchema).parse(request.fieldsJson);
  const sanitizedValues: Record<string, string> = {};
  for (const field of fields) {
    const value = input.values[field.name]?.trim() ?? "";
    if (field.required && !value)
      throw new Error(`Missing value for ${field.label}`);
    sanitizedValues[field.name] = value;
  }

  const [credentialRef] = await db
    .insert(customToolCredentialRefs)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      provider: input.provider || request.title,
      label: input.label || request.title,
      encryptedPayload: await encryptValue(JSON.stringify(sanitizedValues)),
      metadataJson: {
        fieldNames: fields.map((field) => field.name),
        secretRequestId: request.id,
      },
    })
    .returning();

  await db
    .update(customToolSecretRequests)
    .set({
      status: "submitted",
      credentialRefId: credentialRef.id,
      submittedAt: new Date(),
    })
    .where(eq(customToolSecretRequests.id, request.id));

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "customTool.secretSubmitted",
    resourceType: "custom_tool_secret_request",
    resourceId: request.id,
    outcome: "success",
    metadata: {
      credentialRefId: credentialRef.id,
      fieldNames: fields.map((field) => field.name),
    },
  });

  return safeCredentialSummary(fields, credentialRef.id);
}

export async function listCustomTools(workspaceId: string, userId?: string) {
  const conditions = [
    eq(customTools.workspaceId, workspaceId),
    isNull(customTools.archivedAt),
  ];
  if (userId) conditions.push(eq(customTools.createdById, userId));
  const tools = await db
    .select({
      id: customTools.id,
      name: customTools.name,
      description: customTools.description,
      status: customTools.status,
      n8nWorkflowId: customTools.n8nWorkflowId,
      n8nWorkflowUrl: customTools.n8nWorkflowUrl,
      metadataJson: customTools.metadataJson,
      createdAt: customTools.createdAt,
      updatedAt: customTools.updatedAt,
    })
    .from(customTools)
    .where(and(...conditions))
    .orderBy(desc(customTools.createdAt));
  return tools;
}

export async function deleteCustomTool(input: {
  workspaceId: string;
  userId: string;
  customToolId: string;
}) {
  const config = await getCustomToolBuilderConfig();
  const [customTool] = await db
    .select()
    .from(customTools)
    .where(
      and(
        eq(customTools.id, input.customToolId),
        eq(customTools.workspaceId, input.workspaceId),
        eq(customTools.createdById, input.userId),
        isNull(customTools.archivedAt),
      ),
    )
    .limit(1);
  if (!customTool) throw new Error("Custom tool not found");

  let workflowDeleted = false;
  let workflowDeleteError: string | undefined;
  if (customTool.n8nWorkflowId) {
    try {
      await callConfiguredN8nTool({
        config,
        workspaceId: input.workspaceId,
        toolName: "n8n_delete_workflow",
        arguments: { id: customTool.n8nWorkflowId },
      });
      workflowDeleted = true;
    } catch (error) {
      workflowDeleteError =
        error instanceof Error ? error.message : String(error);
    }
  }

  await db
    .update(customTools)
    .set({ archivedAt: new Date(), updatedAt: new Date(), status: "disabled" })
    .where(eq(customTools.id, customTool.id));

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "customTool.deleted",
    resourceType: "custom_tool",
    resourceId: customTool.id,
    outcome: workflowDeleteError ? "failed" : "success",
    metadata: {
      workflowId: customTool.n8nWorkflowId,
      workflowDeleted,
      workflowDeleteError,
    },
  });

  return { deleted: true, workflowDeleted, workflowDeleteError };
}

export async function executeCustomToolWorkflow(input: {
  workspaceId: string;
  userId: string;
  customToolId: string;
  toolInput: unknown;
}) {
  const config = await getCustomToolBuilderConfig();
  const [customTool] = await db
    .select()
    .from(customTools)
    .where(
      and(
        eq(customTools.id, input.customToolId),
        eq(customTools.workspaceId, input.workspaceId),
        eq(customTools.createdById, input.userId),
        isNull(customTools.archivedAt),
      ),
    )
    .limit(1);
  if (!customTool) throw new Error("Custom tool not found");
  if (!customTool.n8nWorkflowId) {
    throw new Error("Custom tool is not linked to a workflow yet");
  }

  return callConfiguredN8nTool({
    config,
    workspaceId: input.workspaceId,
    toolName: "n8n_test_workflow",
    arguments: {
      workflowId: customTool.n8nWorkflowId,
      data:
        input.toolInput && typeof input.toolInput === "object"
          ? (input.toolInput as Record<string, unknown>)
          : {},
      timeout: 120000,
    },
  });
}

export async function runCustomToolBuilder(input: {
  workspaceId: string;
  userId: string;
  messages: BuilderMessage[];
  credentialRefs?: Array<{ requestId: string; credentialRef: string }>;
}) {
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
  const model = adapter.createChatModel(
    provider.runtimeConfig,
    provider.modelId,
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

  const result = await generateText({
    model,
    system,
    messages: input.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    stopWhen: () => false,
    tools: {
      update_workflow_preview: tool({
        description:
          "Update the user-facing visual preview of the automation flow. Use plain-language labels that a non-technical user can understand.",
        inputSchema: z.object({
          title: z.string().min(1).max(160),
          summary: z.string().min(1).max(600),
          status: z.enum(["draft", "needs_secrets", "ready", "created"]),
          steps: z
            .array(
              z.object({
                label: z.string().min(1).max(80),
                description: z.string().min(1).max(240),
                kind: z.string().max(40).optional(),
              }),
            )
            .min(1)
            .max(8),
          inputs: z.array(z.string().min(1).max(80)).max(8).optional(),
          outputs: z.array(z.string().min(1).max(80)).max(8).optional(),
        }),
        execute: async (preview) => {
          workflowPreviews.push(preview);
          progressEvents.push({ label: "Schéma mis à jour", status: "done" });
          return { status: "preview_updated", stepCount: preview.steps.length };
        },
      }),
      request_user_secrets: tool({
        description:
          "Open a secure frontend modal to collect secrets or credentials. The LLM never receives submitted secret values.",
        inputSchema: z.object({
          title: z.string().min(1).max(255),
          description: z.string().max(800).optional(),
          fields: z.array(secretFieldSchema).min(1).max(12),
        }),
        execute: async ({ title, description, fields }) => {
          const request = await createSecretRequest({
            workspaceId: input.workspaceId,
            userId: input.userId,
            title,
            description,
            fields,
          });
          secretRequests.push({
            id: request.id,
            title: request.title,
            description: request.description,
            fields,
            expiresAt: request.expiresAt,
          });
          progressEvents.push({
            label: "Connexion sécurisée demandée",
            status: "pending",
          });
          return {
            status: "pending_user_input",
            secretRequestId: request.id,
            message:
              "The app displayed a secure button in chat. Continue only after the user opens it, submits the modal, and a credentialRef is provided.",
          };
        },
      }),
      create_n8n_workflow: tool({
        description:
          "Create the backend workflow. The backend will force it to be externally triggerable for custom tool execution. Use credentialRef placeholders only; never include raw secret values.",
        inputSchema: z.object({
          name: z.string().min(1).max(255),
          nodes: z.array(z.record(z.string(), z.unknown())).min(1),
          connections: z.record(z.string(), z.unknown()).default({}),
          settings: z.record(z.string(), z.unknown()).optional(),
        }),
        execute: async ({ name, nodes, connections, settings }) => {
          const secretPayloads = await loadSecretPayloads(
            input.workspaceId,
            input.userId,
            input.credentialRefs,
          );
          const hydratedNodes = replaceSecretPlaceholders(
            nodes,
            secretPayloads,
          ) as Array<Record<string, unknown>>;
          const hydratedConnections = replaceSecretPlaceholders(
            connections,
            secretPayloads,
          ) as Record<string, unknown>;
          const triggerable = ensureExternallyTriggerableWorkflow({
            name,
            nodes: hydratedNodes,
            connections: hydratedConnections,
          });
          progressEvents.push({
            label: "Création du workflow",
            status: "pending",
          });
          const workflow = await callConfiguredN8nTool({
            config,
            workspaceId: input.workspaceId,
            toolName: config.createWorkflowToolName,
            arguments: {
              name,
              nodes: triggerable.nodes,
              connections: triggerable.connections,
              settings,
            },
          });
          const workflowId = extractWorkflowId(workflow);
          if (workflowId && config.allowWorkflowActivation) {
            await callConfiguredN8nTool({
              config,
              workspaceId: input.workspaceId,
              toolName: config.activateWorkflowToolName,
              arguments: {
                id: workflowId,
                operations: [{ type: "activateWorkflow" }],
              },
            });
          }
          createdWorkflows.push(workflow);
          progressEvents.push({ label: "Workflow créé", status: "done" });
          return { workflow, workflowId, externallyTriggerable: true };
        },
      }),
      validate_n8n_workflow: tool({
        description: "Validate a workflow through the configured n8n MCP.",
        inputSchema: z.object({ id: z.string().min(1) }),
        execute: async ({ id }) =>
          callConfiguredN8nTool({
            config,
            workspaceId: input.workspaceId,
            toolName: config.validateWorkflowToolName,
            arguments: { id },
          }),
      }),
      create_n8n_credential_from_ref: tool({
        description:
          "Create a credential in n8n from an opaque credentialRef. This backend-only tool decrypts the stored secret payload and sends it to n8n; the LLM never sees the raw values.",
        inputSchema: z.object({
          credentialRef: z.uuid(),
          credentialType: z.string().min(1).max(255),
          name: z.string().min(1).max(255),
        }),
        execute: async ({ credentialRef, credentialType, name }) => {
          const [ref] = await db
            .select()
            .from(customToolCredentialRefs)
            .where(
              and(
                eq(customToolCredentialRefs.id, credentialRef),
                eq(customToolCredentialRefs.workspaceId, input.workspaceId),
                eq(customToolCredentialRefs.userId, input.userId),
              ),
            )
            .limit(1);
          if (!ref) throw new Error("Credential ref not found");
          const data = JSON.parse(
            await decryptValue(ref.encryptedPayload),
          ) as Record<string, string>;
          const result = await callConfiguredN8nTool({
            config,
            workspaceId: input.workspaceId,
            toolName: config.credentialToolName,
            arguments: {
              action: "create",
              operation: "create",
              credentialType,
              type: credentialType,
              name,
              data,
            },
          });
          const n8nCredentialId =
            typeof result === "object" && result !== null && "id" in result
              ? String((result as { id: unknown }).id)
              : undefined;
          progressEvents.push({
            label: "Connexion transmise au workflow",
            status: "done",
          });
          if (n8nCredentialId) {
            await db
              .update(customToolCredentialRefs)
              .set({ n8nCredentialId })
              .where(eq(customToolCredentialRefs.id, ref.id));
          }
          return { credentialRef, n8nCredentialId, credentialType, name };
        },
      }),
      register_custom_tool: tool({
        description:
          "Register the created n8n workflow as a custom tool draft in AI Hub after it has been created or specified.",
        inputSchema: z.object({
          name: z.string().min(1).max(255),
          description: z.string().max(2000).optional(),
          n8nWorkflowId: z.string().min(1).max(255).optional(),
          n8nWorkflowUrl: z.string().url().optional(),
          inputSchema: z.record(z.string(), z.unknown()).optional(),
          outputSchema: z.record(z.string(), z.unknown()).optional(),
        }),
        execute: async ({
          name,
          description,
          n8nWorkflowId,
          n8nWorkflowUrl,
          inputSchema,
          outputSchema,
        }) => {
          const resolvedWorkflowId =
            n8nWorkflowId ??
            (createdWorkflows.length
              ? (extractWorkflowId(createdWorkflows.at(-1)) ?? undefined)
              : undefined);
          const latestPreview = workflowPreviews.at(-1);
          const [row] = await db
            .insert(customTools)
            .values({
              workspaceId: input.workspaceId,
              createdById: input.userId,
              name,
              description: description ?? null,
              n8nWorkflowId: resolvedWorkflowId ?? null,
              n8nWorkflowUrl: n8nWorkflowUrl ?? null,
              status:
                resolvedWorkflowId || n8nWorkflowUrl
                  ? "workflow_created"
                  : "draft",
              inputSchemaJson: inputSchema ?? null,
              outputSchemaJson: outputSchema ?? null,
              metadataJson: {
                source: "builder",
                workflowPreview: latestPreview,
              },
            })
            .returning({
              id: customTools.id,
              name: customTools.name,
              status: customTools.status,
            });
          registeredTools.push(row);
          progressEvents.push({ label: "Tool enregistré", status: "done" });
          return row;
        },
      }),
    },
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
