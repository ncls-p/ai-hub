import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";
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
  req: Request,
  { params }: { params: Promise<{ folderId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "conversations.viewOwn",
      "workspace",
      folder.workspaceId,
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    const [updated] = await db
      .update(conversationFolders)
      .set({ name: parsedBody.data.name, updatedAt: new Date() })
      .where(eq(conversationFolders.id, folder.id))
      .returning();

    return NextResponse.json({ folder: folderResponse(updated) });
  } catch (error) {
    logHandledError("Failed to update conversation folder", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ folderId: string }> },
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

    const folder = await getOwnedFolder(parsed.data.folderId, session.user.id);
    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "conversations.viewOwn",
      "workspace",
      folder.workspaceId,
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

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
  } catch (error) {
    logHandledError("Failed to delete conversation folder", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
