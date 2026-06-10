import { and, eq, ilike, or, sql, desc, count } from "drizzle-orm";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
	agents,
	agentSkills,
	agentVersions,
	customTools,
	marketplaceInstalls,
	marketplaceItems,
	marketplaceItemVersions,
	marketplaceItemShares,
	users,
} from "@/server/infrastructure/db/schema";

// ─── Types ─────────────────────────────────────────────────────────────

export interface AgentMarketplaceManifest {
	type: "agent";
	name: string;
	description?: string;
	agent: {
		systemPrompt?: string;
		tools?: string[];
		mcpRequirements?: unknown[];
	};
	permissions?: Record<string, unknown>;
}

export interface SkillMarketplaceManifest {
	type: "skill";
	name: string;
	description?: string;
	skill: {
		markdownFiles: Array<{ path: string; content: string }>;
		sourcePackage?: string;
		sourceSkillName?: string;
		installCommand?: string;
		metadata?: Record<string, unknown>;
	};
}

export interface ToolMarketplaceManifest {
	type: "custom_tool";
	name: string;
	description?: string;
	tool: {
		inputSchema?: Record<string, unknown>;
		outputSchema?: Record<string, unknown>;
		n8nWorkflowId?: string;
		n8nWorkflowUrl?: string;
		metadata?: Record<string, unknown>;
	};
}

export type MarketplaceManifest =
	| AgentMarketplaceManifest
	| SkillMarketplaceManifest
	| ToolMarketplaceManifest;

function slugify(value: string) {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 96);
}

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

export async function getLatestVersion(itemId: string) {
	const [version] = await db
		.select()
		.from(marketplaceItemVersions)
		.where(eq(marketplaceItemVersions.itemId, itemId))
		.orderBy(desc(marketplaceItemVersions.createdAt))
		.limit(1);
	return version ?? null;
}

// ─── Create / Publish ──────────────────────────────────────────────────

export async function publishAgentDraft(input: {
	workspaceId: string;
	userId: string;
	agentId: string;
	version: string;
	name?: string;
	description?: string;
	visibility?: "public" | "private" | "unlisted" | "organization";
	tags?: string[];
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
	if (!agent) throw new Error("Agent not found");

	const [agentVersion] = await db
		.select()
		.from(agentVersions)
		.where(eq(agentVersions.agentId, input.agentId))
		.orderBy(desc(agentVersions.versionNumber))
		.limit(1);

	const name = input.name || agent.name;

	const manifest: AgentMarketplaceManifest = {
		type: "agent",
		name,
		description: input.description || agent.description || undefined,
		agent: {
			systemPrompt: agentVersion?.systemPrompt || undefined,
		},
	};

	const { item, version } = await db.transaction(async (tx) => {
		const [item] = await tx
			.insert(marketplaceItems)
			.values({
				publisherUserId: input.userId,
				publisherWorkspaceId: input.workspaceId,
				type: "agent",
				slug: `${slugify(name)}-${Date.now().toString(36)}`,
				name,
				description: input.description || agent.description,
				visibility: input.visibility ?? "public",
				status: "published",
				pricingModel: "free",
				publishedAt: new Date(),
				tagsJson: input.tags ?? [],
			})
			.returning();

		const [version] = await tx
			.insert(marketplaceItemVersions)
			.values({
				itemId: item.id,
				version: input.version,
				manifestJson: manifest,
				changelog: "Initial marketplace publish",
				compatibilityJson: { app: "ai-hub", schema: 1 },
				requestedPermissionsJson: manifest.permissions,
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
		action: "marketplace.published",
		resourceType: "marketplace_item",
		resourceId: item.id,
		outcome: "success",
		metadata: { agentId: input.agentId, versionId: version.id },
	});

	return { item, version };
}

export async function createMarketplaceDraft(input: {
	workspaceId: string;
	userId: string;
	agentId: string;
	version: string;
	name?: string;
	description?: string;
	visibility?: "public" | "private" | "unlisted" | "organization";
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
	if (!agent) throw new Error("Agent not found");

	const [agentVersion] = await db
		.select()
		.from(agentVersions)
		.where(eq(agentVersions.agentId, input.agentId))
		.orderBy(desc(agentVersions.versionNumber))
		.limit(1);

	const name = input.name || agent.name;

	const manifest: AgentMarketplaceManifest = {
		type: "agent",
		name,
		description: input.description || agent.description || undefined,
		agent: {
			systemPrompt: agentVersion?.systemPrompt || undefined,
		},
	};

	const { item, version } = await db.transaction(async (tx) => {
		const [item] = await tx
			.insert(marketplaceItems)
			.values({
				publisherUserId: input.userId,
				publisherWorkspaceId: input.workspaceId,
				type: "agent",
				slug: `${slugify(name)}-${Date.now().toString(36)}`,
				name,
				description: input.description || agent.description,
				visibility: input.visibility ?? "private",
				status: "draft",
				pricingModel: "free",
			})
			.returning();

		const [version] = await tx
			.insert(marketplaceItemVersions)
			.values({
				itemId: item.id,
				version: input.version,
				manifestJson: manifest,
				changelog: "Initial marketplace draft",
				compatibilityJson: { app: "ai-hub", schema: 1 },
				requestedPermissionsJson: manifest.permissions,
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
		action: "marketplace.draftCreated",
		resourceType: "marketplace_item",
		resourceId: item.id,
		outcome: "success",
		metadata: { agentId: input.agentId, versionId: version.id },
	});

	return { item, version };
}

export async function createSkillMarketplaceDraft(input: {
	workspaceId: string;
	userId: string;
	skillId: string;
	version: string;
	name?: string;
	description?: string;
	visibility?: "public" | "private" | "unlisted" | "organization";
	tags?: string[];
}) {
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
	const markdownFiles = Array.isArray(skill.markdownFilesJson)
		? (skill.markdownFilesJson as SkillMarketplaceManifest["skill"]["markdownFiles"])
		: [];

	const manifest: SkillMarketplaceManifest = {
		type: "skill",
		name,
		description: input.description || skill.description || undefined,
		skill: {
			markdownFiles,
			sourcePackage: skill.sourcePackage ?? undefined,
			sourceSkillName: skill.sourceSkillName ?? undefined,
			installCommand: skill.installCommand ?? undefined,
			metadata:
				skill.metadataJson && typeof skill.metadataJson === "object"
					? (skill.metadataJson as Record<string, unknown>)
					: undefined,
		},
	};

	const { item, version } = await db.transaction(async (tx) => {
		const [item] = await tx
			.insert(marketplaceItems)
			.values({
				publisherUserId: input.userId,
				publisherWorkspaceId: input.workspaceId,
				type: "skill",
				slug: `${slugify(name)}-${Date.now().toString(36)}`,
				name,
				description: input.description || skill.description,
				visibility: input.visibility ?? "private",
				status: "draft",
				pricingModel: "free",
				tagsJson: input.tags ?? [],
			})
			.returning();

		const [version] = await tx
			.insert(marketplaceItemVersions)
			.values({
				itemId: item.id,
				version: input.version,
				manifestJson: manifest,
				changelog: "Initial marketplace draft",
				compatibilityJson: { app: "ai-hub", schema: 1 },
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
		action: "marketplace.draftCreated",
		resourceType: "marketplace_item",
		resourceId: item.id,
		outcome: "success",
		metadata: { skillId: input.skillId, versionId: version.id },
	});

	return { item, version };
}

export async function createCustomToolMarketplaceDraft(input: {
	workspaceId: string;
	userId: string;
	customToolId: string;
	version: string;
	name?: string;
	description?: string;
	visibility?: "public" | "private" | "unlisted" | "organization";
	tags?: string[];
}) {
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

	const manifest: ToolMarketplaceManifest = {
		type: "custom_tool",
		name,
		description: input.description || tool.description || undefined,
		tool: {
			inputSchema:
				tool.inputSchemaJson && typeof tool.inputSchemaJson === "object"
					? (tool.inputSchemaJson as Record<string, unknown>)
					: undefined,
			outputSchema:
				tool.outputSchemaJson && typeof tool.outputSchemaJson === "object"
					? (tool.outputSchemaJson as Record<string, unknown>)
					: undefined,
			n8nWorkflowId: tool.n8nWorkflowId ?? undefined,
			n8nWorkflowUrl: tool.n8nWorkflowUrl ?? undefined,
			metadata:
				tool.metadataJson && typeof tool.metadataJson === "object"
					? (tool.metadataJson as Record<string, unknown>)
					: undefined,
		},
	};

	const { item, version } = await db.transaction(async (tx) => {
		const [item] = await tx
			.insert(marketplaceItems)
			.values({
				publisherUserId: input.userId,
				publisherWorkspaceId: input.workspaceId,
				type: "custom_tool",
				slug: `${slugify(name)}-${Date.now().toString(36)}`,
				name,
				description: input.description || tool.description,
				visibility: input.visibility ?? "private",
				status: "draft",
				pricingModel: "free",
				tagsJson: input.tags ?? [],
			})
			.returning();

		const [version] = await tx
			.insert(marketplaceItemVersions)
			.values({
				itemId: item.id,
				version: input.version,
				manifestJson: manifest,
				changelog: "Initial marketplace draft",
				compatibilityJson: { app: "ai-hub", schema: 1 },
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
		action: "marketplace.draftCreated",
		resourceType: "marketplace_item",
		resourceId: item.id,
		outcome: "success",
		metadata: { customToolId: input.customToolId, versionId: version.id },
	});

	return { item, version };
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
	if (!item || item.status !== "published")
		throw new Error("Marketplace item not available");
	const version = await getLatestVersion(item.id);
	if (!version) throw new Error("Marketplace item has no version");

	const manifest = version.manifestJson as MarketplaceManifest;

	const { installedResource, install } = await db.transaction(async (tx) => {
		let installedResource: { id: string } | null = null;
		let resourceType: string;

		switch (manifest.type) {
			case "agent": {
				const [installedAgent] = await tx
					.insert(agents)
					.values({
						workspaceId: input.workspaceId,
						name: manifest.name,
						slug: `${slugify(manifest.name)}-${Date.now().toString(36)}`,
						description: manifest.description ?? item.description,
						visibility: "workspace",
						sourceType: "marketplace_install",
						marketplaceItemId: item.id,
						marketplaceVersionId: version.id,
						createdById: input.userId,
					})
					.returning();

				const [agentVersion] = await tx
					.insert(agentVersions)
					.values({
						agentId: installedAgent.id,
						versionNumber: 1,
						name: `Installed from marketplace ${version.version}`,
						systemPrompt: manifest.agent.systemPrompt ?? null,
						maxOutputTokens: 30_000,
						createdById: input.userId,
					})
					.returning();

				await tx
					.update(agents)
					.set({ activeVersionId: agentVersion.id })
					.where(eq(agents.id, installedAgent.id));

				installedResource = installedAgent;
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
				const [installedTool] = await tx
					.insert(customTools)
					.values({
						workspaceId: input.workspaceId,
						createdById: input.userId,
						name: manifest.name,
						description: manifest.description ?? item.description,
						n8nWorkflowId: manifest.tool.n8nWorkflowId ?? null,
						n8nWorkflowUrl: manifest.tool.n8nWorkflowUrl ?? null,
						status: "active",
						inputSchemaJson: manifest.tool.inputSchema ?? null,
						outputSchemaJson: manifest.tool.outputSchema ?? null,
						metadataJson: manifest.tool.metadata ?? null,
					})
					.returning();

				installedResource = installedTool;
				resourceType = "custom_tool";
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
