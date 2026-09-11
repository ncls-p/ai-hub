import { getRequestAuthContext } from "@/modules/auth/request-auth-context";
import { handleRoute } from "@/lib/route-handler";
import { getConversationMessages } from "@/modules/agent/use-cases";
import { toAiSdkUIMessages } from "@/modules/chat/ai-sdk-ui-messages";
import { getConversationBranchNavigation } from "@/modules/chat/conversation-branches";
import { withConversationGraphLock } from "@/modules/chat/conversation-graph-lock";
import {
  ephemeralExpiresAt,
  isEphemeralTtlMinutes,
} from "@/modules/chat/ephemeral-retention";
import { getUsageImpactSetting } from "@/modules/provider/usage-impact-settings";
import { db } from "@/server/infrastructure/db";
import {
  conversationFolders,
  conversations,
} from "@/server/infrastructure/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAuthorizedConversation } from "./conversation-route-access";
const updateConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(512).optional(),
    folderId: z.uuid().nullable().optional(),
    pinned: z.boolean().optional(),
    sidebarOrder: z.number().int().nullable().optional(),
    ephemeralTtlMinutes: z
      .number()
      .int()
      .refine(isEphemeralTtlMinutes)
      .optional(),
    makePersistent: z.literal(true).optional(),
  })
  .refine(
    (value) =>
      value.ephemeralTtlMinutes === undefined ||
      value.makePersistent === undefined,
    {
      message:
        "A conversation cannot be made persistent while changing its temporary retention",
    },
  )
  .refine(
    (value) =>
      value.title !== undefined ||
      value.folderId !== undefined ||
      value.pinned !== undefined ||
      value.sidebarOrder !== undefined ||
      value.ephemeralTtlMinutes !== undefined ||
      value.makePersistent !== undefined,
    { message: "At least one field is required" },
  );

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const access = await getAuthorizedConversation(
        session.user.id,
        params,
        "conversations.viewOwn",
      );
      if (!access.ok) return access.response;
      const { conversation, conversationId } = access;

      const [storedMessages, usageImpactSetting] = await Promise.all([
        getConversationMessages(conversationId),
        getUsageImpactSetting(),
      ]);
      const branchNavigation = await getConversationBranchNavigation({
        conversation,
        messageIds: storedMessages.map(({ id }) => id),
        userId: session.user.id,
      });
      const messages = storedMessages.map((message) => ({
        ...message,
        branch: branchNavigation.get(message.id),
        parts: usageImpactSetting.enabled
          ? message.parts
          : message.parts.filter((part) => part.type !== "impact"),
        createdAt: new Date(message.createdAt).toISOString(),
      }));
      const uiMessages = toAiSdkUIMessages(messages);

      return NextResponse.json({
        conversation: {
          id: conversation.id,
          workspaceId:
            conversation.billingWorkspaceId ?? conversation.workspaceId,
          agentId: conversation.agentId,
          title: conversation.title,
          folderId: conversation.folderId,
          pinnedAt: conversation.pinnedAt,
          sidebarOrder: conversation.sidebarOrder,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          isOwner: access.access.role === "owner",
          canContinue: access.access.canContinue,
          continuationMode: access.access.continuationMode,
          isEphemeral: conversation.isEphemeral,
          ephemeralTtlMinutes: conversation.ephemeralTtlMinutes,
          expiresAt: conversation.expiresAt,
          publicShareId:
            access.access.role === "owner" ? conversation.publicShareId : null,
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
      const parsedParams = z
        .object({ conversationId: z.uuid() })
        .safeParse(await params);
      const parsedBody = updateConversationSchema.safeParse(await req.json());
      if (!parsedParams.success || !parsedBody.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }

      const { conversationId } = parsedParams.data;
      const access = await getAuthorizedConversation(
        session.user.id,
        Promise.resolve({ conversationId }),
        "conversations.viewOwn",
      );
      if (!access.ok) return access.response;
      const { conversation } = access;
      if (access.access.role !== "owner") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      if (parsedBody.data.folderId) {
        const [folder] = await db
          .select({ id: conversationFolders.id })
          .from(conversationFolders)
          .where(
            and(
              eq(conversationFolders.id, parsedBody.data.folderId),
              getRequestAuthContext()?.type === "api_key"
                ? eq(conversationFolders.workspaceId, conversation.workspaceId)
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
      if (
        parsedBody.data.ephemeralTtlMinutes !== undefined &&
        !conversation.isEphemeral
      ) {
        return NextResponse.json(
          { error: "Only temporary conversations have a retention period" },
          { status: 409 },
        );
      }
      if (parsedBody.data.makePersistent && !conversation.isEphemeral) {
        return NextResponse.json(
          { error: "Conversation is already persistent" },
          { status: 409 },
        );
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
      if (parsedBody.data.ephemeralTtlMinutes !== undefined) {
        patch.ephemeralTtlMinutes = parsedBody.data.ephemeralTtlMinutes;
        patch.expiresAt = ephemeralExpiresAt(
          parsedBody.data.ephemeralTtlMinutes,
        );
        patch.updatedAt = new Date();
      }
      if (parsedBody.data.makePersistent) {
        patch.isEphemeral = false;
        patch.expiresAt = null;
        patch.updatedAt = new Date();
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
      const access = await getAuthorizedConversation(
        session.user.id,
        params,
        "conversations.viewOwn",
      );
      if (!access.ok) return access.response;
      const { conversationId } = access;
      if (access.access.role !== "owner") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      await withConversationGraphLock(conversationId, () =>
        db
          .update(conversations)
          .set({
            status: "archived",
            archivedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(conversations.id, conversationId)),
      );

      return NextResponse.json({ ok: true });
    },
    { logLabel: "Failed to delete conversation" },
  );
}
