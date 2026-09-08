"use client";

import { type ResourceProvenance } from "@/components/resource-provenance-badge";
import { type ResourceAccessSelection } from "@/modules/iam/resource-access-scope";
import { type RagConfig } from "@/modules/knowledge/rag-config-schema";

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  isGlobal: boolean;
  canEdit: boolean;
  createdAt: string;
  provenance: ResourceProvenance;
  access?: ResourceAccessSelection;
  effectiveRagConfig: RagConfig;
  usesDefaultRagConfig: boolean;
}
export interface DocumentRow {
  mimeType?: string | null;
  objectStorageKey?: string | null;
  id: string;
  title: string;
  status: string;
  processingProgress: number;
  processingStage: string;
  errorMessage: string | null;
  createdAt: string;
}
export interface SearchResult {
  chunkId: string;
  documentTitle: string;
  content: string;
  score: number;
}
export interface DocumentPreview {
  documentId: string;
  documentTitle: string;
  mimeType: string | null;
  originalUrl: string | null;
  chunks: Array<{ chunkId: string; chunkIndex: number; content: string }>;
}
export interface KnowledgeAgent {
  id: string;
  name: string;
  description: string | null;
  activeVersionId: string | null;
  logoUrl?: string | null;
  modelDisplayName?: string | null;
  canEdit?: boolean;
}

export interface RagModelOption {
  providerId: string;
  providerName: string;
  modelId: string;
  displayName?: string;
  embeddings: boolean;
  vision: boolean;
}

export function cloneRagConfig(config: RagConfig): RagConfig {
  return {
    embedding: { ...config.embedding },
    chunking: { ...config.chunking },
    retrieval: { ...config.retrieval },
    reranking: { ...config.reranking },
    extraction: {
      ...config.extraction,
      ocr: { ...config.extraction.ocr },
    },
  };
}
