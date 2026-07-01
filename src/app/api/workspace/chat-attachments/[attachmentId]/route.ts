import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { getChatAttachmentBytes } from "@/modules/chat/attachments";

const paramsSchema = z.object({ attachmentId: z.uuid() });

function arrayBufferFromBytes(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function contentDisposition(
  kind: "chat_image" | "chat_file",
  fileName: string,
) {
  const safeFileName = fileName.replace(/["\r\n]/g, "_");
  const disposition = kind === "chat_image" ? "inline" : "attachment";
  return `${disposition}; filename="${safeFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

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
      const attachment = await getChatAttachmentBytes({
        attachmentId: parsed.data.attachmentId,
        userId: session.user.id,
      });
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        attachment.metadata.workspaceId,
        "agents.chat",
      );
      if (forbidden) return forbidden;
      return new Response(arrayBufferFromBytes(attachment.bytes), {
        headers: {
          "Content-Type": attachment.metadata.mimeType,
          "Content-Length": String(attachment.metadata.size),
          "Content-Disposition": contentDisposition(
            attachment.metadata.kind,
            attachment.metadata.fileName,
          ),
          "Cache-Control": "private, max-age=300",
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "X-Content-Type-Options": "nosniff",
        },
      });
    },
    {
      logLabel: "Failed to serve chat attachment",
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
