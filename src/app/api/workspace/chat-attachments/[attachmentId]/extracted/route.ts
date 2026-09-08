import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canReadConversationAsset } from "@/modules/chat/conversation-asset-access";

import { handleRoute } from "@/lib/route-handler";
import {
  getChatAttachment,
  getChatAttachmentExtractedText,
  maxChatAttachmentPreviewChars,
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
      if (
        !(await canReadConversationAsset(
          metadata,
          session.user.id,
          "attachment",
        ))
      ) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (metadata.kind !== "chat_file") {
        return NextResponse.json(
          { error: "Attachment has no extracted text" },
          { status: 400 },
        );
      }
      const extracted = await getChatAttachmentExtractedText({
        attachmentId: metadata.id,
        workspaceId: metadata.workspaceId,
        userId: metadata.createdByUserId,
      });
      const previewTruncated =
        extracted.text.length > maxChatAttachmentPreviewChars;
      const previewText = previewTruncated
        ? `${extracted.text.slice(0, maxChatAttachmentPreviewChars)}\n\n> Preview truncated. Use the document explorer in the code sandbox to navigate the complete extraction.`
        : extracted.text;
      return NextResponse.json(
        {
          attachment: publicChatAttachment(extracted.metadata),
          text: previewText,
          previewTruncated,
        },
        {
          headers: {
            "Cache-Control": "no-store",
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
