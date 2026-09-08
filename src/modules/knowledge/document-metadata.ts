import { and, eq } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import { documents } from "@/server/infrastructure/db/schema";
import { audit } from "@/server/domain/services/audit";
import { getKnowledgeBase } from "./use-cases.list-knowledge-bases";
import { assertCanManageKnowledgeBase } from "./use-cases.create-knowledge-base-input";

export async function renameKnowledgeDocument(input: {
  workspaceId: string;
  knowledgeBaseId: string;
  documentId: string;
  userId: string;
  title: string;
  canManageGlobal?: boolean;
}) {
  const knowledgeBase = await getKnowledgeBase(
    input.knowledgeBaseId,
    input.workspaceId,
  );
  if (!knowledgeBase) throw new Error("Knowledge base not found");
  await assertCanManageKnowledgeBase(
    knowledgeBase,
    input.userId,
    input.canManageGlobal,
  );
  const [document] = await db
    .update(documents)
    .set({ title: input.title, updatedAt: new Date() })
    .where(
      and(
        eq(documents.id, input.documentId),
        eq(documents.workspaceId, input.workspaceId),
        eq(documents.knowledgeBaseId, input.knowledgeBaseId),
      ),
    )
    .returning({ id: documents.id, title: documents.title });
  if (!document) throw new Error("Document not found");
  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "document.renamed",
    resourceType: "knowledge_base",
    resourceId: input.knowledgeBaseId,
    outcome: "success",
    metadata: { documentId: document.id },
  });
  return document;
}

export function originalDocumentDisposition(
  mimeType: string | null,
  download: boolean,
) {
  return !download &&
    [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "image/avif",
      "text/plain",
    ].includes(mimeType ?? "")
    ? "inline"
    : "attachment";
}
