import { and, eq, inArray, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { db } from "@/server/infrastructure/db";
import {
  conversationFolders,
  conversations,
} from "@/server/infrastructure/db/schema";

const reorderConversationsSchema = z.object({
  workspaceId: z.uuid(),
  folderId: z.uuid().nullable(),
  pinned: z.boolean().optional(),
  conversationIds: z.array(z.uuid()).min(1).max(100),
});

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = reorderConversationsSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }

      const { workspaceId, folderId, pinned, conversationIds } = parsed.data;
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        workspaceId,
        "conversations.viewOwn",
      );
      if (forbidden) return forbidden;

      if (folderId) {
        const [folder] = await db
          .select({ id: conversationFolders.id })
          .from(conversationFolders)
          .where(
            and(
              eq(conversationFolders.id, folderId),
              eq(conversationFolders.workspaceId, workspaceId),
              eq(conversationFolders.userId, session.user.id),
              isNull(conversationFolders.archivedAt),
            ),
          )
          .limit(1);
        if (!folder) {
          return NextResponse.json(
            { error: "Folder not found" },
            { status: 404 },
          );
        }
      }

      const uniqueIds = [...new Set(conversationIds)];
      if (uniqueIds.length !== conversationIds.length) {
        return NextResponse.json(
          { error: "Duplicate conversations" },
          { status: 400 },
        );
      }

      const ownedRows = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            inArray(conversations.id, conversationIds),
            eq(conversations.workspaceId, workspaceId),
            eq(conversations.userId, session.user.id),
            eq(conversations.status, "active"),
            isNull(conversations.archivedAt),
          ),
        );
      if (ownedRows.length !== conversationIds.length) {
        return NextResponse.json(
          { error: "Conversation not found" },
          { status: 404 },
        );
      }

      await db.transaction(async (tx) => {
        for (const [index, conversationId] of conversationIds.entries()) {
          await tx
            .update(conversations)
            .set({
              folderId,
              sidebarOrder: (index + 1) * 1000,
              ...(pinned === undefined
                ? {}
                : { pinnedAt: pinned ? new Date() : null }),
            })
            .where(eq(conversations.id, conversationId));
        }
      });

      return NextResponse.json({ ok: true });
    },
    { logLabel: "Failed to reorder conversations" },
  );
}
