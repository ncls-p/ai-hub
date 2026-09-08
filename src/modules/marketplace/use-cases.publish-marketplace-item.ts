import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
  marketplaceItems,
  marketplaceItemShares,
  marketplaceItemVersions,
  users,
} from "@/server/infrastructure/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { sanitizeMarketplaceManifest } from "./manifest-sanitizer";
import {
  canManageMarketplaceItem,
  MarketplaceVisibility,
} from "./use-cases.marketplace-visibility";

// ─── Publish (draft → published directly) ──────────────────────────────

export async function publishMarketplaceItem(
  itemId: string,
  userId: string,
  input: {
    visibility?: MarketplaceVisibility;
    tags?: string[];
  },
) {
  const [item] = await db
    .select()
    .from(marketplaceItems)
    .where(eq(marketplaceItems.id, itemId))
    .limit(1);
  if (!item) throw new Error("Marketplace item not found");
  if (!(await canManageMarketplaceItem(item, userId)))
    throw new Error("Not authorized to publish this item");
  if (item.status !== "draft") throw new Error("Only drafts can be published");

  if (!item.latestVersionId) {
    throw new Error("Marketplace item has no version");
  }
  const [version] = await db
    .select()
    .from(marketplaceItemVersions)
    .where(eq(marketplaceItemVersions.id, item.latestVersionId))
    .limit(1);
  if (!version) throw new Error("Marketplace item has no version");

  await db
    .update(marketplaceItemVersions)
    .set({ manifestJson: sanitizeMarketplaceManifest(version.manifestJson) })
    .where(eq(marketplaceItemVersions.id, version.id));

  const [updated] = await db
    .update(marketplaceItems)
    .set({
      status: "published",
      visibility: input.visibility ?? "public",
      publishedAt: new Date(),
      tagsJson: input.tags ?? item.tagsJson,
      updatedAt: new Date(),
    })
    .where(eq(marketplaceItems.id, itemId))
    .returning();

  await audit.emit({
    workspaceId: item.publisherWorkspaceId ?? undefined,
    actorPrincipalType: "user",
    actorPrincipalId: userId,
    action: "marketplace.published",
    resourceType: "marketplace_item",
    resourceId: itemId,
    outcome: "success",
    metadata: { visibility: input.visibility ?? "public" },
  });

  return updated;
}

// ─── Share / Unshare ───────────────────────────────────────────────────

export async function shareMarketplaceItem(input: {
  itemId: string;
  userId: string;
  targetUserId: string;
}) {
  const [item] = await db
    .select()
    .from(marketplaceItems)
    .where(eq(marketplaceItems.id, input.itemId))
    .limit(1);
  if (!item) throw new Error("Marketplace item not found");
  if (!(await canManageMarketplaceItem(item, input.userId)))
    throw new Error("Not authorized to share this item");

  const [targetUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, input.targetUserId))
    .limit(1);
  if (!targetUser || targetUser.banned)
    throw new Error("Target user not found");

  const [share] = await db
    .insert(marketplaceItemShares)
    .values({
      itemId: input.itemId,
      sharedWithUserId: input.targetUserId,
    })
    .onConflictDoUpdate({
      target: [
        marketplaceItemShares.itemId,
        marketplaceItemShares.sharedWithUserId,
      ],
      set: { sharedAt: new Date() },
    })
    .returning();

  await audit.emit({
    workspaceId: item.publisherWorkspaceId ?? undefined,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "marketplace.shared",
    resourceType: "marketplace_item",
    resourceId: input.itemId,
    outcome: "success",
    metadata: {
      targetUserId: input.targetUserId,
      targetUserName: targetUser.name,
    },
  });

  return share;
}

export async function unshareMarketplaceItem(input: {
  itemId: string;
  userId: string;
  targetUserId: string;
}) {
  const [item] = await db
    .select()
    .from(marketplaceItems)
    .where(eq(marketplaceItems.id, input.itemId))
    .limit(1);
  if (!item) throw new Error("Marketplace item not found");
  if (!(await canManageMarketplaceItem(item, input.userId)))
    throw new Error("Not authorized to unshare this item");

  await db
    .delete(marketplaceItemShares)
    .where(
      and(
        eq(marketplaceItemShares.itemId, input.itemId),
        eq(marketplaceItemShares.sharedWithUserId, input.targetUserId),
      ),
    );

  await audit.emit({
    workspaceId: item.publisherWorkspaceId ?? undefined,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "marketplace.unshared",
    resourceType: "marketplace_item",
    resourceId: input.itemId,
    outcome: "success",
    metadata: { targetUserId: input.targetUserId },
  });
}

export async function getSharedWithMe(userId: string) {
  const shares = await db
    .select({
      item: marketplaceItems,
      sharedAt: marketplaceItemShares.sharedAt,
    })
    .from(marketplaceItemShares)
    .innerJoin(
      marketplaceItems,
      eq(marketplaceItemShares.itemId, marketplaceItems.id),
    )
    .where(eq(marketplaceItemShares.sharedWithUserId, userId))
    .orderBy(desc(marketplaceItemShares.sharedAt));

  return shares;
}
