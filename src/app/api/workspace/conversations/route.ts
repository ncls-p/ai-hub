import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
	agents,
	conversationFolders,
	conversations,
} from "@/server/infrastructure/db/schema";

const DEFAULT_CONVERSATION_LIMIT = 50;
const MAX_CONVERSATION_LIMIT = 100;

const querySchema = z.object({
	workspaceId: z.uuid().optional(),
	agentId: z.uuid().optional(),
	before: z.string().optional(),
	includeMeta: z.enum(["true", "false"]).optional(),
	limit: z.coerce
		.number()
		.int()
		.min(1)
		.max(MAX_CONVERSATION_LIMIT)
		.default(DEFAULT_CONVERSATION_LIMIT),
});

function createConversationCursor(
	conversation: { id: string; updatedAt: Date | string } | undefined,
) {
	if (!conversation) return null;
	const updatedAt =
		conversation.updatedAt instanceof Date
			? conversation.updatedAt.toISOString()
			: conversation.updatedAt;
	return `${updatedAt}|${conversation.id}`;
}

export async function GET(req: Request) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { searchParams } = new URL(req.url);
		const parsed = querySchema.safeParse({
			agentId: searchParams.get("agentId") ?? undefined,
			workspaceId: searchParams.get("workspaceId") ?? undefined,
			before: searchParams.get("before") ?? undefined,
			includeMeta: searchParams.get("includeMeta") ?? undefined,
			limit: searchParams.get("limit") ?? undefined,
		});

		if (!parsed.success || (!parsed.data.workspaceId && !parsed.data.agentId)) {
			return NextResponse.json(
				{ error: "workspaceId or agentId must be a valid UUID" },
				{ status: 400 },
			);
		}

		const { agentId, includeMeta, limit } = parsed.data;
		let workspaceId = parsed.data.workspaceId ?? null;
		const [beforeDateValue, beforeId] = parsed.data.before?.split("|") ?? [];
		const before = beforeDateValue ? new Date(beforeDateValue) : null;
		if (beforeDateValue && (!before || Number.isNaN(before.getTime()))) {
			return NextResponse.json(
				{ error: "before must be a valid conversation cursor" },
				{ status: 400 },
			);
		}

		if (!workspaceId && agentId) {
			const [agent] = await db
				.select({ workspaceId: agents.workspaceId })
				.from(agents)
				.where(and(eq(agents.id, agentId), isNull(agents.archivedAt)))
				.limit(1);

			if (!agent) {
				return NextResponse.json({ error: "Agent not found" }, { status: 404 });
			}
			workspaceId = agent.workspaceId;
		}
		if (!workspaceId) {
			return NextResponse.json(
				{ error: "workspaceId or agentId must be a valid UUID" },
				{ status: 400 },
			);
		}

		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"conversations.viewOwn",
			"workspace",
			workspaceId,
		);
		if (!permission.granted) {
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		}

		const conditions = [
			eq(conversations.workspaceId, workspaceId),
			eq(conversations.userId, session.user.id),
			eq(conversations.status, "active"),
			isNull(conversations.archivedAt),
		];
		if (agentId) {
			conditions.push(eq(conversations.agentId, agentId));
		}
		if (before) {
			const cursorCondition = beforeId
				? or(
						lt(conversations.updatedAt, before),
						and(
							eq(conversations.updatedAt, before),
							lt(conversations.id, beforeId),
						),
					)
				: lt(conversations.updatedAt, before);
			if (cursorCondition) conditions.push(cursorCondition);
		}

		const rows = await db
			.select({
				id: conversations.id,
				title: conversations.title,
				agentId: conversations.agentId,
				agentVersionId: conversations.agentVersionId,
				folderId: conversations.folderId,
				pinnedAt: conversations.pinnedAt,
				sidebarOrder: conversations.sidebarOrder,
				createdAt: conversations.createdAt,
				updatedAt: conversations.updatedAt,
			})
			.from(conversations)
			.where(and(...conditions))
			.orderBy(
				sql`${conversations.pinnedAt} IS NULL`,
				sql`${conversations.sidebarOrder} IS NULL`,
				asc(conversations.sidebarOrder),
				desc(conversations.updatedAt),
				desc(conversations.id),
			)
			.limit(limit + 1);
		const hasMore = rows.length > limit;
		const list = hasMore ? rows.slice(0, limit) : rows;

		if (includeMeta === "true") {
			const folders = await db
				.select({
					id: conversationFolders.id,
					name: conversationFolders.name,
					sortOrder: conversationFolders.sortOrder,
					createdAt: conversationFolders.createdAt,
					updatedAt: conversationFolders.updatedAt,
				})
				.from(conversationFolders)
				.where(
					and(
						eq(conversationFolders.workspaceId, workspaceId),
						eq(conversationFolders.userId, session.user.id),
						isNull(conversationFolders.archivedAt),
					),
				)
				.orderBy(
					asc(conversationFolders.sortOrder),
					asc(conversationFolders.createdAt),
					asc(conversationFolders.id),
				);

			return NextResponse.json({
				conversations: list,
				folders,
				hasMore,
				nextCursor: hasMore ? createConversationCursor(list.at(-1)) : null,
			});
		}

		return NextResponse.json(list);
	} catch (error) {
		logger.error("Failed to list conversations", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
