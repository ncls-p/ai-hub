import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPublicConversationFileAccess } from "@/modules/chat/public-conversation-sharing";
import {
  getChatAttachment,
  getChatAttachmentBytes,
} from "@/modules/chat/attachments";
import {
  getCodeWorkspace,
  createCodeWorkspaceZip,
} from "@/modules/code-workspace/storage";
import { logHandledError } from "@/lib/logger";

const paramsSchema = z.object({ publicShareId: z.uuid(), assetId: z.uuid() });
const notFound = () =>
  NextResponse.json(
    { error: "Not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ publicShareId: string; assetId: string }> },
) {
  const parsed = paramsSchema.safeParse(await params);
  const kind = z
    .enum(["attachment", "code_workspace"])
    .safeParse(req.nextUrl.searchParams.get("kind"));
  if (!parsed.success || !kind.success) return notFound();
  const { publicShareId, assetId } = parsed.data;
  const access = await getPublicConversationFileAccess(
    publicShareId,
    assetId,
    kind.data,
  );
  if (!access) return notFound();
  try {
    const metadata =
      kind.data === "attachment"
        ? await getChatAttachment(assetId)
        : await getCodeWorkspace(assetId);
    if (metadata.workspaceId !== access.workspaceId) return notFound();
    let bytes: Uint8Array;
    let fileName: string;
    let mimeType: string;
    if (kind.data === "attachment") {
      const attachment = await getChatAttachmentBytes({
        attachmentId: assetId,
        workspaceId: access.workspaceId,
        userId: metadata.createdByUserId,
      });
      bytes = attachment.bytes;
      fileName = attachment.metadata.fileName;
      mimeType = attachment.metadata.mimeType;
    } else {
      const zip = await createCodeWorkspaceZip({
        projectId: assetId,
        workspaceId: access.workspaceId,
        userId: metadata.createdByUserId,
      });
      bytes = zip.bytes;
      fileName = zip.fileName;
      mimeType = "application/zip";
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    logHandledError(
      "Failed to read public conversation file",
      {},
      error as Error,
    );
    return notFound();
  }
}
