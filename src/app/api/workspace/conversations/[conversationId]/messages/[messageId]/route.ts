import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { encryptValue } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
	conversations,
	messageParts,
	messages,
} from "@/server/infrastructure/db/schema";

const paramsSchema = z.object({
	conversationId: z.uuid(),
	messageId: z.uuid(),
});

const updateMessageSchema = z.object({
	content: z.string().trim().min(1).max(32_000),
});

async function getAuthorizedConversation(input: {
	conversationId: string;
	userId: string;
}) {
	const [conversation] = await db
		.select()
		.from(conversations)
		.where(
			and(
				eq(conversations.id, input.conversationId),
				eq(conversations.userId, input.userId),
				eq(conversations.status, "active"),
				isNull(conversations.archivedAt),
			),
		)
		.limit(1);

	if (!conversation) return null;

	const permission = await authorization.requirePermission(
		{ principalType: "user", principalId: input.userId },
		"conversations.viewOwn",
		"workspace",
		conversation.workspaceId,
	);

	if (!permission.granted) return null;
	return conversation;
}

export async function PATCH(
	req: Request,
	{ params }: { params: Promise<{ conversationId: string; messageId: string }> },
) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const parsedParams = paramsSchema.safeParse(await params);
		const parsedBody = updateMessageSchema.safeParse(await req.json());
		if (!parsedParams.success || !parsedBody.success) {
			return NextResponse.json({ error: "Invalid request" }, { status: 400 });
		}

		const { conversationId, messageId } = parsedParams.data;
		const conversation = await getAuthorizedConversation({
			conversationId,
			userId: session.user.id,
		});
		if (!conversation) {
			return NextResponse.json(
				{ error: "Conversation not found" },
				{ status: 404 },
			);
		}

		const [message] = await db
			.select()
			.from(messages)
			.where(
				and(
					eq(messages.id, messageId),
					eq(messages.conversationId, conversation.id),
				),
			)
			.limit(1);

		if (!message || !["user", "assistant"].includes(message.role)) {
			return NextResponse.json({ error: "Message not found" }, { status: 404 });
		}

		await db.delete(messageParts).where(eq(messageParts.messageId, messageId));
		await db.insert(messageParts).values({
			messageId,
			type: "text",
			contentEncrypted: await encryptValue(parsedBody.data.content),
			sortOrder: 0,
		});
		await db
			.update(messages)
			.set({ status: "completed", completedAt: new Date() })
			.where(eq(messages.id, messageId));
		await db
			.update(conversations)
			.set({ updatedAt: new Date() })
			.where(eq(conversations.id, conversation.id));

		return NextResponse.json({ ok: true });
	} catch (error) {
		logger.error("Failed to update message", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function DELETE(
	_req: Request,
	{ params }: { params: Promise<{ conversationId: string; messageId: string }> },
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

		const { conversationId, messageId } = parsed.data;
		const conversation = await getAuthorizedConversation({
			conversationId,
			userId: session.user.id,
		});
		if (!conversation) {
			return NextResponse.json(
				{ error: "Conversation not found" },
				{ status: 404 },
			);
		}

		const [message] = await db
			.select({ id: messages.id })
			.from(messages)
			.where(
				and(
					eq(messages.id, messageId),
					eq(messages.conversationId, conversation.id),
				),
			)
			.limit(1);

		if (!message) {
			return NextResponse.json({ error: "Message not found" }, { status: 404 });
		}

		await db.delete(messages).where(eq(messages.id, messageId));
		await db
			.update(conversations)
			.set({ updatedAt: new Date() })
			.where(eq(conversations.id, conversation.id));

		return NextResponse.json({ ok: true });
	} catch (error) {
		logger.error("Failed to delete message", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
