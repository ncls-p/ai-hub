import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { requestSkipNextChatSuggestions } from "@/modules/chat/suggestion-skip";
import { db } from "@/server/infrastructure/db";
import { conversations } from "@/server/infrastructure/db/schema";

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
      requestSkipNextChatSuggestions(conversationId);
      return NextResponse.json({ skipped: true });
    },
    { logLabel: "Failed to skip chat suggestions" },
  );
}
