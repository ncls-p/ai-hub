import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  getChatAttachment,
  getChatAttachmentExtractedText,
  publicChatAttachment,
} from "@/modules/chat/attachments";

const paramsSchema = z.object({ attachmentId: z.uuid() });

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
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
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        metadata.workspaceId,
        "agents.chat",
      );
      if (forbidden) return forbidden;
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
    },
    {
      logLabel: "Failed to serve extracted chat attachment text",
      expectedError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (/not found|attachment|invalid/i.test(message)) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 },
        );
      },
    },
  );
}
