import { NextResponse } from "next/server";
import { z } from "zod";

import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { getChatImageAttachmentBytes } from "@/modules/chat/attachments";
import { authorization } from "@/server/domain/services/authorization";

const paramsSchema = z.object({ attachmentId: z.uuid() });

function arrayBufferFromBytes(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

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

    const attachment = await getChatImageAttachmentBytes({
      attachmentId: parsed.data.attachmentId,
      userId: session.user.id,
    });
    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "agents.chat",
      "workspace",
      attachment.metadata.workspaceId,
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    return new Response(arrayBufferFromBytes(attachment.bytes), {
      headers: {
        "Content-Type": attachment.metadata.mimeType,
        "Content-Length": String(attachment.metadata.size),
        "Cache-Control": "private, max-age=300",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found|attachment|invalid/i.test(message)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    logHandledError("Failed to serve chat image", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
