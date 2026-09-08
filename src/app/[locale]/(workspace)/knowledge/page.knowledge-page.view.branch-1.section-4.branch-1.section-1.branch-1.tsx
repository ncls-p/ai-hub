import { KnowledgeDocumentRow } from "./page.document-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import type { KnowledgePageViewModel } from "./page.knowledge-page.view";
import { statusLabel } from "./page.status-variant";
export function KnowledgeDocumentTableBranch1({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const {
    documentCounts,
    documentFilter,
    documentFilteredCount,
    documentPageCount,
    documentSearch,
    documentTotalCount,
    safeDocumentPage,
    setDocumentFilter,
    setDocumentPage,
    setDocumentSearch,
    t,
    visibleDocuments,
  } = model;
  return (
    <>
      <div className="grid gap-3 border-b border-border/55 bg-muted/[0.18] p-3">
        <div className="grid grid-cols-3 gap-2 sm:max-w-md">
          {(["ready", "processing", "failed"] as const).map((status) => (
            <button
              key={status}
              type="button"
              className={cn(
                "rounded-lg border px-2.5 py-2 text-left transition-colors",
                documentFilter === status
                  ? "border-primary/35 bg-primary/8"
                  : "border-border/60 bg-background/60 hover:bg-muted/60",
              )}
              onClick={() => {
                setDocumentPage(1);
                setDocumentFilter((current) =>
                  current === status ? "all" : status,
                );
              }}
              aria-pressed={documentFilter === status}
            >
              <span className="block text-base font-semibold tabular-nums">
                {documentCounts[status]}
              </span>
              <span className="block truncate text-[0.65rem] text-muted-foreground">
                {statusLabel(status, t)}
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <SearchIcon
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              className="h-9 pl-9"
              type="search"
              value={documentSearch}
              onChange={(event) => {
                setDocumentPage(1);
                setDocumentSearch(event.target.value);
              }}
              placeholder={t("documentListSearchPlaceholder")}
              aria-label={t("documentListSearchLabel")}
            />
          </div>
          <p
            className="shrink-0 text-xs text-muted-foreground"
            aria-live="polite"
          >
            {t("documentListCount", {
              visible: documentFilteredCount,
              total: documentTotalCount,
            })}
          </p>
        </div>
      </div>

      {visibleDocuments.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm font-medium">{t("documentsFilteredEmpty")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("documentsFilteredEmptyHint")}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={() => {
              setDocumentFilter("all");
              setDocumentSearch("");
            }}
          >
            {t("clearDocumentFilters")}
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border/55">
          {visibleDocuments.map((doc) => (
            <KnowledgeDocumentRow key={doc.id} doc={doc} model={model} />
          ))}
        </div>
      )}

      {documentPageCount > 1 ? (
        <div className="flex items-center justify-between border-t border-border/55 px-3 py-2.5">
          <p className="text-xs text-muted-foreground">
            {t("documentPage", {
              page: safeDocumentPage,
              pages: documentPageCount,
            })}
          </p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              disabled={safeDocumentPage <= 1}
              aria-label={t("previousDocumentPage")}
              onClick={() =>
                setDocumentPage((current) => Math.max(1, current - 1))
              }
            >
              <ChevronLeftIcon aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              disabled={safeDocumentPage >= documentPageCount}
              aria-label={t("nextDocumentPage")}
              onClick={() =>
                setDocumentPage((current) =>
                  Math.min(documentPageCount, current + 1),
                )
              }
            >
              <ChevronRightIcon aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
