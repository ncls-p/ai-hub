import { SaveIcon } from "lucide-react";

import { CodeWorkspacePreviewFrame } from "@/components/chat/code-workspace-preview-frame";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BUTTON_TYPE,
  COMPACT_ICON_CLASS,
  OUTLINE_VARIANT,
} from "./code-workspace-artifact-card.button-type";
import type { CodeWorkspaceArtifactCardViewModel } from "./code-workspace-artifact-card.code-workspace-artifact-card.view";
import { CodeWorkspaceEditor } from "./code-workspace-artifact-card.code-workspace-file-tree";
import { CodeWorkspacePopoutButton } from "./code-workspace-artifact-card.popout-button";
export function CodeWorkspaceArtifactCardSection1({
  model,
}: {
  model: CodeWorkspaceArtifactCardViewModel;
}) {
  const {
    content,
    currentArtifact,
    fullscreenPane,
    loadingFile,
    popoutWindows,
    saveSelectedFile,
    savingFile,
    canEdit,
    selectedFile,
    selectedPath,
    setContent,
    setFullscreenPane,
    t,
  } = model;
  return (
    <Dialog
      open={fullscreenPane !== null}
      onOpenChange={(open) => !open && setFullscreenPane(null)}
    >
      <DialogContent className="!fixed !inset-0 flex !h-dvh !w-full !translate-x-0 !translate-y-0 flex-col overflow-hidden !rounded-none !border-0 bg-background p-0 sm:!max-w-none">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <DialogTitle className="truncate text-base font-semibold">
              {fullscreenPane === "preview"
                ? t("livePreview")
                : (selectedPath ?? t("code"))}
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
              {currentArtifact.title} · v{currentArtifact.version}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 pr-8">
            {fullscreenPane === "preview" ? (
              <CodeWorkspacePopoutButton
                label={t("openPreviewWindow")}
                disabled={!popoutWindows.canOpenPreviewWindow}
                onClick={popoutWindows.openPreviewWindow}
                size="regular"
              />
            ) : null}
            {fullscreenPane === "code" && popoutWindows.canOpenEditorWindow ? (
              <CodeWorkspacePopoutButton
                label={t("openEditorWindow")}
                onClick={popoutWindows.openEditorWindow}
                size="regular"
              />
            ) : null}
            {fullscreenPane === "code" ? (
              <Button
                type={BUTTON_TYPE}
                variant={OUTLINE_VARIANT}
                size="sm"
                disabled={
                  !canEdit ||
                  !selectedPath ||
                  selectedFile?.binary ||
                  loadingFile ||
                  savingFile
                }
                onClick={() => void saveSelectedFile()}
              >
                <SaveIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
                {t("save")}
              </Button>
            ) : null}
          </div>
        </div>
        {fullscreenPane === "preview" ? (
          <div className="flex min-h-0 flex-1 bg-white">
            <CodeWorkspacePreviewFrame
              key={`fullscreen:${currentArtifact.projectId}:${currentArtifact.version}:${currentArtifact.rootFile ?? "no-root"}`}
              artifact={currentArtifact}
            />
          </div>
        ) : null}
        {fullscreenPane === "code" ? (
          <CodeWorkspaceEditor
            value={loadingFile ? t("loadingFile") : content}
            filePath={selectedPath}
            disabled={!canEdit || !selectedPath || loadingFile || savingFile}
            onChange={setContent}
            className="min-h-0 flex-1"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
