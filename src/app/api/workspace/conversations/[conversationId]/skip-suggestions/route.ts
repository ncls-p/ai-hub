import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { requestSkipNextChatSuggestions } from "@/modules/chat/suggestion-skip";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { conversations } from "@/server/infrastructure/db/schema";

const paramsSchema = z.object({ conversationId: z.uuid() });

export async function POST(
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

    requestSkipNextChatSuggestions(conversationId);
    return NextResponse.json({ skipped: true });
  } catch (error) {
    logHandledError("Failed to skip chat suggestions", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
