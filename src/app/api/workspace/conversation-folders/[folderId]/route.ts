import { and, eq, isNull } from "drizzle-orm";
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

const paramsSchema = z.object({ folderId: z.uuid() });
const updateFolderSchema = z.object({
  name: z.string().trim().min(1).max(160),
});

async function getOwnedFolder(folderId: string, userId: string) {
  const [folder] = await db
    .select()
    .from(conversationFolders)
    .where(
      and(
        eq(conversationFolders.id, folderId),
        eq(conversationFolders.userId, userId),
        isNull(conversationFolders.archivedAt),
      ),
    )
    .limit(1);
  return folder ?? null;
}

function folderResponse(folder: typeof conversationFolders.$inferSelect) {
  return {
    id: folder.id,
    name: folder.name,
    sortOrder: folder.sortOrder,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ folderId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsedBody = updateFolderSchema.safeParse(await req.json());
      if (!parsedParams.success || !parsedBody.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const folder = await getOwnedFolder(
        parsedParams.data.folderId,
        session.user.id,
      );
      if (!folder) {
        return NextResponse.json(
          { error: "Folder not found" },
          { status: 404 },
        );
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        folder.workspaceId,
        "conversations.viewOwn",
      );
      if (forbidden) return forbidden;
      const [updated] = await db
        .update(conversationFolders)
        .set({ name: parsedBody.data.name, updatedAt: new Date() })
        .where(eq(conversationFolders.id, folder.id))
        .returning();
      return NextResponse.json({ folder: folderResponse(updated) });
    },
    { logLabel: "Failed to update conversation folder" },
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ folderId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = paramsSchema.safeParse(await params);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const folder = await getOwnedFolder(
        parsed.data.folderId,
        session.user.id,
      );
      if (!folder) {
        return NextResponse.json(
          { error: "Folder not found" },
          { status: 404 },
        );
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        folder.workspaceId,
        "conversations.viewOwn",
      );
      if (forbidden) return forbidden;
      await db.transaction(async (tx) => {
        await tx
          .update(conversations)
          .set({ folderId: null })
          .where(
            and(
              eq(conversations.folderId, folder.id),
              eq(conversations.userId, session.user.id),
            ),
          );
        await tx
          .update(conversationFolders)
          .set({ archivedAt: new Date(), updatedAt: new Date() })
          .where(eq(conversationFolders.id, folder.id));
      });
      return NextResponse.json({ ok: true });
    },
    { logLabel: "Failed to delete conversation folder" },
  );
}
