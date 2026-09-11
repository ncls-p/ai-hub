import { getRequestAuthContext } from "@/modules/auth/request-auth-context";
import { and, asc, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
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

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const workspaceId = req.nextUrl.searchParams.get("workspaceId");
      const parsed = z.uuid().safeParse(workspaceId);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid workspace" },
          { status: 400 },
        );
      }
      const forbidden =
        getRequestAuthContext()?.type === "api_key"
          ? await requireWorkspacePermissionAsync(
              session.user.id,
              parsed.data,
              "conversations.viewOwn",
            )
          : null;
      if (forbidden) return forbidden;
      const folders = await db
        .select()
        .from(conversationFolders)
        .where(
          and(
            getRequestAuthContext()?.type === "api_key"
              ? eq(conversationFolders.workspaceId, parsed.data)
              : undefined,
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
    },
    { logLabel: "Failed to list conversation folders" },
  );
}

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = createFolderSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const forbidden =
        getRequestAuthContext()?.type === "api_key"
          ? await requireWorkspacePermissionAsync(
              session.user.id,
              parsed.data.workspaceId,
              "conversations.viewOwn",
            )
          : null;
      if (forbidden) return forbidden;
      const [folder] = await db
        .insert(conversationFolders)
        .values({
          workspaceId: parsed.data.workspaceId,
          userId: session.user.id,
          name: parsed.data.name,
        })
        .returning();
      return NextResponse.json({ folder: folderResponse(folder) });
    },
    { logLabel: "Failed to create conversation folder" },
  );
}
