import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { getConversationMessages } from "@/modules/agent/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { conversations } from "@/server/infrastructure/db/schema";

const paramsSchema = z.object({ conversationId: z.uuid() });
const updateConversationSchema = z.object({
	title: z.string().trim().min(1).max(512),
});

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ conversationId: string }> },
) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const parsed = paramsSchema.safeParse(await params);
		if (!parsed.success) {
			return NextResponse.json({ error: "Invalid request" }, { status: 400 });
		}

		const { conversationId } = parsed.data;
		const [conversation] = await db
			.select()
			.from(conversations)
			.where(
				and(
					eq(conversations.id, conversationId),
					eq(conversations.userId, session.user.id),
					eq(conversations.status, "active"),
					isNull(conversations.archivedAt),
				),
			)
			.limit(1);

		if (!conversation) {
			return NextResponse.json(
				{ error: "Conversation not found" },
				{ status: 404 },
			);
		}

		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"conversations.viewOwn",
			"workspace",
			conversation.workspaceId,
		);
		if (!permission.granted) {
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		}

		const messages = await getConversationMessages(conversationId);

		return NextResponse.json({
			conversation: {
				id: conversation.id,
				agentId: conversation.agentId,
				title: conversation.title,
				createdAt: conversation.createdAt,
				updatedAt: conversation.updatedAt,
			},
			messages,
		});
	} catch (error) {
		logger.error("Failed to get conversation", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function PATCH(
	req: Request,
	{ params }: { params: Promise<{ conversationId: string }> },
) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const parsedParams = paramsSchema.safeParse(await params);
		const parsedBody = updateConversationSchema.safeParse(await req.json());
		if (!parsedParams.success || !parsedBody.success) {
			return NextResponse.json({ error: "Invalid request" }, { status: 400 });
		}

		const { conversationId } = parsedParams.data;
		const [conversation] = await db
			.select()
			.from(conversations)
			.where(
				and(
					eq(conversations.id, conversationId),
					eq(conversations.userId, session.user.id),
					eq(conversations.status, "active"),
					isNull(conversations.archivedAt),
				),
			)
			.limit(1);

		if (!conversation) {
			return NextResponse.json(
				{ error: "Conversation not found" },
				{ status: 404 },
			);
		}

		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"conversations.viewOwn",
			"workspace",
			conversation.workspaceId,
		);
		if (!permission.granted) {
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		}

		const [updated] = await db
			.update(conversations)
			.set({ title: parsedBody.data.title, updatedAt: new Date() })
			.where(eq(conversations.id, conversationId))
			.returning();

		return NextResponse.json({ conversation: updated });
	} catch (error) {
		logger.error("Failed to update conversation", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function DELETE(
	_req: Request,
	{ params }: { params: Promise<{ conversationId: string }> },
) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const parsed = paramsSchema.safeParse(await params);
		if (!parsed.success) {
			return NextResponse.json({ error: "Invalid request" }, { status: 400 });
		}

		const { conversationId } = parsed.data;
		const [conversation] = await db
			.select()
			.from(conversations)
			.where(
				and(
					eq(conversations.id, conversationId),
					eq(conversations.userId, session.user.id),
					eq(conversations.status, "active"),
					isNull(conversations.archivedAt),
				),
			)
			.limit(1);

		if (!conversation) {
			return NextResponse.json(
				{ error: "Conversation not found" },
				{ status: 404 },
			);
		}

		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"conversations.viewOwn",
			"workspace",
			conversation.workspaceId,
		);
		if (!permission.granted) {
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		}

		await db
			.update(conversations)
			.set({
				status: "archived",
				archivedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(conversations.id, conversationId));

		return NextResponse.json({ ok: true });
	} catch (error) {
		logger.error("Failed to delete conversation", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
