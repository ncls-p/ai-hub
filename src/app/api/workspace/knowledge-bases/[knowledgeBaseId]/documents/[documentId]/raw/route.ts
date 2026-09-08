import { originalDocumentDisposition } from "@/modules/knowledge/document-metadata";
import {
  handleRoute,
  requireResourcePermissionAsync,
} from "@/lib/route-handler";
import { getKnowledgeBase } from "@/modules/knowledge/use-cases";
import { db } from "@/server/infrastructure/db";
import { documents } from "@/server/infrastructure/db/schema";
import { storage } from "@/server/infrastructure/storage";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const paramsSchema = z.object({
  knowledgeBaseId: z.uuid(),
  documentId: z.uuid(),
});
const querySchema = z.object({ workspaceId: z.uuid() });

export async function GET(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ knowledgeBaseId: string; documentId: string }> },
) {
  return handleRoute(req, async ({ session }) => {
    const parsedParams = paramsSchema.safeParse(await params);
    const parsedQuery = querySchema.safeParse({
      workspaceId: req.nextUrl.searchParams.get("workspaceId"),
    });
    if (!parsedParams.success || !parsedQuery.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const forbidden = await requireResourcePermissionAsync(
      session.user.id,
      parsedQuery.data.workspaceId,
      "knowledgeBases.viewAllowed",
      "knowledge_base",
      parsedParams.data.knowledgeBaseId,
    );
    if (forbidden) return forbidden;
    const knowledgeBase = await getKnowledgeBase(
      parsedParams.data.knowledgeBaseId,
      parsedQuery.data.workspaceId,
      session.user.id,
    );
    if (!knowledgeBase) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const [document] = await db
      .select({
        title: documents.title,
        mimeType: documents.mimeType,
        objectStorageKey: documents.objectStorageKey,
      })
      .from(documents)
      .where(
        and(
          eq(documents.id, parsedParams.data.documentId),
          eq(documents.knowledgeBaseId, knowledgeBase.id),
          eq(documents.workspaceId, parsedQuery.data.workspaceId),
        ),
      )
      .limit(1);
    if (!document?.objectStorageKey) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const bytes = await storage.download(document.objectStorageKey);
    const safeFileName = document.title.replace(/["\r\n]/g, "_");
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return new Response(body, {
      headers: {
        "Content-Type": document.mimeType ?? "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `${originalDocumentDisposition(document.mimeType, req.nextUrl.searchParams.get("download") === "1")}; filename="${safeFileName}"; filename*=UTF-8''${encodeURIComponent(document.title)}`,
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
