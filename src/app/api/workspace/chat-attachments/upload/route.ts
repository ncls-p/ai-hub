import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
  createChatImageAttachment,
  maxChatImageBytes,
} from "@/modules/chat/attachments";
import { authorization } from "@/server/domain/services/authorization";

const uploadSchema = z.object({
  workspaceId: z.uuid(),
});

const maxUploadRequestBytes = maxChatImageBytes + 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "agents.chat",
      "workspace",
      parsed.data.workspaceId,
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    const uploadedFile = formData.get("file");
    if (!(uploadedFile instanceof File)) {
      return NextResponse.json(
        { error: "Image file is required" },
        { status: 400 },
      );
    }
    if (uploadedFile.size > maxChatImageBytes) {
      return NextResponse.json(
        { error: "Image file is too large. Maximum size is 8 MB." },
        { status: 400 },
      );
    }

    const attachment = await createChatImageAttachment({
      workspaceId: parsed.data.workspaceId,
      userId: session.user.id,
      fileName: uploadedFile.name,
      bytes: new Uint8Array(await uploadedFile.arrayBuffer()),
    });

    return NextResponse.json({ attachment });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/image|file|too large|unsupported|attachment/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    logHandledError("Failed to upload chat image", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
