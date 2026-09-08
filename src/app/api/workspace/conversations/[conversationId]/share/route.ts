import { getAuthorizedConversation } from "../conversation-route-access";
import { handleRoute } from "@/lib/route-handler";
import {
  listConversationShares,
  upsertConversationShare,
} from "@/modules/chat/conversation-sharing";
import { db } from "@/server/infrastructure/db";
import {
  conversationShares,
  conversations,
} from "@/server/infrastructure/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const paramsSchema = z.object({ conversationId: z.uuid() });
const shareSchema = z.object({
  targetEmail: z.email(),
  canContinue: z.boolean().default(false),
  continuationMode: z.enum(["shared", "fork"]).default("fork"),
});
const publicSchema = z.object({
  public: z.boolean(),
  includeFiles: z.boolean().optional(),
});

async function getOwnedConversation(conversationId: string, userId: string) {
  const access = await getAuthorizedConversation(
    userId,
    Promise.resolve({ conversationId }),
    "conversations.viewOwn",
  );
  return access.ok && access.access.role === "owner"
    ? access.conversation
    : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  return handleRoute(req, async ({ session }) => {
    const parsed = paramsSchema.safeParse(await params);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const conversation = await getOwnedConversation(
      parsed.data.conversationId,
      session.user.id,
    );
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      shares: await listConversationShares(conversation.id, session.user.id),
      publicShareId: conversation.publicShareId,
      publicSharedAt: conversation.publicSharedAt,
      publicShareIncludesFiles: conversation.publicShareIncludesFiles,
      isEphemeral: conversation.isEphemeral,
    });
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsedBody = shareSchema.safeParse(await req.json());
      if (!parsedParams.success || !parsedBody.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const conversation = await getOwnedConversation(
        parsedParams.data.conversationId,
        session.user.id,
      );
      if (!conversation) {
        return NextResponse.json(
          { error: "Conversation not found" },
          { status: 404 },
        );
      }
      if (conversation.isEphemeral) {
        return NextResponse.json(
          { error: "Ephemeral conversations cannot be shared" },
          { status: 409 },
        );
      }
      return NextResponse.json(
        await upsertConversationShare({
          conversation,
          ownerUserId: session.user.id,
          ...parsedBody.data,
        }),
        { status: 201 },
      );
    },
    {
      expectedError: (error) =>
        NextResponse.json(
          { error: error instanceof Error ? error.message : "Unable to share" },
          { status: 404 },
        ),
    },
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  return handleRoute(req, async ({ session }) => {
    const parsedParams = paramsSchema.safeParse(await params);
    const parsedBody = publicSchema.safeParse(await req.json());
    if (!parsedParams.success || !parsedBody.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const conversation = await getOwnedConversation(
      parsedParams.data.conversationId,
      session.user.id,
    );
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    if (conversation.isEphemeral && parsedBody.data.public) {
      return NextResponse.json(
        { error: "Ephemeral conversations cannot be public" },
        { status: 409 },
      );
    }
    const publicShareId = parsedBody.data.public
      ? (conversation.publicShareId ?? crypto.randomUUID())
      : null;
    const publicSharedAt = parsedBody.data.public ? new Date() : null;
    await db
      .update(conversations)
      .set({
        publicShareId,
        publicSharedAt,
        publicShareIncludesFiles:
          parsedBody.data.public &&
          (parsedBody.data.includeFiles ??
            conversation.publicShareIncludesFiles),
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversation.id));
    return NextResponse.json({ publicShareId, publicSharedAt });
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  return handleRoute(req, async ({ session }) => {
    const parsed = paramsSchema.safeParse(await params);
    const sharedWithUserId = req.nextUrl.searchParams.get("userId");
    if (!parsed.success || !z.uuid().safeParse(sharedWithUserId).success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const conversation = await getOwnedConversation(
      parsed.data.conversationId,
      session.user.id,
    );
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    await db
      .delete(conversationShares)
      .where(
        and(
          eq(conversationShares.conversationId, conversation.id),
          eq(conversationShares.sharedWithUserId, sharedWithUserId!),
        ),
      );
    return NextResponse.json({ ok: true });
  });
}
