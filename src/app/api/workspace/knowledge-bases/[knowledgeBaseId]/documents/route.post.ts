import {
  handleRoute,
  requireResourcePermissionAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import {
  assembleDocumentUpload,
  parseChunkMetadata,
  parseCompletionMetadata,
  storeDocumentUploadChunk,
} from "@/modules/document-upload/server";
import { extractKnowledgeUploads } from "@/modules/knowledge/file-ingestion";
import { getDefaultRagConfig } from "@/modules/knowledge/rag-config";
import { parseRagConfig } from "@/modules/knowledge/rag-config-schema";
import {
  getKnowledgeBase,
  ingestTextDocument,
} from "@/modules/knowledge/use-cases";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSchema } from "./route.create-schema";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ knowledgeBaseId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const { knowledgeBaseId } = await params;
      const uploadPhase = req.nextUrl.searchParams.get("uploadPhase");
      if (uploadPhase === "chunk") {
        const form = await req.formData();
        const chunk = parseChunkMetadata(form);
        if (!chunk) {
          return NextResponse.json(
            { error: "Invalid document chunk" },
            { status: 400 },
          );
        }
        const forbidden = await requireResourcePermissionAsync(
          session.user.id,
          chunk.workspaceId,
          "knowledgeBases.manage",
          "knowledge_base",
          knowledgeBaseId,
        );
        if (forbidden) return forbidden;
        await storeDocumentUploadChunk({
          workspaceId: chunk.workspaceId,
          userId: session.user.id,
          uploadId: chunk.uploadId,
          chunkIndex: chunk.chunkIndex,
          bytes: new Uint8Array(await chunk.chunk.arrayBuffer()),
        });
        return NextResponse.json(
          { uploadId: chunk.uploadId, chunkIndex: chunk.chunkIndex },
          { status: 202 },
        );
      }
      if (uploadPhase === "complete") {
        const payload = parseCompletionMetadata(
          await req.json().catch(() => null),
        );
        if (!payload) {
          return NextResponse.json(
            { error: "Invalid upload completion" },
            { status: 400 },
          );
        }
        const forbidden = await requireResourcePermissionAsync(
          session.user.id,
          payload.workspaceId,
          "knowledgeBases.manage",
          "knowledge_base",
          knowledgeBaseId,
        );
        if (forbidden) return forbidden;
        const knowledgeBase = await getKnowledgeBase(
          knowledgeBaseId,
          payload.workspaceId,
          session.user.id,
        );
        if (!knowledgeBase) {
          return NextResponse.json(
            { error: "Knowledge base not found" },
            { status: 404 },
          );
        }
        const assembled = await assembleDocumentUpload({
          workspaceId: payload.workspaceId,
          userId: session.user.id,
          uploadId: payload.uploadId,
          totalChunks: payload.totalChunks,
        });
        let completed = false;
        try {
          const extracted = await extractKnowledgeUploads(
            [
              {
                fileName: payload.fileName,
                mimeType: payload.mimeType || undefined,
                bytes: await assembled.readBytes(),
              },
            ],
            {
              workspaceId: payload.workspaceId,
              config:
                knowledgeBase.ragConfigJson === null
                  ? await getDefaultRagConfig()
                  : parseRagConfig(knowledgeBase.ragConfigJson),
            },
          );
          const canManageGlobal = await canManageTenantGlobals(
            session,
            payload.workspaceId,
          );
          const documents = [];
          for (const file of extracted.files) {
            documents.push(
              await ingestTextDocument({
                workspaceId: payload.workspaceId,
                knowledgeBaseId,
                userId: session.user.id,
                canManageGlobal,
                title: file.title,
                content: file.content,
                sourceType: "upload",
                mimeType: file.mimeType,
                originalBytes: file.originalBytes,
                originalMimeType: file.originalMimeType,
              }),
            );
          }
          completed = true;
          return NextResponse.json(
            { documents, rejected: extracted.rejected },
            { status: extracted.rejected.length > 0 ? 207 : 201 },
          );
        } finally {
          await assembled.cleanup(completed);
        }
      }
      const isMultipart = req.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("multipart/form-data");
      if (isMultipart) {
        const form = await req.formData();
        const workspaceId = z.uuid().safeParse(form.get("workspaceId"));
        const uploads = form
          .getAll("files")
          .filter((value): value is File => value instanceof File);
        if (!workspaceId.success || uploads.length === 0) {
          return NextResponse.json(
            { error: "Invalid upload" },
            { status: 400 },
          );
        }
        const forbidden = await requireResourcePermissionAsync(
          session.user.id,
          workspaceId.data,
          "knowledgeBases.manage",
          "knowledge_base",
          knowledgeBaseId,
        );
        if (forbidden) return forbidden;
        const canManageGlobal = await canManageTenantGlobals(
          session,
          workspaceId.data,
        );
        let extracted: Awaited<ReturnType<typeof extractKnowledgeUploads>>;
        try {
          const knowledgeBase = await getKnowledgeBase(
            knowledgeBaseId,
            workspaceId.data,
            session.user.id,
          );
          if (!knowledgeBase) {
            return NextResponse.json(
              { error: "Knowledge base not found" },
              { status: 404 },
            );
          }
          extracted = await extractKnowledgeUploads(
            await Promise.all(
              uploads.map(async (file) => ({
                fileName: file.name,
                mimeType: file.type || undefined,
                bytes: new Uint8Array(await file.arrayBuffer()),
              })),
            ),
            {
              workspaceId: workspaceId.data,
              config:
                knowledgeBase.ragConfigJson === null
                  ? await getDefaultRagConfig()
                  : parseRagConfig(knowledgeBase.ragConfigJson),
            },
          );
        } catch (error) {
          return NextResponse.json(
            {
              error:
                error instanceof Error ? error.message : "Invalid upload batch",
            },
            { status: 400 },
          );
        }
        const documents = [];
        for (const file of extracted.files) {
          documents.push(
            await ingestTextDocument({
              workspaceId: workspaceId.data,
              knowledgeBaseId,
              userId: session.user.id,
              canManageGlobal,
              title: file.title,
              content: file.content,
              sourceType: "upload",
              mimeType: file.mimeType,
              originalBytes: file.originalBytes,
              originalMimeType: file.originalMimeType,
            }),
          );
        }
        return NextResponse.json(
          { documents, rejected: extracted.rejected },
          { status: extracted.rejected.length > 0 ? 207 : 201 },
        );
      }

      const parsed = createSchema.safeParse(await req.json());
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      const forbidden = await requireResourcePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "knowledgeBases.manage",
        "knowledge_base",
        knowledgeBaseId,
      );
      if (forbidden) return forbidden;
      const canManageGlobal = await canManageTenantGlobals(
        session,
        parsed.data.workspaceId,
      );
      const document = await ingestTextDocument({
        knowledgeBaseId,
        userId: session.user.id,
        canManageGlobal,
        ...parsed.data,
      });
      return NextResponse.json(document, { status: 201 });
    },
    {
      logLabel: "Failed to ingest document",
      expectedError: (error) => {
        const msg =
          error instanceof Error ? error.message : "Internal server error";
        const status =
          error instanceof Error && error.message.includes("not found")
            ? 404
            : 500;
        return NextResponse.json({ error: msg }, { status });
      },
    },
  );
}
