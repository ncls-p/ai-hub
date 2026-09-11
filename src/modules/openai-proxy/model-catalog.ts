import { resourceAvailabilityCondition } from "@/modules/iam/resource-availability";
import { and, eq, isNull } from "drizzle-orm";

import { decryptValue } from "@/lib/crypto";
import { normalizeOpenAICompatibleApiRoute } from "@/lib/openai-compatible-api";
import { OpenAIProxyError } from "@/modules/openai-proxy/errors";
import { db } from "@/server/infrastructure/db";
import { aiModels, aiProviders } from "@/server/infrastructure/db/schema";
import { getAdapter } from "@/server/infrastructure/providers";
import type {
  ModelCapability,
  ProviderKind,
  ProviderRuntimeConfig,
} from "@/server/infrastructure/providers/adapter";

type CatalogRow = {
  model: typeof aiModels.$inferSelect;
  provider: typeof aiProviders.$inferSelect;
};

export type OpenAIProxyModel = {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  display_name: string;
  context_window: number | null;
  max_output_tokens: number | null;
  capabilities: Partial<ModelCapability>;
  maiah_model_id: string;
  maiah_provider_id: string;
  maiah_provider_name: string;
};

export type ResolvedProxyModel = {
  publicModel: OpenAIProxyModel;
  modelRecordId: string;
  providerId: string;
  upstreamModelId: string;
  runtimeConfig: ProviderRuntimeConfig;
  providerKind: ProviderKind;
  inputTokenCost: string | null;
  outputTokenCost: string | null;
  sustainabilityConfig: unknown;
  languageModel: ReturnType<ReturnType<typeof getAdapter>["createChatModel"]>;
};

function capabilitiesFrom(row: CatalogRow) {
  const capabilities = row.model.capabilitiesJson;
  return capabilities && typeof capabilities === "object"
    ? (capabilities as Partial<ModelCapability>)
    : {};
}

function isTextGenerationModel(row: CatalogRow) {
  const capabilities = capabilitiesFrom(row);
  return capabilities.text !== false && capabilities.embeddings !== true;
}

async function catalogRows(workspaceId: string): Promise<CatalogRow[]> {
  const rows = await db
    .select({ model: aiModels, provider: aiProviders })
    .from(aiModels)
    .innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
    .where(
      and(
        resourceAvailabilityCondition({
          type: "model",
          id: aiModels.id,
          workspaceId: aiProviders.workspaceId,
          activeWorkspaceId: workspaceId,
          providerId: aiProviders.id,
        }),
        eq(aiProviders.enabled, true),
        isNull(aiProviders.archivedAt),
        eq(aiModels.enabled, true),
      ),
    );
  return rows.filter(isTextGenerationModel);
}

function publicIds(rows: CatalogRow[]) {
  const occurrences = new Map<string, number>();
  for (const { model } of rows) {
    occurrences.set(model.modelId, (occurrences.get(model.modelId) ?? 0) + 1);
  }
  return new Map(
    rows.map((row) => [
      row.model.id,
      occurrences.get(row.model.modelId) === 1
        ? row.model.modelId
        : `${row.provider.id}/${row.model.modelId}`,
    ]),
  );
}

function toPublicModel(row: CatalogRow, id: string): OpenAIProxyModel {
  return {
    id,
    object: "model",
    created: Math.floor(row.model.createdAt.getTime() / 1000),
    owned_by: row.provider.name,
    display_name: row.model.displayName || row.model.modelId,
    context_window: row.model.contextWindow,
    max_output_tokens: row.model.maxOutputTokens,
    capabilities: capabilitiesFrom(row),
    maiah_model_id: row.model.id,
    maiah_provider_id: row.provider.id,
    maiah_provider_name: row.provider.name,
  };
}

export async function listOpenAIProxyModels(workspaceId: string) {
  const rows = await catalogRows(workspaceId);
  const ids = publicIds(rows);
  return rows
    .map((row) => toPublicModel(row, ids.get(row.model.id) ?? row.model.id))
    .sort((left, right) => left.id.localeCompare(right.id));
}

async function runtimeConfigFor(row: CatalogRow) {
  let apiKey: string | undefined;
  if (row.provider.encryptedApiKey) {
    apiKey = await decryptValue(row.provider.encryptedApiKey);
  }

  let headers: Record<string, string> | undefined;
  if (row.provider.encryptedHeadersJson) {
    headers = {};
    for (const [key, encryptedValue] of Object.entries(
      row.provider.encryptedHeadersJson as Record<string, string>,
    )) {
      headers[key] = await decryptValue(encryptedValue);
    }
  }

  return {
    kind: row.provider.kind as ProviderKind,
    name: row.provider.name,
    baseUrl: row.provider.baseUrl || undefined,
    authType: row.provider.authType,
    apiKey,
    headers,
    queryParams:
      (row.provider.queryParamsJson as Record<string, string>) || undefined,
    openaiCompatibleApiRoute: normalizeOpenAICompatibleApiRoute(
      row.provider.openaiCompatibleApiRoute,
    ),
  } satisfies ProviderRuntimeConfig;
}

export async function resolveOpenAIProxyModel(
  workspaceId: string,
  requestedModel: string,
): Promise<ResolvedProxyModel> {
  const rows = await catalogRows(workspaceId);
  const ids = publicIds(rows);
  const matches = rows.filter(
    (row) =>
      row.model.id === requestedModel ||
      ids.get(row.model.id) === requestedModel,
  );

  if (matches.length !== 1) {
    throw new OpenAIProxyError(
      `The model '${requestedModel}' does not exist or is not enabled in this workspace.`,
      404,
      "invalid_request_error",
      "model_not_found",
      "model",
    );
  }

  const row = matches[0];
  const runtimeConfig = await runtimeConfigFor(row);
  const adapter = getAdapter(row.provider.kind);
  const publicModel = toPublicModel(row, ids.get(row.model.id) ?? row.model.id);

  return {
    publicModel,
    modelRecordId: row.model.id,
    providerId: row.provider.id,
    upstreamModelId: row.model.modelId,
    runtimeConfig,
    providerKind: row.provider.kind,
    inputTokenCost: row.model.inputTokenCost,
    outputTokenCost: row.model.outputTokenCost,
    sustainabilityConfig: row.model.sustainabilityConfigJson,
    languageModel: adapter.createChatModel(runtimeConfig, row.model.modelId),
  };
}
