import { NextResponse } from "next/server";
import { z } from "zod";

import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
  createCodeWorkspaceZip,
  getCodeWorkspace,
} from "@/modules/code-workspace/storage";
import { authorization } from "@/server/domain/services/authorization";

const paramsSchema = z.object({ projectId: z.uuid() });

function arrayBufferFromBytes(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
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

    const metadata = await getCodeWorkspace(parsed.data.projectId);
    if (metadata.createdByUserId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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

    const zip = await createCodeWorkspaceZip({
      projectId: metadata.id,
      workspaceId: metadata.workspaceId,
      userId: session.user.id,
    });
    return new Response(arrayBufferFromBytes(zip.bytes), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zip.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found|workspace/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    logHandledError("Failed to download code workspace", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
