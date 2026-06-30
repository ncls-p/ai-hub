import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  aiProviders,
  aiModels,
  providerKindEnum,
  providerAuthTypeEnum,
} from "@/server/infrastructure/db/schema";
import { encryptValue, decryptValue } from "@/lib/crypto";
import { logHandledError } from "@/lib/logger";
import { getAdapter } from "@/server/infrastructure/providers";
import type {
  ProviderRuntimeConfig,
  ProviderHealth,
  ModelDescriptor,
} from "@/server/infrastructure/providers";
import { audit } from "@/server/domain/services/audit";
import { logger } from "@/lib/logger";

// ─── Provider CRUD ─────────────────────────────────────────────────────

type ProviderKind = (typeof providerKindEnum.enumValues)[number];
type ProviderAuthType = (typeof providerAuthTypeEnum.enumValues)[number];
type ProviderRow = typeof aiProviders.$inferSelect;

export function toSafeProvider(provider: ProviderRow) {
  return {
    id: provider.id,
    workspaceId: provider.workspaceId,
    kind: provider.kind,
    name: provider.name,
    baseUrl: provider.baseUrl,
    authType: provider.authType,
    queryParamsJson: provider.queryParamsJson,
    enabled: provider.enabled,
    healthStatus: provider.healthStatus,
    lastCheckedAt: provider.lastCheckedAt,
    createdById: provider.createdById,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
    archivedAt: provider.archivedAt,
    hasApiKey: Boolean(provider.encryptedApiKey),
    hasCustomHeaders: Boolean(provider.encryptedHeadersJson),
  };
}

export interface CreateProviderInput {
  workspaceId: string;
  userId: string;
  kind: ProviderKind;
  name: string;
  baseUrl?: string;
  authType: ProviderAuthType;
  apiKey?: string;
  headersJson?: Record<string, string>;
  queryParamsJson?: Record<string, string>;
}

export async function createProvider(input: CreateProviderInput) {
  const {
    workspaceId,
    userId,
    kind,
    name,
    baseUrl,
    authType,
    apiKey,
    headersJson,
    queryParamsJson,
  } = input;

  const encryptedApiKey = apiKey ? await encryptValue(apiKey) : null;

  let encryptedHeadersJson: Record<string, string> | null = null;
  if (headersJson && Object.keys(headersJson).length > 0) {
    encryptedHeadersJson = {};
    for (const [k, v] of Object.entries(headersJson)) {
      encryptedHeadersJson[k] = await encryptValue(v);
    }
  }

  const [provider] = await db
    .insert(aiProviders)
    .values({
      workspaceId,
      createdById: userId,
      kind,
      name,
      baseUrl: baseUrl || null,
      authType,
      encryptedApiKey,
      encryptedHeadersJson,
      queryParamsJson: queryParamsJson || null,
      enabled: true,
    })
    .returning();

  await audit.emit({
    workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: userId,
    action: "provider.created",
    resourceType: "provider",
    resourceId: provider.id,
    outcome: "success",
    metadata: { kind, name },
  });

  logger.info("Provider created", { providerId: provider.id, userId });
  return provider;
}

export interface UpdateProviderInput {
  providerId: string;
  workspaceId: string;
  userId: string;
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  headersJson?: Record<string, string>;
  queryParamsJson?: Record<string, string>;
  enabled?: boolean;
}

export async function updateProvider(input: UpdateProviderInput) {
  const {
    providerId,
    workspaceId,
    userId,
    name,
    baseUrl,
    apiKey,
    headersJson,
    queryParamsJson,
    enabled,
  } = input;

  const [existing] = await db
    .select()
    .from(aiProviders)
    .where(
      and(
        eq(aiProviders.id, providerId),
        eq(aiProviders.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error("Provider not found");
  }

  const updates: Record<string, unknown> = {};

  if (name !== undefined) updates.name = name;
  if (baseUrl !== undefined) updates.baseUrl = baseUrl || null;
  if (enabled !== undefined) updates.enabled = enabled;
  if (queryParamsJson !== undefined) {
    updates.queryParamsJson = queryParamsJson || null;
  }

  // Encrypt new API key if provided
  if (apiKey !== undefined && apiKey) {
    updates.encryptedApiKey = await encryptValue(apiKey);
  }

  // Encrypt new headers if provided
  if (headersJson !== undefined && Object.keys(headersJson).length > 0) {
    const encrypted: Record<string, string> = {};
    for (const [k, v] of Object.entries(headersJson)) {
      encrypted[k] = await encryptValue(v);
    }
    updates.encryptedHeadersJson = encrypted;
  }

  await db
    .update(aiProviders)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(aiProviders.id, providerId));

  await audit.emit({
    workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: userId,
    action: "provider.updated",
    resourceType: "provider",
    resourceId: providerId,
    outcome: "success",
    metadata: { name, hasNewKey: apiKey !== undefined },
  });

  logger.info("Provider updated", { providerId, userId });
}

export async function archiveProvider(
  providerId: string,
  workspaceId: string,
  userId: string,
) {
  const [existing] = await db
    .select()
    .from(aiProviders)
    .where(
      and(
        eq(aiProviders.id, providerId),
        eq(aiProviders.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error("Provider not found");
  }

  await db
    .update(aiProviders)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(aiProviders.id, providerId));

  await audit.emit({
    workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: userId,
    action: "provider.archived",
    resourceType: "provider",
    resourceId: providerId,
    outcome: "success",
  });

  logger.info("Provider archived", { providerId, userId });
}

export async function getProviderById(providerId: string, workspaceId: string) {
  const [provider] = await db
    .select()
    .from(aiProviders)
    .where(
      and(
        eq(aiProviders.id, providerId),
        eq(aiProviders.workspaceId, workspaceId),
        isNull(aiProviders.archivedAt),
      ),
    )
    .limit(1);

  return provider || null;
}

export async function listProviders(workspaceId: string) {
  return db
    .select()
    .from(aiProviders)
    .where(
      and(
        eq(aiProviders.workspaceId, workspaceId),
        isNull(aiProviders.archivedAt),
      ),
    )
    .orderBy(sql`${aiProviders.createdAt} DESC`);
}

// ─── Provider connection test ──────────────────────────────────────────

export async function testProviderConnection(
  providerId: string,
  workspaceId: string,
): Promise<ProviderHealth> {
  const [provider] = await db
    .select()
    .from(aiProviders)
    .where(
      and(
        eq(aiProviders.id, providerId),
        eq(aiProviders.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!provider) {
    throw new Error("Provider not found");
  }

  // Decrypt secrets for runtime config
  let apiKey: string | undefined;
  if (provider.encryptedApiKey) {
    apiKey = await decryptValue(provider.encryptedApiKey);
  }

  let headers: Record<string, string> | undefined;
  if (provider.encryptedHeadersJson) {
    headers = {};
    for (const [k, v] of Object.entries(
      provider.encryptedHeadersJson as Record<string, string>,
    )) {
      headers[k] = await decryptValue(v);
    }
  }

  const runtimeConfig: ProviderRuntimeConfig = {
    kind: provider.kind,
    name: provider.name,
    baseUrl: provider.baseUrl || undefined,
    authType: provider.authType,
    apiKey,
    headers,
    queryParams:
      (provider.queryParamsJson as Record<string, string>) || undefined,
  };

  const adapter = getAdapter(provider.kind);
  const health = await adapter.validateConnection(runtimeConfig);

  // Update health status in DB
  await db
    .update(aiProviders)
    .set({
      healthStatus: health.status,
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(aiProviders.id, providerId));

  return health;
}

// ─── Model CRUD ────────────────────────────────────────────────────────

export interface CreateModelInput {
  providerId: string;
  modelId: string;
  displayName?: string;
  logoUrl?: string | null;
  capabilitiesJson?: Record<string, boolean>;
  contextWindow?: number;
  maxOutputTokens?: number;
  inputTokenCost?: string;
  outputTokenCost?: string;
}

export async function createModel(providerId: string, input: CreateModelInput) {
  const {
    modelId,
    displayName,
    logoUrl,
    capabilitiesJson,
    contextWindow,
    maxOutputTokens,
    inputTokenCost,
    outputTokenCost,
  } = input;

  const [model] = await db
    .insert(aiModels)
    .values({
      providerId,
      modelId,
      displayName: displayName || modelId,
      logoUrl: logoUrl || null,
      capabilitiesJson: capabilitiesJson || null,
      contextWindow: contextWindow || null,
      maxOutputTokens: maxOutputTokens || null,
      inputTokenCost: inputTokenCost || null,
      outputTokenCost: outputTokenCost || null,
      enabled: true,
    })
    .returning();

  return model;
}

export interface UpdateModelInput {
  displayName?: string;
  logoUrl?: string | null;
  capabilitiesJson?: Record<string, boolean>;
  contextWindow?: number;
  maxOutputTokens?: number;
  inputTokenCost?: string;
  outputTokenCost?: string;
  enabled?: boolean;
}

type ModelUpdateRule = {
  key: keyof UpdateModelInput;
  column: string;
  normalize?: (value: unknown) => unknown;
};

const MODEL_UPDATE_RULES: ModelUpdateRule[] = [
  { key: "displayName", column: "displayName" },
  { key: "logoUrl", column: "logoUrl", normalize: (value) => value ?? null },
  {
    key: "capabilitiesJson",
    column: "capabilitiesJson",
    normalize: (value) => value || null,
  },
  {
    key: "contextWindow",
    column: "contextWindow",
    normalize: (value) => value || null,
  },
  {
    key: "maxOutputTokens",
    column: "maxOutputTokens",
    normalize: (value) => value || null,
  },
  {
    key: "inputTokenCost",
    column: "inputTokenCost",
    normalize: (value) => value || null,
  },
  {
    key: "outputTokenCost",
    column: "outputTokenCost",
    normalize: (value) => value || null,
  },
  { key: "enabled", column: "enabled" },
];

function buildModelUpdates(input: UpdateModelInput) {
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  for (const rule of MODEL_UPDATE_RULES) {
    const value = input[rule.key];
    if (value !== undefined) {
      updates[rule.column] = rule.normalize ? rule.normalize(value) : value;
    }
  }

  return updates;
}

export async function updateModel(modelId: string, input: UpdateModelInput) {
  try {
    await db
      .update(aiModels)
      .set(buildModelUpdates(input))
      .where(eq(aiModels.id, modelId));
  } catch (error) {
    logHandledError("Failed to update model", { modelId }, error as Error);
    throw error;
  }
}

export async function deleteModel(modelId: string) {
  await db.delete(aiModels).where(eq(aiModels.id, modelId));
}

export async function listModels(providerId: string) {
  return db
    .select()
    .from(aiModels)
    .where(eq(aiModels.providerId, providerId))
    .orderBy(sql`${aiModels.createdAt} DESC`);
}

export async function getModelById(modelId: string) {
  const [model] = await db
    .select()
    .from(aiModels)
    .where(eq(aiModels.id, modelId))
    .limit(1);

  return model || null;
}

// ─── Discover models from provider ─────────────────────────────────────

export async function discoverModels(
  providerId: string,
  workspaceId: string,
): Promise<ModelDescriptor[]> {
  const [provider] = await db
    .select()
    .from(aiProviders)
    .where(
      and(
        eq(aiProviders.id, providerId),
        eq(aiProviders.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!provider) {
    throw new Error("Provider not found");
  }

  // Decrypt secrets
  let apiKey: string | undefined;
  if (provider.encryptedApiKey) {
    apiKey = await decryptValue(provider.encryptedApiKey);
  }

  let headers: Record<string, string> | undefined;
  if (provider.encryptedHeadersJson) {
    headers = {};
    for (const [k, v] of Object.entries(
      provider.encryptedHeadersJson as Record<string, string>,
    )) {
      headers[k] = await decryptValue(v);
    }
  }

  const runtimeConfig: ProviderRuntimeConfig = {
    kind: provider.kind,
    name: provider.name,
    baseUrl: provider.baseUrl || undefined,
    authType: provider.authType,
    apiKey,
    headers,
    queryParams:
      (provider.queryParamsJson as Record<string, string>) || undefined,
  };

  const adapter = getAdapter(provider.kind);
  if (!adapter.listModels) {
    throw new Error(`Model discovery not supported for kind: ${provider.kind}`);
  }

  const models = await adapter.listModels(runtimeConfig);
  return models;
}
