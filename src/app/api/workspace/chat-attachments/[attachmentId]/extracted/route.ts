import { NextResponse } from "next/server";
import { z } from "zod";

import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
  getChatAttachment,
  getChatAttachmentExtractedText,
  publicChatAttachment,
} from "@/modules/chat/attachments";
import { authorization } from "@/server/domain/services/authorization";

const paramsSchema = z.object({ attachmentId: z.uuid() });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
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

    const metadata = await getChatAttachment(parsed.data.attachmentId);
    if (metadata.kind !== "chat_file") {
      return NextResponse.json(
        { error: "Attachment has no extracted text" },
        { status: 400 },
      );
    }

    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "agents.chat",
      "workspace",
      metadata.workspaceId,
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    const extracted = await getChatAttachmentExtractedText({
      attachmentId: metadata.id,
      workspaceId: metadata.workspaceId,
      userId: session.user.id,
    });

    return NextResponse.json(
      {
        attachment: publicChatAttachment(extracted.metadata),
        text: extracted.text,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=60",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found|attachment|invalid/i.test(message)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    logHandledError(
      "Failed to serve extracted chat attachment text",
      {},
      error as Error,
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
