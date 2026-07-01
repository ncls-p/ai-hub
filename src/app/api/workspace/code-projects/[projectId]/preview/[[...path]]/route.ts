import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  getCodeWorkspace,
  getCodeWorkspaceFileBytes,
} from "@/modules/code-workspace/storage";

const paramsSchema = z.object({
  projectId: z.uuid(),
  path: z.array(z.string()).optional(),
});

const previewCsp = [
  "sandbox allow-scripts allow-modals",
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

async function canRevealPreviewToken(
  metadata: Awaited<ReturnType<typeof getCodeWorkspace>>,
  userId: string,
) {
  if (metadata.createdByUserId !== userId) return false;
  const forbidden = await requireWorkspacePermissionAsync(
    userId,
    metadata.workspaceId,
    "agents.chat",
  );
  return !forbidden;
}

function arrayBufferFromBytes(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; path?: string[] }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = paramsSchema.safeParse(await params);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const metadata = await getCodeWorkspace(parsed.data.projectId);
      const segments = parsed.data.path ?? [];
      const [previewToken, ...filePathSegments] = segments;
      if (previewToken !== metadata.previewToken) {
        if (!(await canRevealPreviewToken(metadata, session.user.id))) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        const legacyPath = segments.join("/") || metadata.rootFile || "";
        const encodedLegacyPath = legacyPath
          .split("/")
          .filter(Boolean)
          .map(encodeURIComponent)
          .join("/");
        const redirectUrl = new URL(
          `/api/workspace/code-projects/${metadata.id}/preview/${metadata.previewToken}${encodedLegacyPath ? `/${encodedLegacyPath}` : ""}`,
          req.url,
        );
        return NextResponse.redirect(redirectUrl, 307);
      }
      const requestedPath = filePathSegments.join("/") || metadata.rootFile;
      if (!requestedPath) {
        return new Response(
          "No HTML entry file was detected for this workspace.",
          {
            status: 404,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          },
        );
      }
      const file = await getCodeWorkspaceFileBytes({
        projectId: metadata.id,
        filePath: requestedPath,
      });
      return new Response(arrayBufferFromBytes(file.bytes), {
        headers: {
          "Content-Type": file.summary.mimeType,
          "Cache-Control": "no-store",
          "Content-Security-Policy": previewCsp,
          "X-Content-Type-Options": "nosniff",
        },
      });
    },
    {
      logLabel: "Failed to serve code workspace preview",
      expectedError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (/not found|path|workspace/i.test(message)) {
          return NextResponse.json({ error: message }, { status: 404 });
        }
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 },
        );
      },
    },
  );
}
