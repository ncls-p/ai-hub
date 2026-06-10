import { and, eq, ilike, or, sql, desc, count } from "drizzle-orm";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
	agents,
	agentSkills,
	customTools,
	marketplaceInstalls,
	marketplaceItems,
	marketplaceItemVersions,
	marketplaceItemShares,
	mcpServers,
	mcpTools,
	users,
} from "@/server/infrastructure/db/schema";
import { upsertMarketplaceDraft } from "./draft-helpers";
import {
	installAgentManifest,
	installCustomTool,
	installMcpPreset,
	installPostInstallFlags,
} from "./install-helpers";
import {
	buildAgentManifest,
	buildCustomToolManifest,
	buildMcpPresetManifest,
	buildSkillManifest,
} from "./manifest-builders";
import type {
	AgentMarketplaceManifest,
	MarketplaceManifest,
	McpPresetMarketplaceManifest,
	SkillMarketplaceManifest,
	ToolMarketplaceManifest,
} from "./manifest-types";

export type {
	AgentMarketplaceManifest,
	MarketplaceManifest,
	McpPresetMarketplaceManifest,
	SkillMarketplaceManifest,
	ToolMarketplaceManifest,
} from "./manifest-types";

export { getPublishPreview } from "./publish-preview";
export type { PublishPreviewResult } from "./publish-preview";

// ─── List / Search ─────────────────────────────────────────────────────

export function listMarketplaceItems(input: {
	userId?: string;
	search?: string;
	type?: string[];
	tags?: string[];
	featuredOnly?: boolean;
	sortBy?: "featured" | "newest" | "downloads" | "rating";
	status?: string;
	includeDrafts?: boolean;
}) {
	const conditions: unknown[] = [];

	if (input.status) {
		conditions.push(eq(marketplaceItems.status, input.status as never));
	} else if (!input.includeDrafts) {
		conditions.push(eq(marketplaceItems.status, "published"));
		if (input.userId) {
			// Also include items shared with this user
			const sharedSubquery = db
				.select({ itemId: marketplaceItemShares.itemId })
				.from(marketplaceItemShares)
				.where(eq(marketplaceItemShares.sharedWithUserId, input.userId));
			conditions.push(
				or(
					eq(marketplaceItems.visibility, "public"),
					eq(marketplaceItems.publisherUserId, input.userId),
					sql`${marketplaceItems.id} IN ${sharedSubquery}`,
				),
			);
		} else {
			conditions.push(eq(marketplaceItems.visibility, "public"));
		}
	}

	if (input.search) {
		const searchPattern = `%${input.search}%`;
		conditions.push(
			or(
				ilike(marketplaceItems.name, searchPattern),
				ilike(marketplaceItems.description, searchPattern),
			),
		);
	}

	if (input.type && input.type.length > 0) {
		conditions.push(
			sql`${marketplaceItems.type} IN (${input.type.map((t) => `'${t}'`).join(",")})`,
		);
	}

	if (input.featuredOnly) {
		conditions.push(eq(marketplaceItems.isFeatured, true));
	}

	// Build query — use a helper to chain conditionally
	const buildQuery = () => {
		let q = db.select().from(marketplaceItems);
		if (conditions.length > 0) {
			q = q.where(and(...(conditions as Parameters<typeof and>))) as typeof q;
		}
		switch (input.sortBy) {
			case "featured":
				return q.orderBy(
					desc(marketplaceItems.isFeatured),
					desc(marketplaceItems.featuredOrder),
					desc(marketplaceItems.totalDownloads),
				) as typeof q;
			case "newest":
				return q.orderBy(desc(marketplaceItems.publishedAt)) as typeof q;
			case "downloads":
				return q.orderBy(desc(marketplaceItems.totalDownloads)) as typeof q;
			case "rating":
				return q.orderBy(desc(marketplaceItems.ratingAverage)) as typeof q;
			default:
				return q.orderBy(
					desc(marketplaceItems.isFeatured),
					desc(marketplaceItems.featuredOrder),
					desc(marketplaceItems.totalDownloads),
					desc(marketplaceItems.updatedAt),
				) as typeof q;
		}
	};

	return buildQuery();
}

export async function getMarketplaceItem(itemId: string) {
	const [item] = await db
		.select()
		.from(marketplaceItems)
		.where(eq(marketplaceItems.id, itemId))
		.limit(1);
	return item ?? null;
}

export async function getMarketplaceItemWithShares(itemId: string) {
	const [item] = await db
		.select()
		.from(marketplaceItems)
		.where(eq(marketplaceItems.id, itemId))
		.limit(1);
	if (!item) return null;

	const shares = await db
		.select()
		.from(marketplaceItemShares)
		.where(eq(marketplaceItemShares.itemId, itemId));

	const shareCount = shares.length;

	return { ...item, shareCount };
}

export async function getMarketplaceItemDetail(
	itemId: string,
	userId?: string,
) {
	const item = await getMarketplaceItemWithShares(itemId);
	if (!item) return null;

	const latestVersion = await getLatestVersion(itemId);

	const [publisher] = await db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
		})
		.from(users)
		.where(eq(users.id, item.publisherUserId))
		.limit(1);

	const shareRows = await db
		.select({
			userId: marketplaceItemShares.sharedWithUserId,
			sharedAt: marketplaceItemShares.sharedAt,
			name: users.name,
			email: users.email,
		})
		.from(marketplaceItemShares)
		.innerJoin(users, eq(users.id, marketplaceItemShares.sharedWithUserId))
		.where(eq(marketplaceItemShares.itemId, itemId));

	const isOwner = userId ? item.publisherUserId === userId : false;
	const canInstall = userId
		? await canUserInstallMarketplaceItem(item, userId)
		: item.status === "published" && item.visibility === "public";

	return {
		...item,
		latestVersion: latestVersion
			? {
					id: latestVersion.id,
					version: latestVersion.version,
					changelog: latestVersion.changelog,
					manifestJson: latestVersion.manifestJson as MarketplaceManifest,
					compatibilityJson: latestVersion.compatibilityJson,
					createdAt: latestVersion.createdAt,
				}
			: null,
		publisher: publisher ?? null,
		shares: isOwner
			? shareRows.map((s) => ({
					userId: s.userId,
					name: s.name,
					email: s.email,
					sharedAt: s.sharedAt,
				}))
			: [],
		isOwner,
		canInstall,
	};
}

export async function getLatestVersion(itemId: string) {
	const [version] = await db
		.select()
		.from(marketplaceItemVersions)
		.where(eq(marketplaceItemVersions.itemId, itemId))
		.orderBy(desc(marketplaceItemVersions.createdAt))
		.limit(1);
	return version ?? null;
}

async function userHasMarketplaceShare(itemId: string, userId: string) {
	const [share] = await db
		.select({ id: marketplaceItemShares.id })
		.from(marketplaceItemShares)
		.where(
			and(
				eq(marketplaceItemShares.itemId, itemId),
				eq(marketplaceItemShares.sharedWithUserId, userId),
			),
		)
		.limit(1);
	return Boolean(share);
}

export async function canUserInstallMarketplaceItem(
	item: NonNullable<Awaited<ReturnType<typeof getMarketplaceItem>>>,
	userId: string,
) {
	const blockedStatuses = new Set(["suspended", "archived", "rejected"]);
	if (blockedStatuses.has(item.status)) return false;

	if (item.publisherUserId === userId) return true;

	if (item.status === "published" && item.visibility === "public") return true;

	if (await userHasMarketplaceShare(item.id, userId)) return true;

	if (item.status === "draft" || item.status === "published") {
		return false;
	}

	return false;
}

// ─── Create / Publish ──────────────────────────────────────────────────

type DraftInputExtras = {
	changelog?: string;
	includeSecrets?: boolean;
	tags?: string[];
};

export async function publishAgentDraft(
	input: {
		workspaceId: string;
		userId: string;
		agentId: string;
		version: string;
		name?: string;
		description?: string;
		visibility?: "public" | "private" | "unlisted" | "organization";
	} & DraftInputExtras,
) {
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
	if (!agent) throw new Error("Agent not found");

	const name = input.name || agent.name;
	const manifest = await buildAgentManifest(
		input.agentId,
		input.workspaceId,
		name,
		input.description ?? agent.description,
		input.includeSecrets,
	);

	return upsertMarketplaceDraft({
		workspaceId: input.workspaceId,
		userId: input.userId,
		type: "agent",
		sourceResourceType: "agent",
		sourceResourceId: input.agentId,
		version: input.version,
		changelog: input.changelog ?? "Initial marketplace publish",
		name,
		description: input.description ?? agent.description,
		visibility: input.visibility ?? "public",
		tags: input.tags,
		manifest,
		metadata: { agentId: input.agentId },
		status: "published",
		publishedAt: new Date(),
	});
}

export async function createMarketplaceDraft(
	input: {
		workspaceId: string;
		userId: string;
		agentId: string;
		version: string;
		name?: string;
		description?: string;
		visibility?: "public" | "private" | "unlisted" | "organization";
	} & DraftInputExtras,
) {
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
	if (!agent) throw new Error("Agent not found");

	const name = input.name || agent.name;
	const manifest = await buildAgentManifest(
		input.agentId,
		input.workspaceId,
		name,
		input.description ?? agent.description,
		input.includeSecrets,
	);

	return upsertMarketplaceDraft({
		workspaceId: input.workspaceId,
		userId: input.userId,
		type: "agent",
		sourceResourceType: "agent",
		sourceResourceId: input.agentId,
		version: input.version,
		changelog: input.changelog,
		name,
		description: input.description ?? agent.description,
		visibility: input.visibility,
		tags: input.tags,
		manifest,
		metadata: { agentId: input.agentId },
	});
}

export async function createSkillMarketplaceDraft(
	input: {
		workspaceId: string;
		userId: string;
		skillId: string;
		version: string;
		name?: string;
		description?: string;
		visibility?: "public" | "private" | "unlisted" | "organization";
	} & DraftInputExtras,
) {
	const [skill] = await db
		.select()
		.from(agentSkills)
		.where(
			and(
				eq(agentSkills.id, input.skillId),
				eq(agentSkills.workspaceId, input.workspaceId),
			),
		)
		.limit(1);
	if (!skill) throw new Error("Skill not found");

	const name = input.name || skill.name;
	const manifest = buildSkillManifest(
		skill,
		name,
		input.description ?? skill.description,
	);

	return upsertMarketplaceDraft({
		workspaceId: input.workspaceId,
		userId: input.userId,
		type: "skill",
		sourceResourceType: "skill",
		sourceResourceId: input.skillId,
		version: input.version,
		changelog: input.changelog,
		name,
		description: input.description ?? skill.description,
		visibility: input.visibility,
		tags: input.tags,
		manifest,
		metadata: { skillId: input.skillId },
	});
}

export async function createCustomToolMarketplaceDraft(
	input: {
		workspaceId: string;
		userId: string;
		customToolId: string;
		version: string;
		name?: string;
		description?: string;
		visibility?: "public" | "private" | "unlisted" | "organization";
	} & DraftInputExtras,
) {
	const [tool] = await db
		.select()
		.from(customTools)
		.where(
			and(
				eq(customTools.id, input.customToolId),
				eq(customTools.workspaceId, input.workspaceId),
			),
		)
		.limit(1);
	if (!tool) throw new Error("Custom tool not found");

	const name = input.name || tool.name;
	const manifest = await buildCustomToolManifest(
		tool,
		name,
		input.description ?? tool.description,
		input.includeSecrets,
	);

	return upsertMarketplaceDraft({
		workspaceId: input.workspaceId,
		userId: input.userId,
		type: "custom_tool",
		sourceResourceType: "custom_tool",
		sourceResourceId: input.customToolId,
		version: input.version,
		changelog: input.changelog,
		name,
		description: input.description ?? tool.description,
		visibility: input.visibility,
		tags: input.tags,
		manifest,
		metadata: { customToolId: input.customToolId },
	});
}

export async function createMcpServerMarketplaceDraft(
	input: {
		workspaceId: string;
		userId: string;
		mcpServerId: string;
		version: string;
		name?: string;
		description?: string;
		visibility?: "public" | "private" | "unlisted" | "organization";
	} & DraftInputExtras,
) {
	const [server] = await db
		.select()
		.from(mcpServers)
		.where(
			and(
				eq(mcpServers.id, input.mcpServerId),
				eq(mcpServers.workspaceId, input.workspaceId),
			),
		)
		.limit(1);
	if (!server) throw new Error("MCP server not found");

	const tools = await db
		.select()
		.from(mcpTools)
		.where(eq(mcpTools.mcpServerId, server.id));

	const name = input.name || server.name;
	const manifest = buildMcpPresetManifest(
		name,
		input.description,
		server,
		tools,
		"server",
		input.includeSecrets,
	);

	return upsertMarketplaceDraft({
		workspaceId: input.workspaceId,
		userId: input.userId,
		type: "mcp_preset",
		sourceResourceType: "mcp_server",
		sourceResourceId: input.mcpServerId,
		version: input.version,
		changelog: input.changelog,
		name,
		description: input.description ?? null,
		visibility: input.visibility,
		tags: input.tags,
		manifest,
		metadata: { mcpServerId: input.mcpServerId, scope: "server" },
	});
}

export async function createMcpToolMarketplaceDraft(
	input: {
		workspaceId: string;
		userId: string;
		mcpToolId: string;
		version: string;
		name?: string;
		description?: string;
		visibility?: "public" | "private" | "unlisted" | "organization";
	} & DraftInputExtras,
) {
	const [tool] = await db
		.select()
		.from(mcpTools)
		.where(eq(mcpTools.id, input.mcpToolId))
		.limit(1);
	if (!tool) throw new Error("MCP tool not found");

	const [server] = await db
		.select()
		.from(mcpServers)
		.where(
			and(
				eq(mcpServers.id, tool.mcpServerId),
				eq(mcpServers.workspaceId, input.workspaceId),
			),
		)
		.limit(1);
	if (!server) throw new Error("MCP server not found");

	const name = input.name || `${server.name} — ${tool.name}`;
	const manifest = buildMcpPresetManifest(
		name,
		input.description ?? tool.description,
		server,
		[tool],
		"tool",
		input.includeSecrets,
	);

	return upsertMarketplaceDraft({
		workspaceId: input.workspaceId,
		userId: input.userId,
		type: "mcp_preset",
		sourceResourceType: "mcp_tool",
		sourceResourceId: input.mcpToolId,
		version: input.version,
		changelog: input.changelog,
		name,
		description: input.description ?? tool.description,
		visibility: input.visibility,
		tags: input.tags,
		manifest,
		metadata: {
			mcpToolId: input.mcpToolId,
			mcpServerId: server.id,
			scope: "tool",
		},
	});
}

// ─── Publish (draft → published directly) ──────────────────────────────

export async function publishMarketplaceItem(
	itemId: string,
	userId: string,
	input: {
		visibility?: "public" | "private" | "unlisted" | "organization";
		tags?: string[];
	},
) {
	const [item] = await db
		.select()
		.from(marketplaceItems)
		.where(eq(marketplaceItems.id, itemId))
		.limit(1);
	if (!item) throw new Error("Marketplace item not found");
	if (item.publisherUserId !== userId)
		throw new Error("Not authorized to publish this item");
	if (item.status !== "draft") throw new Error("Only drafts can be published");

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
	if (item.publisherUserId !== input.userId)
		throw new Error("Not authorized to share this item");

	const [targetUser] = await db
		.select()
		.from(users)
		.where(eq(users.id, input.targetUserId))
		.limit(1);
	if (!targetUser) throw new Error("Target user not found");

	const [share] = await db
		.insert(marketplaceItemShares)
		.values({
			itemId: input.itemId,
			sharedWithUserId: input.targetUserId,
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
	if (item.publisherUserId !== input.userId)
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

export async function getMyPublishedItems(userId: string) {
	return db
		.select()
		.from(marketplaceItems)
		.where(
			and(
				eq(marketplaceItems.publisherUserId, userId),
				eq(marketplaceItems.status, "published"),
			),
		)
		.orderBy(desc(marketplaceItems.publishedAt));
}

// ─── Feature / Unfeature (Admin) ───────────────────────────────────────

export async function featureMarketplaceItem(input: {
	itemId: string;
	adminUserId: string;
	order?: number;
}) {
	const [item] = await db
		.select()
		.from(marketplaceItems)
		.where(eq(marketplaceItems.id, input.itemId))
		.limit(1);
	if (!item) throw new Error("Marketplace item not found");

	const [updated] = await db
		.update(marketplaceItems)
		.set({
			isFeatured: true,
			featuredOrder: input.order,
			featuredAt: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(marketplaceItems.id, input.itemId))
		.returning();

	await audit.emit({
		workspaceId: item.publisherWorkspaceId ?? undefined,
		actorPrincipalType: "user",
		actorPrincipalId: input.adminUserId,
		action: "marketplace.featured",
		resourceType: "marketplace_item",
		resourceId: input.itemId,
		outcome: "success",
		metadata: { order: input.order },
	});

	return updated;
}

export async function unfeatureMarketplaceItem(input: {
	itemId: string;
	adminUserId: string;
}) {
	const [item] = await db
		.select()
		.from(marketplaceItems)
		.where(eq(marketplaceItems.id, input.itemId))
		.limit(1);
	if (!item) throw new Error("Marketplace item not found");

	const [updated] = await db
		.update(marketplaceItems)
		.set({
			isFeatured: false,
			featuredOrder: null,
			featuredAt: null,
			updatedAt: new Date(),
		})
		.where(eq(marketplaceItems.id, input.itemId))
		.returning();

	await audit.emit({
		workspaceId: item.publisherWorkspaceId ?? undefined,
		actorPrincipalType: "user",
		actorPrincipalId: input.adminUserId,
		action: "marketplace.unfeatured",
		resourceType: "marketplace_item",
		resourceId: input.itemId,
		outcome: "success",
	});

	return updated;
}

// ─── Update item ───────────────────────────────────────────────────────

export async function updateMarketplaceItem(input: {
	itemId: string;
	userId: string;
	name?: string;
	description?: string;
	tags?: string[];
}) {
	const [item] = await db
		.select()
		.from(marketplaceItems)
		.where(eq(marketplaceItems.id, input.itemId))
		.limit(1);
	if (!item) throw new Error("Marketplace item not found");
	if (item.publisherUserId !== input.userId)
		throw new Error("Not authorized to update this item");

	const updates: Partial<typeof marketplaceItems.$inferInsert> = {
		updatedAt: new Date(),
	};
	if (input.name !== undefined) updates.name = input.name;
	if (input.description !== undefined) updates.description = input.description;
	if (input.tags !== undefined) updates.tagsJson = input.tags;

	const [updated] = await db
		.update(marketplaceItems)
		.set(updates)
		.where(eq(marketplaceItems.id, input.itemId))
		.returning();

	return updated;
}

// ─── Delete item ───────────────────────────────────────────────────────

export async function deleteMarketplaceItem(itemId: string, userId: string) {
	const [item] = await db
		.select()
		.from(marketplaceItems)
		.where(eq(marketplaceItems.id, itemId))
		.limit(1);
	if (!item) throw new Error("Marketplace item not found");
	if (item.publisherUserId !== userId)
		throw new Error("Not authorized to delete this item");

	const [updated] = await db
		.update(marketplaceItems)
		.set({ status: "archived", updatedAt: new Date() })
		.where(eq(marketplaceItems.id, itemId))
		.returning();

	await audit.emit({
		workspaceId: item.publisherWorkspaceId ?? undefined,
		actorPrincipalType: "user",
		actorPrincipalId: userId,
		action: "marketplace.deleted",
		resourceType: "marketplace_item",
		resourceId: itemId,
		outcome: "success",
	});

	return updated;
}

// ─── Admin moderation ──────────────────────────────────────────────────

export async function adminModerateItem(input: {
	itemId: string;
	adminUserId: string;
	action: "suspend" | "unsuspend" | "archive" | "unarchive";
}) {
	const [item] = await db
		.select()
		.from(marketplaceItems)
		.where(eq(marketplaceItems.id, input.itemId))
		.limit(1);
	if (!item) throw new Error("Marketplace item not found");

	let newStatus: string;
	switch (input.action) {
		case "suspend":
			newStatus = "suspended";
			break;
		case "unsuspend":
			newStatus = "published";
			break;
		case "archive":
			newStatus = "archived";
			break;
		case "unarchive":
			newStatus = "published";
			break;
		default:
			throw new Error(`Unknown moderation action: ${input.action}`);
	}

	const [updated] = await db
		.update(marketplaceItems)
		.set({ status: newStatus as never, updatedAt: new Date() })
		.where(eq(marketplaceItems.id, input.itemId))
		.returning();

	await audit.emit({
		workspaceId: item.publisherWorkspaceId ?? undefined,
		actorPrincipalType: "user",
		actorPrincipalId: input.adminUserId,
		action: `marketplace.${input.action}`,
		resourceType: "marketplace_item",
		resourceId: input.itemId,
		outcome: "success",
	});

	return updated;
}

// ─── Install ───────────────────────────────────────────────────────────

export async function installMarketplaceItem(input: {
	workspaceId: string;
	userId: string;
	itemId: string;
}) {
	const item = await getMarketplaceItem(input.itemId);
	if (!item) throw new Error("Marketplace item not found");
	if (!(await canUserInstallMarketplaceItem(item, input.userId)))
		throw new Error("Marketplace item not available");
	const version = await getLatestVersion(item.id);
	if (!version) throw new Error("Marketplace item has no version");

	const manifest = version.manifestJson as MarketplaceManifest;
	const postInstall = installPostInstallFlags(manifest);

	const { installedResource, install } = await db.transaction(async (tx) => {
		let installedResource: { id: string } | null = null;
		let resourceType: string;

		switch (manifest.type) {
			case "agent": {
				installedResource = await installAgentManifest(tx, {
					workspaceId: input.workspaceId,
					userId: input.userId,
					itemId: item.id,
					versionId: version.id,
					versionLabel: version.version,
					manifest,
					itemDescription: item.description,
				});
				resourceType = "agent";
				break;
			}

			case "skill": {
				const [installedSkill] = await tx
					.insert(agentSkills)
					.values({
						workspaceId: input.workspaceId,
						createdById: input.userId,
						name: manifest.name,
						description: manifest.description ?? item.description,
						sourcePackage: manifest.skill.sourcePackage ?? null,
						sourceSkillName: manifest.skill.sourceSkillName ?? null,
						installCommand: manifest.skill.installCommand ?? null,
						markdownFilesJson: manifest.skill.markdownFiles,
						metadataJson: manifest.skill.metadata ?? null,
					})
					.returning();

				installedResource = installedSkill;
				resourceType = "skill";
				break;
			}

			case "custom_tool": {
				const { tool } = await installCustomTool(tx, {
					workspaceId: input.workspaceId,
					userId: input.userId,
					manifest,
					itemDescription: item.description,
				});
				installedResource = tool;
				resourceType = "custom_tool";
				break;
			}

			case "mcp_preset": {
				const { server } = await installMcpPreset(tx, {
					workspaceId: input.workspaceId,
					userId: input.userId,
					manifest,
					itemDescription: item.description,
				});
				installedResource = server;
				resourceType = "mcp_preset";
				break;
			}

			default:
				throw new Error(
					`Unsupported marketplace type: ${(manifest as { type: string }).type}`,
				);
		}

		const [install] = await tx
			.insert(marketplaceInstalls)
			.values({
				workspaceId: input.workspaceId,
				itemId: item.id,
				versionId: version.id,
				installedByUserId: input.userId,
				installedResourceType: resourceType,
				installedResourceId: installedResource.id,
			})
			.returning();

		await tx
			.update(marketplaceItems)
			.set({
				installCount: sql`${marketplaceItems.installCount} + 1`,
				totalDownloads: sql`${marketplaceItems.totalDownloads} + 1`,
			})
			.where(eq(marketplaceItems.id, item.id));

		return { installedResource, install };
	});

	await audit.emit({
		workspaceId: input.workspaceId,
		actorPrincipalType: "user",
		actorPrincipalId: input.userId,
		action: "marketplace.installed",
		resourceType: "marketplace_item",
		resourceId: item.id,
		outcome: "success",
		metadata: {
			installedResourceId: installedResource.id,
			installId: install.id,
		},
	});

	return {
		install,
		[manifest.type]: installedResource,
		requiresCredentials: postInstall.requiresCredentials,
	};
}

// ─── Stats ─────────────────────────────────────────────────────────────

export async function getMarketplaceStats() {
	const [stats] = await db
		.select({
			totalItems: count(marketplaceItems.id),
			publishedItems: count(
				sql`CASE WHEN ${marketplaceItems.status} = 'published' THEN 1 END`,
			),
			featuredItems: count(
				sql`CASE WHEN ${marketplaceItems.isFeatured} = true THEN 1 END`,
			),
			totalInstalls: count(marketplaceInstalls.id),
			totalShares: count(marketplaceItemShares.id),
		})
		.from(marketplaceItems)
		.leftJoin(
			marketplaceInstalls,
			eq(marketplaceInstalls.itemId, marketplaceItems.id),
		)
		.leftJoin(
			marketplaceItemShares,
			eq(marketplaceItemShares.itemId, marketplaceItems.id),
		);

	return stats;
}
