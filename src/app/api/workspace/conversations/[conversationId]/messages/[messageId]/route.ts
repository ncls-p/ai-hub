import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { encryptValue } from "@/lib/crypto";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
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
  const permission = await requireWorkspacePermissionAsync(
    input.userId,
    conversation.workspaceId,
    "conversations.viewOwn",
  );
  if (permission) return null;
  return conversation;
}

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ conversationId: string; messageId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
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
        return NextResponse.json(
          { error: "Message not found" },
          { status: 404 },
        );
      }
      await db
        .delete(messageParts)
        .where(eq(messageParts.messageId, messageId));
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
    },
    { logLabel: "Failed to update message" },
  );
}

export async function DELETE(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ conversationId: string; messageId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
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
        return NextResponse.json(
          { error: "Message not found" },
          { status: 404 },
        );
      }
      await db.delete(messages).where(eq(messages.id, messageId));
      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversation.id));
      return NextResponse.json({ ok: true });
    },
    { logLabel: "Failed to delete message" },
  );
}
