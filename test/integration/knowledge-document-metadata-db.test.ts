import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  documents,
  documentChunks,
  knowledgeBases,
} from "@/server/infrastructure/db/schema";
import { renameKnowledgeDocument } from "@/modules/knowledge/document-metadata";
import { replaceDirectResourceSharing } from "@/modules/iam/resource-direct-sharing";
import { createSharingFixture } from "./resource-sharing-db.fixture";

const suite = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;
suite("document rename permissions and indexing integrity", () => {
  let fixture: Awaited<ReturnType<typeof createSharingFixture>>;
  beforeAll(async () => {
    fixture = await createSharingFixture();
  }, 60_000);
  afterAll(async () => {
    await fixture?.cleanup();
  });
  it("allows owners and document editors to rename without rebuilding chunks or modifying original references", async () => {
    const [base] = await db
      .insert(knowledgeBases)
      .values({
        workspaceId: fixture.workspaceId,
        createdById: fixture.owner,
        name: "Original files",
      })
      .returning();
    const [document] = await db
      .insert(documents)
      .values({
        workspaceId: fixture.workspaceId,
        knowledgeBaseId: base.id,
        createdById: fixture.owner,
        title: "original.pdf",
        mimeType: "application/pdf",
        sourceType: "upload",
        status: "ready",
        objectStorageKey: "original-key",
      })
      .returning();
    const [chunk] = await db
      .insert(documentChunks)
      .values({
        documentId: document.id,
        chunkIndex: 0,
        contentEncrypted: "unchanged-encrypted-content",
        tokenCount: 4,
      })
      .returning();
    const input = {
      workspaceId: fixture.workspaceId,
      knowledgeBaseId: base.id,
      documentId: document.id,
      userId: fixture.owner,
      title: "renamed.pdf",
    };
    expect(await renameKnowledgeDocument(input)).toEqual({
      id: document.id,
      title: "renamed.pdf",
    });
    const [copy] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, document.id));
    expect(copy).toMatchObject({
      objectStorageKey: "original-key",
      status: "ready",
      mimeType: "application/pdf",
    });
    expect(
      await db
        .select()
        .from(documentChunks)
        .where(eq(documentChunks.documentId, document.id)),
    ).toEqual([chunk]);
    await expect(
      renameKnowledgeDocument({ ...input, userId: fixture.member }),
    ).rejects.toThrow();
    await replaceDirectResourceSharing({
      actorUserId: fixture.owner,
      workspaceId: fixture.workspaceId,
      resourceType: "knowledge_base",
      resourceId: base.id,
      shares: [{ userId: fixture.member, access: "view" }],
    });
    await expect(
      renameKnowledgeDocument({ ...input, userId: fixture.member }),
    ).rejects.toThrow();
    await replaceDirectResourceSharing({
      actorUserId: fixture.owner,
      workspaceId: fixture.workspaceId,
      resourceType: "knowledge_base",
      resourceId: base.id,
      shares: [{ userId: fixture.member, access: "edit" }],
    });
    expect(
      await renameKnowledgeDocument({
        ...input,
        userId: fixture.member,
        title: "editor.pdf",
      }),
    ).toMatchObject({ title: "editor.pdf" });
    await expect(
      renameKnowledgeDocument({ ...input, workspaceId: fixture.destinationId }),
    ).rejects.toThrow("Knowledge base not found");
    await expect(
      renameKnowledgeDocument({ ...input, documentId: base.id }),
    ).rejects.toThrow("Document not found");
  });
});
