import { getRequestAuthContext } from "@/modules/auth/request-auth-context";
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

async function applyConversationSidebarOrder(input: {
  conversationIds: string[];
  folderId: string | null;
  pinned?: boolean;
}) {
  try {
    await db.transaction(async (tx) => {
      for (const [index, conversationId] of input.conversationIds.entries()) {
        await tx
          .update(conversations)
          .set({
            folderId: input.folderId,
            sidebarOrder: (index + 1) * 1000,
            ...(input.pinned === undefined
              ? {}
              : { pinnedAt: input.pinned ? new Date() : null }),
          })
          .where(eq(conversations.id, conversationId));
      }
    });
  } catch (error) {
    throw new Error("Unable to reorder conversations", { cause: error });
  }
}

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = reorderConversationsSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }

      const { workspaceId, folderId, pinned, conversationIds } = parsed.data;
      const personalHistory = getRequestAuthContext()?.type !== "api_key";
      const forbidden = !personalHistory
        ? await requireWorkspacePermissionAsync(
            session.user.id,
            workspaceId,
            "conversations.viewOwn",
          )
        : null;
      if (forbidden) return forbidden;

      if (folderId) {
        const [folder] = await db
          .select({ id: conversationFolders.id })
          .from(conversationFolders)
          .where(
            and(
              eq(conversationFolders.id, folderId),
              !personalHistory
                ? eq(conversationFolders.workspaceId, workspaceId)
                : undefined,
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
            !personalHistory
              ? eq(conversations.workspaceId, workspaceId)
              : undefined,
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

      await applyConversationSidebarOrder({
        conversationIds,
        folderId,
        pinned,
      });

      return NextResponse.json({ ok: true });
    },
    { logLabel: "Failed to reorder conversations" },
  );
}
