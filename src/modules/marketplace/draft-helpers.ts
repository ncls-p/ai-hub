import { logHandledError } from "@/lib/logger";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  marketplaceItems,
  marketplaceItemVersions,
} from "@/server/infrastructure/db/schema";
import { and, eq } from "drizzle-orm";
import { sanitizeMarketplaceManifest } from "./manifest-sanitizer";
import type { MarketplaceManifest, SourceResourceType } from "./manifest-types";
import { buildAgentManifest } from "./manifest-builders";

type MarketplaceVisibility = "public" | "private";

export async function prepareAgentMarketplaceDraft(input: {
  agentId: string;
  workspaceId: string;
  userId: string;
  name?: string;
  description?: string;
}) {
  const [agent] = await db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.id, input.agentId),
        eq(agents.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!agent || agent.createdById !== input.userId)
    throw new Error("Agent not found");
  const name = input.name || agent.name;
  const description = input.description ?? agent.description;
  const manifest = await buildAgentManifest(
    input.agentId,
    input.workspaceId,
    name,
    description,
    undefined,
    undefined,
    input.userId,
  );
  return { agent, description, manifest, name };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function findExistingDraft(
  sourceResourceType: SourceResourceType,
  sourceResourceId: string,
  publisherUserId: string,
) {
  const [item] = await db
    .select()
    .from(marketplaceItems)
    .where(
      and(
        eq(marketplaceItems.sourceResourceType, sourceResourceType),
        eq(marketplaceItems.sourceResourceId, sourceResourceId),
        eq(marketplaceItems.publisherUserId, publisherUserId),
        eq(marketplaceItems.status, "draft"),
      ),
    )
    .limit(1);
  return item ?? null;
}

export async function upsertMarketplaceDraft(input: {
  workspaceId: string;
  userId: string;
  type: (typeof marketplaceItems.$inferSelect)["type"];
  sourceResourceType: SourceResourceType;
  sourceResourceId: string;
  version: string;
  changelog?: string;
  name: string;
  description?: string | null;
  visibility?: MarketplaceVisibility;
  tags?: string[];
  manifest: MarketplaceManifest;
  metadata: Record<string, unknown>;
  status?: "draft" | "published";
  publishedAt?: Date | null;
}) {
  try {
    const manifest = sanitizeMarketplaceManifest(input.manifest);
    const existing = await findExistingDraft(
      input.sourceResourceType,
      input.sourceResourceId,
      input.userId,
    );

    if (existing) {
      const [version] = await db
        .insert(marketplaceItemVersions)
        .values({
          itemId: existing.id,
          version: input.version,
          manifestJson: manifest,
          changelog: input.changelog ?? "Updated marketplace draft",
          compatibilityJson: { app: "ai-hub", schema: 2 },
          securityReviewStatus: "pending",
          createdById: input.userId,
        })
        .returning();

      const [item] = await db
        .update(marketplaceItems)
        .set({
          name: input.name,
          description: input.description,
          visibility: input.visibility ?? existing.visibility,
          tagsJson: input.tags ?? existing.tagsJson,
          status: input.status ?? existing.status,
          publishedAt:
            input.status === "published"
              ? (input.publishedAt ?? new Date())
              : existing.publishedAt,
          latestVersionId: version.id,
          updatedAt: new Date(),
        })
        .where(eq(marketplaceItems.id, existing.id))
        .returning();

      await audit.emit({
        workspaceId: input.workspaceId,
        actorPrincipalType: "user",
        actorPrincipalId: input.userId,
        action:
          input.status === "published"
            ? "marketplace.published"
            : "marketplace.draftUpdated",
        resourceType: "marketplace_item",
        resourceId: item.id,
        outcome: "success",
        metadata: { ...input.metadata, versionId: version.id, reused: true },
      });

      return { item, version, reused: true as const };
    }

    const { item, version } = await db.transaction(async (tx) => {
      const [item] = await tx
        .insert(marketplaceItems)
        .values({
          publisherUserId: input.userId,
          publisherWorkspaceId: input.workspaceId,
          type: input.type,
          sourceResourceType: input.sourceResourceType,
          sourceResourceId: input.sourceResourceId,
          slug: `${slugify(input.name)}-${Date.now().toString(36)}`,
          name: input.name,
          description: input.description,
          visibility: input.visibility ?? "private",
          status: input.status ?? "draft",
          pricingModel: "free",
          tagsJson: input.tags ?? [],
          publishedAt:
            input.status === "published"
              ? (input.publishedAt ?? new Date())
              : null,
        })
        .returning();

      const [version] = await tx
        .insert(marketplaceItemVersions)
        .values({
          itemId: item.id,
          version: input.version,
          manifestJson: manifest,
          changelog: input.changelog ?? "Initial marketplace draft",
          compatibilityJson: { app: "ai-hub", schema: 2 },
          securityReviewStatus: "pending",
          createdById: input.userId,
        })
        .returning();

      await tx
        .update(marketplaceItems)
        .set({ latestVersionId: version.id, updatedAt: new Date() })
        .where(eq(marketplaceItems.id, item.id));

      return { item, version };
    });

    await audit.emit({
      workspaceId: input.workspaceId,
      actorPrincipalType: "user",
      actorPrincipalId: input.userId,
      action:
        input.status === "published"
          ? "marketplace.published"
          : "marketplace.draftCreated",
      resourceType: "marketplace_item",
      resourceId: item.id,
      outcome: "success",
      metadata: { ...input.metadata, versionId: version.id },
    });

    return { item, version, reused: false as const };
  } catch (error) {
    logHandledError("Failed to upsert marketplace draft", {}, error as Error);
    throw error;
  }
}
