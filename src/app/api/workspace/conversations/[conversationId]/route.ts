import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { getConversationMessages } from "@/modules/agent/use-cases";
import { toAiSdkUIMessages } from "@/modules/chat/ai-sdk-ui-messages";
import { db } from "@/server/infrastructure/db";
import {
  conversationFolders,
  conversations,
} from "@/server/infrastructure/db/schema";

const paramsSchema = z.object({ conversationId: z.uuid() });
const updateConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(512).optional(),
    folderId: z.uuid().nullable().optional(),
    pinned: z.boolean().optional(),
    sidebarOrder: z.number().int().nullable().optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.folderId !== undefined ||
      value.pinned !== undefined ||
      value.sidebarOrder !== undefined,
    { message: "At least one field is required" },
  );

export async function GET(
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

      const messages = (await getConversationMessages(conversationId)).map(
        (message) => ({
          ...message,
          createdAt: new Date(message.createdAt).toISOString(),
        }),
      );
      const uiMessages = toAiSdkUIMessages(messages);

      return NextResponse.json({
        conversation: {
          id: conversation.id,
          agentId: conversation.agentId,
          title: conversation.title,
          folderId: conversation.folderId,
          pinnedAt: conversation.pinnedAt,
          sidebarOrder: conversation.sidebarOrder,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
        },
        messages,
        uiMessages,
      });
    },
    { logLabel: "Failed to get conversation" },
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsedBody = updateConversationSchema.safeParse(await req.json());
      if (!parsedParams.success || !parsedBody.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }

      const { conversationId } = parsedParams.data;
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

      if (parsedBody.data.folderId) {
        const [folder] = await db
          .select({ id: conversationFolders.id })
          .from(conversationFolders)
          .where(
            and(
              eq(conversationFolders.id, parsedBody.data.folderId),
              eq(conversationFolders.workspaceId, conversation.workspaceId),
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

      const patch: Partial<typeof conversations.$inferInsert> = {};
      if (parsedBody.data.title !== undefined) {
        patch.title = parsedBody.data.title;
        patch.updatedAt = new Date();
      }
      if (parsedBody.data.folderId !== undefined) {
        patch.folderId = parsedBody.data.folderId;
      }
      if (parsedBody.data.pinned !== undefined) {
        patch.pinnedAt = parsedBody.data.pinned ? new Date() : null;
      }
      if (parsedBody.data.sidebarOrder !== undefined) {
        patch.sidebarOrder = parsedBody.data.sidebarOrder;
      }

      const [updated] = await db
        .update(conversations)
        .set(patch)
        .where(eq(conversations.id, conversationId))
        .returning();

      return NextResponse.json({ conversation: updated });
    },
    { logLabel: "Failed to update conversation" },
  );
}

export async function DELETE(
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

      await db
        .update(conversations)
        .set({
          status: "archived",
          archivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversationId));

      return NextResponse.json({ ok: true });
    },
    { logLabel: "Failed to delete conversation" },
  );
}
