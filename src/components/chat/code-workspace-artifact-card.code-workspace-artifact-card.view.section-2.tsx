import {
  Maximize2Icon,
  RefreshCcwIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";
import type React from "react";

import {
  MAX_CODE_WIDTH,
  MAX_FILES_WIDTH,
  MIN_CODE_WIDTH,
  MIN_FILES_WIDTH,
  resizeCodeWorkspacePane,
} from "@/components/chat/code-workspace-layout";
import { CodeWorkspacePreviewFrame } from "@/components/chat/code-workspace-preview-frame";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BUTTON_TYPE,
  COMPACT_ICON_CLASS,
  CodeWorkspaceResizeHandle,
  GHOST_VARIANT,
  OUTLINE_VARIANT,
} from "./code-workspace-artifact-card.button-type";
import type { CodeWorkspaceArtifactCardViewModel } from "./code-workspace-artifact-card.code-workspace-artifact-card.view";
import {
  CodeWorkspaceEditor,
  CodeWorkspaceFileTree,
} from "./code-workspace-artifact-card.code-workspace-file-tree";
import {
  CodeWorkspacePanesHidden,
  CodeWorkspacePopoutButton,
} from "./code-workspace-artifact-card.popout-button";
export function CodeWorkspaceArtifactCardSection2({
  model,
}: {
  model: CodeWorkspaceArtifactCardViewModel;
}) {
  const {
    content,
    currentArtifact,
    error,
    fileTree,
    loadingFile,
    paneId,
    popoutWindows,
    saveSelectedFile,
    canEdit,
    savingFile,
    selectedFile,
    selectedPath,
    setContent,
    setDeletePath,
    setFileReloadKey,
    setFullscreenPane,
    setSelectedPath,
    t,
    updateWorkspaceLayout,
    variant,
    visiblePanes,
    workspaceGridTemplate,
    workspaceLayout,
  } = model;
  return (
    <div
      className={cn(
        "grid min-h-[520px] grid-cols-1",
        variant === "workbench"
          ? "min-h-0 flex-1 overflow-y-auto lg:overflow-hidden lg:[grid-template-columns:var(--workspace-grid-template)]"
          : "lg:grid-cols-[13rem_minmax(0,1fr)_minmax(18rem,1fr)]",
      )}
      style={
        variant === "workbench"
          ? ({
              "--workspace-grid-template": workspaceGridTemplate,
            } as React.CSSProperties)
          : undefined
      }
    >
      {variant !== "workbench" || workspaceLayout.visible.files ? (
        <div
          className={cn(
            "flex min-w-0 flex-col border-b border-border/50 bg-muted/20 lg:border-b-0",
            variant === "workbench" && "min-h-[24rem] lg:min-h-0",
            variant !== "workbench" && "lg:border-r",
          )}
          id={paneId("files")}
        >
          <div className="border-b border-border/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            {t("files")}
          </div>
          <div
            className={cn(
              "overflow-auto p-2",
              variant === "workbench"
                ? "min-h-0 flex-1"
                : "max-h-64 lg:max-h-[480px]",
            )}
          >
            <CodeWorkspaceFileTree
              nodes={fileTree}
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
            />
          </div>
        </div>
      ) : null}
      {variant === "workbench" &&
      workspaceLayout.visible.files &&
      (workspaceLayout.visible.code || workspaceLayout.visible.preview) ? (
        <CodeWorkspaceResizeHandle
          controls={paneId("files")}
          label={t("resizeFilesPane")}
          maximum={MAX_FILES_WIDTH}
          minimum={MIN_FILES_WIDTH}
          onResize={(width) =>
            updateWorkspaceLayout((current) =>
              resizeCodeWorkspacePane(current, "files", width),
            )
          }
          value={workspaceLayout.filesWidth}
        />
      ) : null}
      {variant !== "workbench" || workspaceLayout.visible.code ? (
        <div
          className={cn(
            "flex min-w-0 flex-col border-b border-border/50 lg:border-b-0",
            variant === "workbench" && "min-h-[24rem] lg:min-h-0",
            variant !== "workbench" && "lg:border-r",
          )}
          id={paneId("code")}
        >
          <div className="flex min-h-10 items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">
                {selectedPath ?? t("noFileSelected")}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {selectedFile?.binary
                  ? t("binaryAsset")
                  : (selectedFile?.mimeType ?? t("selectFile"))}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {popoutWindows.canOpenEditorWindow ? (
                <CodeWorkspacePopoutButton
                  label={t("openEditorWindow")}
                  onClick={popoutWindows.openEditorWindow}
                />
              ) : null}
              <Button
                type={BUTTON_TYPE}
                variant={GHOST_VARIANT}
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={!selectedPath || selectedFile?.binary}
                onClick={() => setFullscreenPane("code")}
                aria-label={t("fullscreen")}
              >
                <Maximize2Icon
                  className={COMPACT_ICON_CLASS}
                  aria-hidden="true"
                />
              </Button>
              <Button
                type={BUTTON_TYPE}
                variant={GHOST_VARIANT}
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={!selectedPath || selectedFile?.binary || loadingFile}
                onClick={() => setFileReloadKey((key) => key + 1)}
                aria-label={t("refreshFile")}
              >
                <RefreshCcwIcon
                  className={COMPACT_ICON_CLASS}
                  aria-hidden="true"
                />
              </Button>
              <Button
                type={BUTTON_TYPE}
                variant={OUTLINE_VARIANT}
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={
                  !canEdit ||
                  !selectedPath ||
                  selectedFile?.binary ||
                  savingFile
                }
                onClick={() => void saveSelectedFile()}
              >
                <SaveIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
                {t("save")}
              </Button>
              <Button
                type={BUTTON_TYPE}
                variant={GHOST_VARIANT}
                size="sm"
                className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                disabled={!canEdit || !selectedPath || savingFile}
                onClick={() => setDeletePath(selectedPath)}
                aria-label={t("deleteFile")}
              >
                <Trash2Icon className={COMPACT_ICON_CLASS} aria-hidden="true" />
              </Button>
            </div>
          </div>
          {error ? (
            <div className="border-b border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
              {error}
            </div>
          ) : null}
          {selectedFile?.binary ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
              {t("binaryDescription")}
            </div>
          ) : (
            <CodeWorkspaceEditor
              value={loadingFile ? t("loadingFile") : content}
              filePath={selectedPath}
              disabled={!canEdit || !selectedPath || loadingFile || savingFile}
              onChange={setContent}
            />
          )}
        </div>
      ) : null}
      {variant === "workbench" &&
      workspaceLayout.visible.code &&
      workspaceLayout.visible.preview ? (
        <CodeWorkspaceResizeHandle
          controls={paneId("code")}
          label={t("resizeCodePane")}
          maximum={MAX_CODE_WIDTH}
          minimum={MIN_CODE_WIDTH}
          onResize={(width) =>
            updateWorkspaceLayout((current) =>
              resizeCodeWorkspacePane(current, "code", width),
            )
          }
          value={workspaceLayout.codeWidth}
        />
      ) : null}
      {variant !== "workbench" || workspaceLayout.visible.preview ? (
        <div
          className={cn(
            "flex min-w-0 flex-col bg-white",
            variant === "workbench" && "min-h-[24rem] lg:min-h-0",
          )}
          id={paneId("preview")}
        >
          <div className="flex min-h-10 items-center justify-between gap-2 border-b border-border/40 bg-background px-3 py-2">
            <div>
              <p className="font-medium text-foreground">{t("livePreview")}</p>
              <p className="text-[10px] text-muted-foreground">
                {currentArtifact.rootFile ?? t("noHtmlEntry")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <CodeWorkspacePopoutButton
                label={t("openPreviewWindow")}
                disabled={!popoutWindows.canOpenPreviewWindow}
                onClick={popoutWindows.openPreviewWindow}
              />
              <Button
                type={BUTTON_TYPE}
                variant={GHOST_VARIANT}
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={!currentArtifact.rootFile}
                onClick={() => setFullscreenPane("preview")}
                aria-label={t("fullscreen")}
              >
                <Maximize2Icon
                  className={COMPACT_ICON_CLASS}
                  aria-hidden="true"
                />
                <span className="hidden xl:inline">{t("fullscreen")}</span>
              </Button>
            </div>
          </div>
          <CodeWorkspacePreviewFrame
            key={`${currentArtifact.projectId}:${currentArtifact.version}:${currentArtifact.rootFile ?? "no-root"}`}
            artifact={currentArtifact}
          />
        </div>
      ) : null}
      {variant === "workbench" && visiblePanes.length === 0 ? (
        <CodeWorkspacePanesHidden
          onShowAll={() =>
            updateWorkspaceLayout((current) => ({
              ...current,
              visible: { files: true, code: true, preview: true },
            }))
          }
          t={t}
        />
      ) : null}
    </div>
  );
}
