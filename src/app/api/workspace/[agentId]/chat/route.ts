import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { encryptValue } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
	agents,
	conversations,
	messageParts,
	messages,
} from "@/server/infrastructure/db/schema";

const chatRequestSchema = z.object({
	content: z.string().trim().min(1).max(32_000),
	conversationId: z.uuid().optional(),
});

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ agentId: string }> },
) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { agentId } = await params;
		const body = await req.json();
		const parsed = chatRequestSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ error: "Invalid input", details: parsed.error.issues },
				{ status: 400 },
			);
		}

		const { content, conversationId } = parsed.data;
		const [agent] = await db
			.select()
			.from(agents)
			.where(eq(agents.id, agentId))
			.limit(1);

		if (!agent) {
			return NextResponse.json({ error: "Agent not found" }, { status: 404 });
		}

		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"agents.chat",
			"workspace",
			agent.workspaceId,
		);

		if (!permission.granted) {
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		}

		let conversation:
			| (typeof conversations.$inferSelect)
			| null
			| undefined;

		if (conversationId) {
			[conversation] = await db
				.select()
				.from(conversations)
				.where(
					and(
						eq(conversations.id, conversationId),
						eq(conversations.workspaceId, agent.workspaceId),
						eq(conversations.userId, session.user.id),
					),
				)
				.limit(1);
		}

		if (!conversation) {
			const [newConversation] = await db
				.insert(conversations)
				.values({
					workspaceId: agent.workspaceId,
					agentId,
					agentVersionId: agent.activeVersionId,
					userId: session.user.id,
					title: content.slice(0, 100),
					status: "active",
				})
				.returning();
			conversation = newConversation;
		}

		const encryptedContent = await encryptValue(content);
		const [userMessage] = await db
			.insert(messages)
			.values({
				conversationId: conversation.id,
				role: "user",
				status: "completed",
			})
			.returning();

		await db.insert(messageParts).values({
			messageId: userMessage.id,
			type: "text",
			contentEncrypted: encryptedContent,
			sortOrder: 0,
		});

		return NextResponse.json({
			conversationId: conversation.id,
			messageId: userMessage.id,
			reply: "AI response streaming will be implemented in Phase 3.",
		});
	} catch (error) {
		logger.error("Chat request failed", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
