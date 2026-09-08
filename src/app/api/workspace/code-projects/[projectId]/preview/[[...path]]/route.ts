import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute } from "@/lib/route-handler";
import {
  getCodeWorkspace,
  getCodeWorkspaceFileBytes,
} from "@/modules/code-workspace/storage";

import { canReadConversationAsset } from "@/modules/chat/conversation-asset-access";

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

function arrayBufferFromBytes(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

type PreviewByteRange =
  | { kind: "full" }
  | { kind: "partial"; start: number; end: number }
  | { kind: "unsatisfiable" };

function safeByteOffset(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function previewByteRange(
  rangeHeader: string | null,
  size: number,
): PreviewByteRange {
  if (!rangeHeader) return { kind: "full" };
  if (size <= 0 || rangeHeader.includes(",")) {
    return { kind: "unsatisfiable" };
  }
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2])) {
    return { kind: "unsatisfiable" };
  }

  if (!match[1]) {
    const suffixLength = safeByteOffset(match[2] ?? "");
    if (!suffixLength) return { kind: "unsatisfiable" };
    return {
      kind: "partial",
      start: Math.max(0, size - suffixLength),
      end: size - 1,
    };
  }

  const start = safeByteOffset(match[1]);
  const requestedEnd = match[2] ? safeByteOffset(match[2]) : size - 1;
  if (
    start === null ||
    requestedEnd === null ||
    start >= size ||
    requestedEnd < start
  ) {
    return { kind: "unsatisfiable" };
  }
  return {
    kind: "partial",
    start,
    end: Math.min(requestedEnd, size - 1),
  };
}

function previewFileResponse(
  req: NextRequest,
  file: Awaited<ReturnType<typeof getCodeWorkspaceFileBytes>>,
) {
  const size = file.bytes.byteLength;
  const range = previewByteRange(req.headers.get("range"), size);
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Security-Policy": previewCsp,
    "Content-Type": file.summary.mimeType,
    "X-Content-Type-Options": "nosniff",
  });

  if (range.kind === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${size}`);
    headers.set("Content-Length", "0");
    return new Response(null, { status: 416, headers });
  }

  if (range.kind === "partial") {
    const bytes = file.bytes.subarray(range.start, range.end + 1);
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
    headers.set("Content-Length", String(bytes.byteLength));
    return new Response(arrayBufferFromBytes(bytes), {
      status: 206,
      headers,
    });
  }

  headers.set("Content-Length", String(size));
  return new Response(arrayBufferFromBytes(file.bytes), { headers });
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
      if (
        !(await canReadConversationAsset(
          metadata,
          session.user.id,
          "code_workspace",
        ))
      ) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const segments = parsed.data.path ?? [];
      const [previewToken, ...filePathSegments] = segments;
      if (previewToken !== metadata.previewToken) {
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
      return previewFileResponse(req, file);
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
