import { and, asc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { conversationFolders } from "@/server/infrastructure/db/schema";

const createFolderSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().trim().min(1).max(160),
});

function folderResponse(folder: typeof conversationFolders.$inferSelect) {
  return {
    id: folder.id,
    name: folder.name,
    sortOrder: folder.sortOrder,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
}

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = new URL(req.url).searchParams.get("workspaceId");
    const parsed = z.uuid().safeParse(workspaceId);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid workspace" }, { status: 400 });
    }

    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "conversations.viewOwn",
      "workspace",
      parsed.data,
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    const folders = await db
      .select()
      .from(conversationFolders)
      .where(
        and(
          eq(conversationFolders.workspaceId, parsed.data),
          eq(conversationFolders.userId, session.user.id),
          isNull(conversationFolders.archivedAt),
        ),
      )
      .orderBy(
        asc(conversationFolders.sortOrder),
        asc(conversationFolders.createdAt),
        asc(conversationFolders.id),
      );

    return NextResponse.json({ folders: folders.map(folderResponse) });
  } catch (error) {
    logHandledError("Failed to list conversation folders", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = createFolderSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "conversations.viewOwn",
      "workspace",
      parsed.data.workspaceId,
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    const [folder] = await db
      .insert(conversationFolders)
      .values({
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
        name: parsed.data.name,
      })
      .returning();

    return NextResponse.json({ folder: folderResponse(folder) });
  } catch (error) {
    logHandledError("Failed to create conversation folder", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
