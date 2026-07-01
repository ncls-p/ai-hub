import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  createChatAttachment,
  maxChatAttachmentBytes,
} from "@/modules/chat/attachments";

const uploadSchema = z.object({
  workspaceId: z.uuid(),
});

const maxUploadRequestBytes = maxChatAttachmentBytes + 1024 * 1024;

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const contentLength = Number(req.headers.get("content-length") ?? "0");
      if (contentLength > maxUploadRequestBytes) {
        return NextResponse.json(
          { error: "Upload request is too large." },
          { status: 413 },
        );
      }

      const formData = await req.formData();
      const parsed = uploadSchema.safeParse({
        workspaceId: formData.get("workspaceId"),
      });
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }

      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "agents.chat",
      );
      if (forbidden) return forbidden;

      const uploadedFile = formData.get("file");
      if (!(uploadedFile instanceof File)) {
        return NextResponse.json(
          { error: "Attachment file is required" },
          { status: 400 },
        );
      }
      if (uploadedFile.size > maxChatAttachmentBytes) {
        return NextResponse.json(
          { error: "Attachment file is too large. Maximum size is 25 MB." },
          { status: 400 },
        );
      }

      const attachment = await createChatAttachment({
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
        fileName: uploadedFile.name,
        mimeType: uploadedFile.type,
        bytes: new Uint8Array(await uploadedFile.arrayBuffer()),
      });

      return NextResponse.json({ attachment });
    },
    {
      logLabel: "Failed to upload chat attachment",
      expectedError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (/image|file|too large|unsupported|attachment|read/i.test(message)) {
          return NextResponse.json({ error: message }, { status: 400 });
        }
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 },
        );
      },
    },
  );
}
