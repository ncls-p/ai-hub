import { and, eq, inArray, isNull, not, sql } from "drizzle-orm";
import { encryptValue, decryptValue } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
  agentKnowledgeBindings,
  documentChunks,
  documentEmbeddings,
  documents,
  knowledgeBases,
} from "@/server/infrastructure/db/schema";

export interface CreateKnowledgeBaseInput {
  workspaceId: string;
  userId: string;
  name: string;
  description?: string;
}

export async function createKnowledgeBase(input: CreateKnowledgeBaseInput) {
  const [knowledgeBase] = await db
    .insert(knowledgeBases)
    .values({
      workspaceId: input.workspaceId,
      name: input.name,
      description: input.description || null,
      createdById: input.userId,
    })
    .returning();

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "knowledgeBase.created",
    resourceType: "knowledge_base",
    resourceId: knowledgeBase.id,
    outcome: "success",
    metadata: { name: input.name },
  });

  return knowledgeBase;
}

export async function listKnowledgeBases(workspaceId: string) {
  return db
    .select()
    .from(knowledgeBases)
    .where(
      and(
        eq(knowledgeBases.workspaceId, workspaceId),
        isNull(knowledgeBases.archivedAt),
      ),
    )
    .orderBy(sql`${knowledgeBases.createdAt} DESC`);
}

export async function getKnowledgeBase(
  knowledgeBaseId: string,
  workspaceId: string,
) {
  const [knowledgeBase] = await db
    .select()
    .from(knowledgeBases)
    .where(
      and(
        eq(knowledgeBases.id, knowledgeBaseId),
        eq(knowledgeBases.workspaceId, workspaceId),
        isNull(knowledgeBases.archivedAt),
      ),
    )
    .limit(1);
  return knowledgeBase ?? null;
}

export async function updateKnowledgeBase(input: {
  knowledgeBaseId: string;
  workspaceId: string;
  userId: string;
  name?: string;
  description?: string;
}) {
  const existing = await getKnowledgeBase(
    input.knowledgeBaseId,
    input.workspaceId,
  );
  if (!existing) throw new Error("Knowledge base not found");

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined)
    updates.description = input.description || null;

  const [knowledgeBase] = await db
    .update(knowledgeBases)
    .set(updates)
    .where(eq(knowledgeBases.id, input.knowledgeBaseId))
    .returning();

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "knowledgeBase.updated",
    resourceType: "knowledge_base",
    resourceId: input.knowledgeBaseId,
    outcome: "success",
  });

  return knowledgeBase;
}

export async function archiveKnowledgeBase(
  knowledgeBaseId: string,
  workspaceId: string,
  userId: string,
) {
  const existing = await getKnowledgeBase(knowledgeBaseId, workspaceId);
  if (!existing) throw new Error("Knowledge base not found");
  await db
    .update(knowledgeBases)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(knowledgeBases.id, knowledgeBaseId));
  await audit.emit({
    workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: userId,
    action: "knowledgeBase.archived",
    resourceType: "knowledge_base",
    resourceId: knowledgeBaseId,
    outcome: "success",
  });
}

function chunkText(text: string, maxChars = 1_200) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const paragraphs = normalized.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (`${current}\n\n${paragraph}`.length > maxChars && current) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxChars) return [chunk];
    const split: string[] = [];
    for (let index = 0; index < chunk.length; index += maxChars) {
      split.push(chunk.slice(index, index + maxChars));
    }
    return split;
  });
}

export async function ingestTextDocument(input: {
  workspaceId: string;
  knowledgeBaseId: string;
  userId: string;
  title: string;
  content: string;
  sourceType?: "text" | "url";
}) {
  const knowledgeBase = await getKnowledgeBase(
    input.knowledgeBaseId,
    input.workspaceId,
  );
  if (!knowledgeBase) throw new Error("Knowledge base not found");

  const chunks = chunkText(input.content);
  const document = await db.transaction(async (tx) => {
    const [document] = await tx
      .insert(documents)
      .values({
        workspaceId: input.workspaceId,
        knowledgeBaseId: input.knowledgeBaseId,
        title: input.title,
        sourceType: input.sourceType ?? "text",
        mimeType: "text/plain",
        status: "processing",
        createdById: input.userId,
      })
      .returning();

    if (chunks.length > 0) {
      await tx.insert(documentChunks).values(
        await Promise.all(
          chunks.map(async (chunk, index) => ({
            documentId: document.id,
            chunkIndex: index,
            contentEncrypted: await encryptValue(chunk),
            tokenCount: Math.ceil(chunk.length / 4),
            metadataJson: { source: input.sourceType ?? "text" },
          })),
        ),
      );
    }

    if (chunks.length === 0) {
      const [failed] = await tx
        .update(documents)
        .set({
          status: "failed",
          errorMessage: "Document was empty",
          updatedAt: new Date(),
        })
        .where(eq(documents.id, document.id))
        .returning();
      return failed;
    }

    return document;
  });

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "document.ingested",
    resourceType: "knowledge_base",
    resourceId: input.knowledgeBaseId,
    outcome: document.status === "failed" ? "failed" : "success",
    metadata: { documentId: document.id, chunks: chunks.length },
  });

  if (document.status === "processing") {
    enqueueDocumentIngestion({
      documentId: document.id,
      workspaceId: input.workspaceId,
      knowledgeBaseId: input.knowledgeBaseId,
    });
    try {
      await processDocumentIngestion(document.id);
    } catch (error) {
      // Queue state remains processing so the worker can retry ingestion later.
      logger.warn("Document ingestion will be retried by the worker", {
        documentId: document.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return document;
}

export async function listDocuments(
  knowledgeBaseId: string,
  workspaceId: string,
) {
  const knowledgeBase = await getKnowledgeBase(knowledgeBaseId, workspaceId);
  if (!knowledgeBase) throw new Error("Knowledge base not found");
  return db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.knowledgeBaseId, knowledgeBaseId),
        eq(documents.workspaceId, workspaceId),
      ),
    )
    .orderBy(sql`${documents.createdAt} DESC`);
}

export async function archiveDocument(input: {
  documentId: string;
  knowledgeBaseId: string;
  workspaceId: string;
  userId: string;
}) {
  const knowledgeBase = await getKnowledgeBase(
    input.knowledgeBaseId,
    input.workspaceId,
  );
  if (!knowledgeBase) throw new Error("Knowledge base not found");

  const [document] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, input.documentId),
        eq(documents.knowledgeBaseId, input.knowledgeBaseId),
        eq(documents.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);

  if (!document) throw new Error("Document not found");

  await db.delete(documents).where(eq(documents.id, input.documentId));

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "document.archived",
    resourceType: "knowledge_base",
    resourceId: input.knowledgeBaseId,
    outcome: "success",
    metadata: { documentId: input.documentId, title: document.title },
  });
}

export function scoreContent(content: string, query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = content.toLowerCase();
  return terms.reduce(
    (score, term) => score + (lower.includes(term) ? 1 : 0),
    0,
  );
}

type KnowledgeSearchHit = {
  documentId: string;
  documentTitle: string;
  chunkId: string;
  chunkIndex: number;
  content: string;
  score: number;
};

async function knowledgeBaseHasEmbeddings(
  knowledgeBaseId: string,
  workspaceId: string,
) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(documentEmbeddings)
    .innerJoin(
      documentChunks,
      eq(documentEmbeddings.chunkId, documentChunks.id),
    )
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(
      and(
        eq(documents.knowledgeBaseId, knowledgeBaseId),
        eq(documents.workspaceId, workspaceId),
        eq(documents.status, "ready"),
      ),
    );
  return (row?.count ?? 0) > 0;
}

async function searchKnowledgeBaseByKeyword(input: {
  workspaceId: string;
  knowledgeBaseId: string;
  query: string;
  limit?: number;
}): Promise<KnowledgeSearchHit[]> {
  const rows = await db
    .select({ chunk: documentChunks, document: documents })
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(
      and(
        eq(documents.knowledgeBaseId, input.knowledgeBaseId),
        eq(documents.workspaceId, input.workspaceId),
        eq(documents.status, "ready"),
      ),
    );

  const results: KnowledgeSearchHit[] = [];
  for (const row of rows) {
    if (!row.chunk.contentEncrypted) continue;
    const content = await decryptValue(row.chunk.contentEncrypted);
    const score = scoreContent(content, input.query);
    if (score > 0) {
      results.push({
        documentId: row.document.id,
        documentTitle: row.document.title,
        chunkId: row.chunk.id,
        chunkIndex: row.chunk.chunkIndex,
        content,
        score,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, input.limit ?? 5);
}

async function searchKnowledgeBaseByVector(input: {
  workspaceId: string;
  knowledgeBaseId: string;
  query: string;
  limit?: number;
}): Promise<KnowledgeSearchHit[] | null> {
  const hasEmbeddings = await knowledgeBaseHasEmbeddings(
    input.knowledgeBaseId,
    input.workspaceId,
  );
  if (!hasEmbeddings) return null;

  const seedHits = await searchKnowledgeBaseByKeyword({
    ...input,
    limit: Math.max(1, Math.min(3, input.limit ?? 5)),
  });
  if (seedHits.length === 0) return null;

  const seedChunkIds = seedHits.map((hit) => hit.chunkId);
  const limit = input.limit ?? 5;

  const rows = await db
    .select({
      chunk: documentChunks,
      document: documents,
      similarity: sql<number>`1 - (${documentEmbeddings.embedding} <=> (
				SELECT AVG(de.embedding)
				FROM document_embeddings de
				WHERE de.chunk_id IN (${sql.join(
          seedChunkIds.map((chunkId) => sql`${chunkId}`),
          sql`, `,
        )})
			))`,
    })
    .from(documentEmbeddings)
    .innerJoin(
      documentChunks,
      eq(documentEmbeddings.chunkId, documentChunks.id),
    )
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(
      and(
        eq(documents.knowledgeBaseId, input.knowledgeBaseId),
        eq(documents.workspaceId, input.workspaceId),
        eq(documents.status, "ready"),
        not(isNull(documentEmbeddings.embedding)),
      ),
    )
    .orderBy(
      sql`${documentEmbeddings.embedding} <=> (
				SELECT AVG(de.embedding)
				FROM document_embeddings de
				WHERE de.chunk_id IN (${sql.join(
          seedChunkIds.map((chunkId) => sql`${chunkId}`),
          sql`, `,
        )})
			)`,
    )
    .limit(limit);

  if (rows.length === 0) return null;

  const results: KnowledgeSearchHit[] = [];
  for (const row of rows) {
    if (!row.chunk.contentEncrypted) continue;
    const content = await decryptValue(row.chunk.contentEncrypted);
    results.push({
      documentId: row.document.id,
      documentTitle: row.document.title,
      chunkId: row.chunk.id,
      chunkIndex: row.chunk.chunkIndex,
      content,
      score: Number(row.similarity) || 0,
    });
  }

  return results.length > 0 ? results : null;
}

export async function searchKnowledgeBase(input: {
  workspaceId: string;
  knowledgeBaseId: string;
  query: string;
  limit?: number;
}) {
  const knowledgeBase = await getKnowledgeBase(
    input.knowledgeBaseId,
    input.workspaceId,
  );
  if (!knowledgeBase) throw new Error("Knowledge base not found");

  const vectorHits = await searchKnowledgeBaseByVector(input);
  if (vectorHits && vectorHits.length > 0) {
    return vectorHits;
  }

  return searchKnowledgeBaseByKeyword(input);
}

export async function getKnowledgeBindingsForVersion(agentVersionId: string) {
  const rows = await db
    .select({
      id: agentKnowledgeBindings.id,
      knowledgeBaseId: agentKnowledgeBindings.knowledgeBaseId,
      name: knowledgeBases.name,
    })
    .from(agentKnowledgeBindings)
    .innerJoin(
      knowledgeBases,
      eq(agentKnowledgeBindings.knowledgeBaseId, knowledgeBases.id),
    )
    .where(eq(agentKnowledgeBindings.agentVersionId, agentVersionId));
  return rows;
}

export async function replaceKnowledgeBindingsForVersion(
  agentVersionId: string,
  knowledgeBaseIds: string[],
  workspaceId?: string,
) {
  const uniqueKnowledgeBaseIds = [...new Set(knowledgeBaseIds)];
  if (workspaceId && uniqueKnowledgeBaseIds.length > 0) {
    const availableKnowledgeBases = await db
      .select({ id: knowledgeBases.id })
      .from(knowledgeBases)
      .where(
        and(
          eq(knowledgeBases.workspaceId, workspaceId),
          isNull(knowledgeBases.archivedAt),
          inArray(knowledgeBases.id, uniqueKnowledgeBaseIds),
        ),
      );
    const availableIds = new Set(
      availableKnowledgeBases.map((knowledgeBase) => knowledgeBase.id),
    );
    const invalidKnowledgeBaseId = uniqueKnowledgeBaseIds.find(
      (knowledgeBaseId) => !availableIds.has(knowledgeBaseId),
    );
    if (invalidKnowledgeBaseId) throw new Error("Knowledge base not found");
  }

  await db
    .delete(agentKnowledgeBindings)
    .where(eq(agentKnowledgeBindings.agentVersionId, agentVersionId));

  if (uniqueKnowledgeBaseIds.length === 0) return;

  await db.insert(agentKnowledgeBindings).values(
    uniqueKnowledgeBaseIds.map((knowledgeBaseId) => ({
      agentVersionId,
      knowledgeBaseId,
    })),
  );
}

export async function cloneKnowledgeBindings(
  fromAgentVersionId: string | null,
  toAgentVersionId: string,
) {
  if (!fromAgentVersionId) return;
  const existing = await db
    .select({ knowledgeBaseId: agentKnowledgeBindings.knowledgeBaseId })
    .from(agentKnowledgeBindings)
    .where(eq(agentKnowledgeBindings.agentVersionId, fromAgentVersionId));

  if (existing.length === 0) return;

  await db.insert(agentKnowledgeBindings).values(
    existing.map((row) => ({
      agentVersionId: toAgentVersionId,
      knowledgeBaseId: row.knowledgeBaseId,
    })),
  );
}

export async function searchBoundKnowledgeBases(input: {
  agentVersionId: string;
  workspaceId: string;
  query: string;
  limit?: number;
}) {
  const bindings = await getKnowledgeBindingsForVersion(input.agentVersionId);
  if (bindings.length === 0) return [];

  const perBaseLimit = Math.max(
    1,
    Math.ceil((input.limit ?? 5) / bindings.length),
  );
  const allResults: Array<{
    documentId: string;
    documentTitle: string;
    chunkId: string;
    chunkIndex: number;
    content: string;
    score: number;
    knowledgeBaseId: string;
    knowledgeBaseName: string;
  }> = [];

  for (const binding of bindings) {
    const hits = await searchKnowledgeBase({
      workspaceId: input.workspaceId,
      knowledgeBaseId: binding.knowledgeBaseId,
      query: input.query,
      limit: perBaseLimit,
    });
    for (const hit of hits) {
      allResults.push({
        ...hit,
        knowledgeBaseId: binding.knowledgeBaseId,
        knowledgeBaseName: binding.name,
      });
    }
  }

  return allResults
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit ?? 5);
}

const ingestionQueue: Array<{
  documentId: string;
  workspaceId: string;
  knowledgeBaseId: string;
}> = [];

export function enqueueDocumentIngestion(input: {
  documentId: string;
  workspaceId: string;
  knowledgeBaseId: string;
}) {
  ingestionQueue.push(input);
  return { queued: true, documentId: input.documentId };
}

export function dequeueDocumentIngestionJob() {
  return ingestionQueue.shift() ?? null;
}

export async function listProcessingDocuments(limit = 5) {
  const processingDocuments = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.status, "processing"))
    .limit(limit);
  return processingDocuments;
}

export async function processDocumentIngestion(documentId: string) {
  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!document || document.status !== "processing") return;

  const chunks = await db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.documentId, documentId));

  await db
    .update(documents)
    .set({
      status: chunks.length > 0 ? "ready" : "failed",
      errorMessage: chunks.length > 0 ? null : "No chunks generated",
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));
}
