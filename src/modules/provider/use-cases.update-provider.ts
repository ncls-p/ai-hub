import { resourceAvailabilityCondition } from "@/modules/iam/resource-availability";
import { encryptValue } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import { aiProviders } from "@/server/infrastructure/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { UpdateProviderInput } from "./use-cases.to-safe-provider";

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
    openaiCompatibleApiRoute,
    openaiCompatibilityProfile,
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
  if (openaiCompatibleApiRoute !== undefined) {
    updates.openaiCompatibleApiRoute = openaiCompatibleApiRoute;
  }
  if (openaiCompatibilityProfile !== undefined) {
    updates.openaiCompatibilityProfile = openaiCompatibilityProfile;
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

export async function getProviderById(
  providerId: string,
  workspaceId: string,
  includeShared = false,
) {
  const [provider] = await db
    .select()
    .from(aiProviders)
    .where(
      and(
        eq(aiProviders.id, providerId),
        includeShared
          ? resourceAvailabilityCondition({
              type: "provider",
              id: aiProviders.id,
              workspaceId: aiProviders.workspaceId,
              activeWorkspaceId: workspaceId,
            })
          : eq(aiProviders.workspaceId, workspaceId),
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
        resourceAvailabilityCondition({
          type: "provider",
          id: aiProviders.id,
          workspaceId: aiProviders.workspaceId,
          activeWorkspaceId: workspaceId,
        }),
        isNull(aiProviders.archivedAt),
      ),
    )
    .orderBy(sql`${aiProviders.createdAt} DESC`);
}
