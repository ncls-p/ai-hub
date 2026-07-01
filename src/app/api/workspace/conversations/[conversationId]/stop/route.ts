import { and, desc, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  abortChatStream,
  hasActiveChatStream,
} from "@/modules/chat/stream-bus";
import { db } from "@/server/infrastructure/db";
import { conversations, messages } from "@/server/infrastructure/db/schema";

const paramsSchema = z.object({ conversationId: z.uuid() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
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

      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        conversation.workspaceId,
        "conversations.viewOwn",
      );
      if (forbidden) return forbidden;

      const [streamingMessage] = await db
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversationId),
            eq(messages.role, "assistant"),
            eq(messages.status, "streaming"),
          ),
        )
        .orderBy(desc(messages.createdAt))
        .limit(1);

      if (!streamingMessage) {
        return NextResponse.json({ stopped: false });
      }

      const stopped = hasActiveChatStream(streamingMessage.id)
        ? abortChatStream(streamingMessage.id)
        : false;

      await db
        .update(messages)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(messages.id, streamingMessage.id));

      return NextResponse.json({ stopped, messageId: streamingMessage.id });
    },
    { logLabel: "Failed to stop chat generation" },
  );
}
