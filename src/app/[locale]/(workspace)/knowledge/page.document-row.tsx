"use client";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  EyeIcon,
  FileTextIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  Trash2Icon,
  DownloadIcon,
} from "lucide-react";
import { OriginalDocumentPreview } from "@/components/knowledge/original-document-preview";
import { DocumentRenameDialog } from "@/components/knowledge/document-rename-dialog";
import type { DocumentRow } from "./page.knowledge-base";
import type { KnowledgePageViewModel } from "./page.knowledge-page.view";
import { statusLabel, statusVariant } from "./page.status-variant";
export function KnowledgeDocumentRow({
  doc,
  model,
}: {
  doc: DocumentRow;
  model: KnowledgePageViewModel;
}) {
  const {
    t,
    workspaceId,
    selectedId,
    selectedBaseCanEdit,
    openDocumentPreview,
    retryDocument,
    reindexDocument,
    setPendingDelete,
    loadDocuments,
  } = model;
  const [previewOpen, setPreviewOpen] = useState(false);
  const documentUrl = `/api/workspace/knowledge-bases/${selectedId}/documents/${doc.id}?workspaceId=${workspaceId}`;
  const originalUrl = `/api/workspace/knowledge-bases/${selectedId}/documents/${doc.id}/raw?workspaceId=${workspaceId}`;
  const hasOriginal = Boolean(doc.objectStorageKey);
  const openPreview = () =>
    hasOriginal ? setPreviewOpen(true) : void openDocumentPreview(doc.id);
  return (
    <>
      <article
        key={doc.id}
        className="group grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/25 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/55 bg-background text-muted-foreground">
          <FileTextIcon className="size-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="min-w-0 truncate text-left text-sm font-medium hover:text-primary disabled:cursor-default disabled:hover:text-foreground"
              disabled={!hasOriginal && doc.status !== "ready"}
              onClick={openPreview}
            >
              {doc.title}
            </button>
            <span className="hidden shrink-0 text-[0.65rem] text-muted-foreground sm:inline">
              {new Date(doc.createdAt).toLocaleDateString()}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div
              className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-muted sm:max-w-44"
              role="progressbar"
              aria-label={t("documentProgress", {
                name: doc.title,
              })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={doc.processingProgress}
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500",
                  doc.status === "failed" ? "bg-destructive" : "bg-primary",
                )}
                style={{
                  width: `${doc.processingProgress}%`,
                }}
              />
            </div>
            <span className="w-8 text-right text-[0.65rem] tabular-nums text-muted-foreground">
              {doc.processingProgress}%
            </span>
            <span className="hidden truncate text-[0.65rem] text-muted-foreground md:inline">
              {t(`processingStage.${doc.processingStage}`)}
            </span>
          </div>
          {doc.errorMessage ? (
            <p
              className={cn(
                "mt-1 truncate text-[0.65rem]",
                doc.status === "ready" ? "text-warning" : "text-destructive",
              )}
              title={doc.errorMessage}
            >
              {doc.errorMessage}
            </p>
          ) : null}
        </div>
        <div className="col-span-2 flex flex-wrap items-center justify-end gap-1 sm:col-span-1">
          <Badge variant={statusVariant(doc.status)} className="text-[0.62rem]">
            {statusLabel(doc.status, t)}
          </Badge>
          {hasOriginal || doc.status === "ready" ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t("previewAria", {
                name: doc.title,
              })}
              onClick={openPreview}
            >
              <EyeIcon aria-hidden="true" />
            </Button>
          ) : null}
          {hasOriginal && (
            <Button asChild size="icon" variant="ghost">
              <a
                href={`${originalUrl}&download=1`}
                aria-label={t("downloadOriginalAria", { name: doc.title })}
              >
                <DownloadIcon />
              </a>
            </Button>
          )}
          {selectedBaseCanEdit && (
            <DocumentRenameDialog
              title={doc.title}
              url={documentUrl}
              onRenamed={loadDocuments}
            />
          )}
          {selectedBaseCanEdit && doc.status === "failed" ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t("retryAria", {
                name: doc.title,
              })}
              onClick={() => void retryDocument(doc.id)}
            >
              <RefreshCwIcon aria-hidden="true" />
            </Button>
          ) : null}
          {selectedBaseCanEdit ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={doc.status === "processing"}
              aria-label={t("reindexAria", {
                name: doc.title,
              })}
              onClick={() => void reindexDocument(doc.id)}
            >
              <RotateCcwIcon aria-hidden="true" />
            </Button>
          ) : null}
          {selectedBaseCanEdit ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t("deleteAria", {
                name: doc.title,
              })}
              onClick={() =>
                setPendingDelete({
                  kind: "document",
                  id: doc.id,
                  name: doc.title,
                })
              }
            >
              <Trash2Icon aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </article>
      {hasOriginal && (
        <OriginalDocumentPreview
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          title={doc.title}
          url={originalUrl}
          mimeType={doc.mimeType ?? null}
        />
      )}
    </>
  );
}
