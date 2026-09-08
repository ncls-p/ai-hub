import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import type { KnowledgePageViewModel } from "./page.knowledge-page.view";
export function KnowledgeMainSection3({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const {
    previewDocument,
    previewError,
    previewLoading,
    setPreviewDocument,
    setPreviewError,
    setPreviewLoading,
    t,
  } = model;
  return (
    <Dialog
      open={previewLoading || previewError || previewDocument !== null}
      onOpenChange={(open) => {
        if (!open) {
          setPreviewDocument(null);
          setPreviewError(false);
          setPreviewLoading(false);
        }
      }}
    >
      <DialogContent className="flex max-h-[calc(100svh-2rem)] max-w-3xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4 text-left">
          <DialogTitle className="truncate pr-8">
            {previewDocument?.documentTitle ?? t("documentPreviewTitle")}
          </DialogTitle>
          <DialogDescription>
            {previewDocument
              ? previewDocument.originalUrl
                ? t("documentPdfPreviewDescription")
                : t("documentPreviewDescription", {
                    chunks: previewDocument.chunks.length,
                  })
              : t("documentPreviewLoading")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-4 py-4 sm:px-6">
          {previewLoading ? (
            <div
              className="flex min-h-64 items-center justify-center"
              aria-live="polite"
            >
              <Loader2
                className="size-5 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
              <span className="sr-only">{t("documentPreviewLoading")}</span>
            </div>
          ) : previewError ? (
            <div
              className="flex min-h-64 flex-col items-center justify-center text-center"
              role="alert"
            >
              <p className="text-sm font-medium">{t("documentPreviewError")}</p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                {t("documentPreviewErrorHint")}
              </p>
            </div>
          ) : previewDocument?.originalUrl ? (
            <iframe
              src={previewDocument.originalUrl}
              title={previewDocument.documentTitle}
              className="h-[min(72dvh,58rem)] w-full rounded-xl border bg-background"
            />
          ) : previewDocument ? (
            <article className="mx-auto max-w-2xl space-y-2">
              <p className="mb-4 rounded-xl border border-border/65 bg-background p-4 text-sm text-muted-foreground">
                {t("originalUnavailable")}
              </p>
              {previewDocument.chunks.map((chunk) => (
                <section
                  key={chunk.chunkId}
                  data-chunk-index={chunk.chunkIndex}
                  className="rounded-xl border border-border/65 bg-background px-5 py-4 shadow-sm sm:px-6"
                >
                  <p className="mb-2 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground">
                    {t("documentChunk", { number: chunk.chunkIndex + 1 })}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground/90">
                    {chunk.content}
                  </p>
                </section>
              ))}
            </article>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
