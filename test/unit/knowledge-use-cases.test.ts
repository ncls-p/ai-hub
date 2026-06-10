import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────

vi.mock("@/server/domain/services/audit", () => ({
	audit: { emit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/crypto", () => ({
	encryptValue: vi.fn().mockResolvedValue("enc:chunk"),
	decryptValue: vi.fn().mockResolvedValue("decrypted content"),
}));

type Chain = {
	select: ReturnType<typeof vi.fn>;
	insert: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
	delete: ReturnType<typeof vi.fn>;
	from: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
	orderBy: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
	innerJoin: ReturnType<typeof vi.fn>;
	values: ReturnType<typeof vi.fn>;
	set: ReturnType<typeof vi.fn>;
	returning: ReturnType<typeof vi.fn>;
};

function makeChain(): Chain {
	const c = {} as Chain;
	for (const k of ["select", "insert", "update", "delete", "from", "where", "orderBy", "innerJoin", "values", "set"] as const) {
		c[k] = vi.fn().mockReturnThis();
	}
	c.limit = vi.fn().mockResolvedValue([]);
	c.returning = vi.fn().mockResolvedValue([]);
	return c;
}

vi.mock("@/server/infrastructure/db", () => {
	const chain = makeChain();
	const tx = makeChain();
	return {
		db: {
			select: vi.fn().mockReturnValue(chain),
			insert: vi.fn().mockReturnValue(chain),
			update: vi.fn().mockReturnValue(chain),
			delete: vi.fn().mockReturnValue(chain),
			transaction: vi.fn().mockImplementation((cb: (tx: Chain) => Promise<unknown>) => cb(tx)),
		},
		_c: chain,
		_tx: tx,
	};
});

declare module "@/server/infrastructure/db" {
	export const _c: Chain;
	export const _tx: Chain;
}

import * as dbModule from "@/server/infrastructure/db";
import {
	archiveDocument,
	archiveKnowledgeBase,
	cloneKnowledgeBindings,
	createKnowledgeBase,
	dequeueDocumentIngestionJob,
	enqueueDocumentIngestion,
	getKnowledgeBase,
	getKnowledgeBindingsForVersion,
	ingestTextDocument,
	listDocuments,
	listKnowledgeBases,
	listProcessingDocuments,
	processDocumentIngestion,
	replaceKnowledgeBindingsForVersion,
	scoreContent,
	searchBoundKnowledgeBases,
	searchKnowledgeBase,
	updateKnowledgeBase,
} from "@/modules/knowledge/use-cases";

function reset() {
	for (const chain of [dbModule._c, dbModule._tx]) {
		for (const k of ["select", "insert", "update", "delete", "from", "where", "orderBy", "innerJoin", "values", "set"] as const) {
			chain[k].mockReset().mockReturnThis();
		}
		chain.limit.mockReset().mockResolvedValue([]);
		chain.returning.mockReset().mockResolvedValue([]);
	}
}

beforeEach(() => {
	vi.clearAllMocks();
	reset();
	dbModule.db.select.mockReturnValue(dbModule._c);
	dbModule.db.insert.mockReturnValue(dbModule._c);
	dbModule.db.update.mockReturnValue(dbModule._c);
	dbModule.db.delete.mockReturnValue(dbModule._c);
	dbModule.db.transaction.mockImplementation(
		(cb: (tx: Chain) => Promise<unknown>) => cb(dbModule._tx),
	);
});

// ─── Fixtures ────────────────────────────────────────────────────────

const fakeKb = {
	id: "kb-1",
	workspaceId: "ws-1",
	name: "My KB",
	description: null,
	createdById: "user-1",
	archivedAt: null,
	createdAt: new Date(),
	updatedAt: new Date(),
};

const fakeDoc = {
	id: "doc-1",
	workspaceId: "ws-1",
	knowledgeBaseId: "kb-1",
	title: "Test Doc",
	status: "processing",
	sourceType: "text",
	mimeType: "text/plain",
	createdById: "user-1",
	createdAt: new Date(),
	updatedAt: new Date(),
};

// ─── createKnowledgeBase ──────────────────────────────────────────────

describe("createKnowledgeBase", () => {
	it("inserts a knowledge base and returns it", async () => {
		dbModule._c.returning.mockResolvedValueOnce([fakeKb]);

		const result = await createKnowledgeBase({
			workspaceId: "ws-1",
			userId: "user-1",
			name: "My KB",
		});

		expect(dbModule.db.insert).toHaveBeenCalled();
		expect(result).toEqual(fakeKb);
	});
});

// ─── listKnowledgeBases ───────────────────────────────────────────────

describe("listKnowledgeBases", () => {
	it("returns knowledge bases ordered by createdAt desc", async () => {
		dbModule._c.orderBy.mockResolvedValueOnce([fakeKb]);

		const result = await listKnowledgeBases("ws-1");
		expect(result).toHaveLength(1);
	});

	it("returns empty array when no knowledge bases", async () => {
		dbModule._c.orderBy.mockResolvedValueOnce([]);

		const result = await listKnowledgeBases("ws-1");
		expect(result).toHaveLength(0);
	});
});

// ─── getKnowledgeBase ─────────────────────────────────────────────────

describe("getKnowledgeBase", () => {
	it("returns null when not found", async () => {
		const result = await getKnowledgeBase("nonexistent", "ws-1");
		expect(result).toBeNull();
	});

	it("returns knowledge base when found", async () => {
		dbModule._c.limit.mockResolvedValueOnce([fakeKb]);
		const result = await getKnowledgeBase("kb-1", "ws-1");
		expect(result).toEqual(fakeKb);
	});
});

// ─── updateKnowledgeBase ──────────────────────────────────────────────

describe("updateKnowledgeBase", () => {
	it("throws when knowledge base not found", async () => {
		await expect(
			updateKnowledgeBase({
				knowledgeBaseId: "nonexistent",
				workspaceId: "ws-1",
				userId: "user-1",
			}),
		).rejects.toThrow("Knowledge base not found");
	});

	it("updates and returns knowledge base", async () => {
		dbModule._c.limit.mockResolvedValueOnce([fakeKb]);
		dbModule._c.returning.mockResolvedValueOnce([{ ...fakeKb, name: "Updated" }]);

		const result = await updateKnowledgeBase({
			knowledgeBaseId: "kb-1",
			workspaceId: "ws-1",
			userId: "user-1",
			name: "Updated",
		});

		expect(result).toEqual({ ...fakeKb, name: "Updated" });
	});
});

// ─── archiveKnowledgeBase ─────────────────────────────────────────────

describe("archiveKnowledgeBase", () => {
	it("throws when knowledge base not found", async () => {
		await expect(archiveKnowledgeBase("nonexistent", "ws-1", "user-1")).rejects.toThrow(
			"Knowledge base not found",
		);
	});

	it("archives knowledge base", async () => {
		dbModule._c.limit.mockResolvedValueOnce([fakeKb]);

		await archiveKnowledgeBase("kb-1", "ws-1", "user-1");

		expect(dbModule.db.update).toHaveBeenCalled();
	});
});

// ─── ingestTextDocument ───────────────────────────────────────────────

describe("ingestTextDocument", () => {
	it("throws when knowledge base not found", async () => {
		await expect(
			ingestTextDocument({
				workspaceId: "ws-1",
				knowledgeBaseId: "nonexistent",
				userId: "user-1",
				title: "Test",
				content: "Content",
			}),
		).rejects.toThrow("Knowledge base not found");
	});

	it("ingests document with non-empty content", async () => {
		// Q1: getKnowledgeBase → limit
		dbModule._c.limit.mockResolvedValueOnce([fakeKb]);

		// tx: insert document → returning
		const processingDoc = { ...fakeDoc };
		dbModule._tx.returning.mockResolvedValueOnce([processingDoc]);

		// processDocumentIngestion: select document (limit), select chunks (where), update (where)
		dbModule._c.limit
			.mockResolvedValueOnce([processingDoc])  // Q2: select document in processDocumentIngestion
		dbModule._c.where
			.mockReturnValueOnce(dbModule._c)        // Q1 (getKb where) → chain to limit (already consumed)
			.mockResolvedValueOnce([{ id: "chunk-1" }]);  // Q3: select chunks

		const result = await ingestTextDocument({
			workspaceId: "ws-1",
			knowledgeBaseId: "kb-1",
			userId: "user-1",
			title: "Test",
			content: "Hello world",
		});

		expect(result).toEqual(processingDoc);
		expect(dbModule.db.transaction).toHaveBeenCalledOnce();
	});

	it("marks document as failed when content is empty", async () => {
		dbModule._c.limit.mockResolvedValueOnce([fakeKb]);
		const failedDoc = { ...fakeDoc, status: "failed" };
		dbModule._tx.returning
			.mockResolvedValueOnce([fakeDoc])   // insert document
			.mockResolvedValueOnce([failedDoc]); // update to failed status

		const result = await ingestTextDocument({
			workspaceId: "ws-1",
			knowledgeBaseId: "kb-1",
			userId: "user-1",
			title: "Empty",
			content: "",
		});

		expect(result.status).toBe("failed");
	});
});

// ─── listDocuments ────────────────────────────────────────────────────

describe("listDocuments", () => {
	it("throws when knowledge base not found", async () => {
		await expect(listDocuments("nonexistent", "ws-1")).rejects.toThrow(
			"Knowledge base not found",
		);
	});

	it("returns documents ordered by createdAt", async () => {
		dbModule._c.limit.mockResolvedValueOnce([fakeKb]);
		dbModule._c.orderBy.mockResolvedValueOnce([fakeDoc]);

		const result = await listDocuments("kb-1", "ws-1");
		expect(result).toHaveLength(1);
	});
});

// ─── archiveDocument ──────────────────────────────────────────────────

describe("archiveDocument", () => {
	it("throws when knowledge base not found", async () => {
		await expect(
			archiveDocument({
				documentId: "doc-1",
				knowledgeBaseId: "nonexistent",
				workspaceId: "ws-1",
				userId: "user-1",
			}),
		).rejects.toThrow("Knowledge base not found");
	});

	it("throws when document not found", async () => {
		dbModule._c.limit
			.mockResolvedValueOnce([fakeKb])
			.mockResolvedValueOnce([]);  // document not found

		await expect(
			archiveDocument({
				documentId: "doc-1",
				knowledgeBaseId: "kb-1",
				workspaceId: "ws-1",
				userId: "user-1",
			}),
		).rejects.toThrow("Document not found");
	});

	it("deletes document when found", async () => {
		dbModule._c.limit
			.mockResolvedValueOnce([fakeKb])
			.mockResolvedValueOnce([fakeDoc]);

		await archiveDocument({
			documentId: "doc-1",
			knowledgeBaseId: "kb-1",
			workspaceId: "ws-1",
			userId: "user-1",
		});

		expect(dbModule.db.delete).toHaveBeenCalled();
	});
});

// ─── scoreContent ─────────────────────────────────────────────────────

describe("scoreContent", () => {
	it("returns 0 for no matching terms", () => {
		expect(scoreContent("hello world", "foo bar")).toBe(0);
	});

	it("returns 1 for single matching term", () => {
		expect(scoreContent("hello world", "hello")).toBe(1);
	});

	it("returns 2 for two matching terms", () => {
		expect(scoreContent("hello world", "hello world")).toBe(2);
	});

	it("is case insensitive", () => {
		expect(scoreContent("Hello World", "hello world")).toBe(2);
	});
});

// ─── searchKnowledgeBase ──────────────────────────────────────────────

describe("searchKnowledgeBase", () => {
	it("throws when knowledge base not found", async () => {
		await expect(
			searchKnowledgeBase({ workspaceId: "ws-1", knowledgeBaseId: "nonexistent", query: "test" }),
		).rejects.toThrow("Knowledge base not found");
	});

	it("falls back to keyword search when no embeddings", async () => {
		// Q1: getKnowledgeBase → limit
		dbModule._c.limit.mockResolvedValueOnce([fakeKb]);

		// knowledgeBaseHasEmbeddings: innerJoin.innerJoin.where() → where terminal
		// searchKnowledgeBaseByKeyword: innerJoin.where() → where terminal
		dbModule._c.where
			.mockReturnValueOnce(dbModule._c)  // getKb .where → chains to limit
			.mockResolvedValueOnce([{ count: 0 }])  // hasEmbeddings (where terminal)
			.mockResolvedValueOnce([]);  // keyword search rows (where terminal)

		const result = await searchKnowledgeBase({
			workspaceId: "ws-1",
			knowledgeBaseId: "kb-1",
			query: "hello",
		});

		expect(result).toEqual([]);
	});

	it("returns keyword search results", async () => {
		dbModule._c.limit.mockResolvedValueOnce([fakeKb]);

		const { decryptValue } = await import("@/lib/crypto");
		vi.mocked(decryptValue).mockResolvedValue("hello world content");

		const row = {
			chunk: { id: "chunk-1", chunkIndex: 0, contentEncrypted: "enc:content" },
			document: { id: "doc-1", title: "Doc 1" },
		};

		dbModule._c.where
			.mockReturnValueOnce(dbModule._c)  // getKb where → chains to limit
			.mockResolvedValueOnce([{ count: 0 }])  // no embeddings
			.mockResolvedValueOnce([row]);  // keyword search results

		const result = await searchKnowledgeBase({
			workspaceId: "ws-1",
			knowledgeBaseId: "kb-1",
			query: "hello",
		});

		expect(result).toHaveLength(1);
		expect(result[0].documentTitle).toBe("Doc 1");
	});
});

// ─── getKnowledgeBindingsForVersion ───────────────────────────────────

describe("getKnowledgeBindingsForVersion", () => {
	it("returns bindings for a version (where terminal)", async () => {
		const binding = { id: "b1", knowledgeBaseId: "kb-1", name: "My KB" };
		dbModule._c.where.mockResolvedValueOnce([binding]);

		const result = await getKnowledgeBindingsForVersion("v1");
		expect(result).toHaveLength(1);
		expect(result[0].knowledgeBaseId).toBe("kb-1");
	});

	it("returns empty when no bindings", async () => {
		dbModule._c.where.mockResolvedValueOnce([]);

		const result = await getKnowledgeBindingsForVersion("v1");
		expect(result).toHaveLength(0);
	});
});

// ─── replaceKnowledgeBindingsForVersion ───────────────────────────────

describe("replaceKnowledgeBindingsForVersion", () => {
	it("deletes existing bindings and inserts new ones", async () => {
		await replaceKnowledgeBindingsForVersion("v1", ["kb-1", "kb-2"]);

		expect(dbModule.db.delete).toHaveBeenCalled();
		expect(dbModule.db.insert).toHaveBeenCalled();
	});

	it("only deletes when empty array provided", async () => {
		await replaceKnowledgeBindingsForVersion("v1", []);

		expect(dbModule.db.delete).toHaveBeenCalled();
		expect(dbModule.db.insert).not.toHaveBeenCalled();
	});
});

// ─── cloneKnowledgeBindings ───────────────────────────────────────────

describe("cloneKnowledgeBindings", () => {
	it("is a no-op when fromAgentVersionId is null", async () => {
		await cloneKnowledgeBindings(null, "v2");

		expect(dbModule.db.select).not.toHaveBeenCalled();
	});

	it("is a no-op when no existing bindings", async () => {
		dbModule._c.where.mockResolvedValueOnce([]);

		await cloneKnowledgeBindings("v1", "v2");

		expect(dbModule.db.insert).not.toHaveBeenCalled();
	});

	it("clones bindings to new version", async () => {
		dbModule._c.where.mockResolvedValueOnce([{ knowledgeBaseId: "kb-1" }]);

		await cloneKnowledgeBindings("v1", "v2");

		expect(dbModule.db.insert).toHaveBeenCalled();
	});
});

// ─── searchBoundKnowledgeBases ────────────────────────────────────────

describe("searchBoundKnowledgeBases", () => {
	it("returns empty when no bindings", async () => {
		dbModule._c.where.mockResolvedValueOnce([]);  // getKnowledgeBindingsForVersion

		const result = await searchBoundKnowledgeBases({
			agentVersionId: "v1",
			workspaceId: "ws-1",
			query: "test",
		});

		expect(result).toHaveLength(0);
	});
});

// ─── enqueueDocumentIngestion & dequeueDocumentIngestionJob ───────────

describe("enqueueDocumentIngestion", () => {
	it("adds document to queue and returns queued=true", () => {
		const result = enqueueDocumentIngestion({
			documentId: "doc-1",
			workspaceId: "ws-1",
			knowledgeBaseId: "kb-1",
		});
		expect(result.queued).toBe(true);
		expect(result.documentId).toBe("doc-1");
	});
});

describe("dequeueDocumentIngestionJob", () => {
	it("returns null when queue is empty (after any previous drains)", () => {
		// Drain any queued items from previous tests
		let item = dequeueDocumentIngestionJob();
		while (item !== null) {
			item = dequeueDocumentIngestionJob();
		}
		const result = dequeueDocumentIngestionJob();
		expect(result).toBeNull();
	});

	it("returns and removes item from queue", () => {
		enqueueDocumentIngestion({ documentId: "doc-x", workspaceId: "ws-1", knowledgeBaseId: "kb-1" });
		const result = dequeueDocumentIngestionJob();
		expect(result?.documentId).toBe("doc-x");
	});
});

// ─── listProcessingDocuments ──────────────────────────────────────────

describe("listProcessingDocuments", () => {
	it("returns documents with processing status", async () => {
		dbModule._c.limit.mockResolvedValueOnce([{ id: "doc-1" }]);
		const result = await listProcessingDocuments(10);
		expect(result).toHaveLength(1);
	});
});

// ─── processDocumentIngestion ─────────────────────────────────────────

describe("processDocumentIngestion", () => {
	it("is a no-op when document not found", async () => {
		await processDocumentIngestion("nonexistent");
		expect(dbModule.db.update).not.toHaveBeenCalled();
	});

	it("is a no-op when document status is not processing", async () => {
		dbModule._c.limit.mockResolvedValueOnce([{ ...fakeDoc, status: "ready" }]);

		await processDocumentIngestion("doc-1");
		expect(dbModule.db.update).not.toHaveBeenCalled();
	});

	it("marks document as ready when chunks exist", async () => {
		// Q1: select document (limit terminal)
		// Q2: select chunks (where terminal on documentChunks)
		// Q3: update document status (where terminal on update)
		dbModule._c.limit.mockResolvedValueOnce([fakeDoc]);
		dbModule._c.where
			.mockReturnValueOnce(dbModule._c)              // Q1 .where → chains to limit (already resolved)
			.mockResolvedValueOnce([{ id: "chunk-1" }]);   // Q2 chunks

		await processDocumentIngestion("doc-1");

		expect(dbModule.db.update).toHaveBeenCalled();
		const updateSet = dbModule._c.set.mock.calls[0][0];
		expect(updateSet.status).toBe("ready");
	});

	it("marks document as failed when no chunks", async () => {
		dbModule._c.limit.mockResolvedValueOnce([fakeDoc]);
		dbModule._c.where
			.mockReturnValueOnce(dbModule._c)  // chains to limit
			.mockResolvedValueOnce([]);         // no chunks

		await processDocumentIngestion("doc-1");

		const updateSet = dbModule._c.set.mock.calls[0][0];
		expect(updateSet.status).toBe("failed");
	});
});
