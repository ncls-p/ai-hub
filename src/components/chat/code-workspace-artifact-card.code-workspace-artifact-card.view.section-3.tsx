import { Code2Icon, DownloadIcon, EyeIcon, FileIcon } from "lucide-react";

import { toggleCodeWorkspacePane } from "@/components/chat/code-workspace-layout";
import { ToolStateIcon } from "@/components/chat/tool-state-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BUTTON_TYPE,
  COMPACT_ICON_CLASS,
  GHOST_VARIANT,
  GithubIcon,
  OUTLINE_VARIANT,
} from "./code-workspace-artifact-card.button-type";
import type { CodeWorkspaceArtifactCardViewModel } from "./code-workspace-artifact-card.code-workspace-artifact-card.view";
export function CodeWorkspaceArtifactCardSection3({
  model,
}: {
  model: CodeWorkspaceArtifactCardViewModel;
}) {
  const {
    canEdit,
    currentArtifact,
    paneId,
    setPublishOpen,
    t,
    updateWorkspaceLayout,
    variant,
    workspaceLayout,
  } = model;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-2.5 py-1.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <ToolStateIcon state="completed" />
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">
            {currentArtifact.title}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {t("workspaceSummary", {
              version: currentArtifact.version,
              count: currentArtifact.files.length,
            })}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {variant === "workbench" ? (
          <div
            aria-label={t("workspacePanels")}
            className="flex items-center gap-0.5 rounded-xl border border-border/50 bg-muted/35 p-0.5"
            role="group"
          >
            {(
              [
                ["files", FileIcon, t("files")],
                ["code", Code2Icon, t("code")],
                ["preview", EyeIcon, t("preview")],
              ] as const
            ).map(([pane, Icon, label]) => {
              const visible = workspaceLayout.visible[pane];
              const actionLabel = visible
                ? t("hideWorkspacePane", { pane: label })
                : t("showWorkspacePane", { pane: label });
              return (
                <Button
                  key={pane}
                  aria-controls={paneId(pane)}
                  aria-label={actionLabel}
                  aria-pressed={visible}
                  className={cn(
                    "h-10 rounded-[10px] px-2.5 text-[11px] transition-[background-color,color,box-shadow,transform]",
                    visible && "bg-background text-foreground shadow-sm",
                  )}
                  onClick={() =>
                    updateWorkspaceLayout((current) =>
                      toggleCodeWorkspacePane(current, pane),
                    )
                  }
                  size="sm"
                  title={actionLabel}
                  type={BUTTON_TYPE}
                  variant={GHOST_VARIANT}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  <span className="hidden 2xl:inline">{label}</span>
                </Button>
              );
            })}
          </div>
        ) : null}
        <Button
          type={BUTTON_TYPE}
          variant={OUTLINE_VARIANT}
          size="sm"
          className="h-10 rounded-xl px-3 text-[11px]"
          disabled={!canEdit}
          onClick={() => setPublishOpen(true)}
        >
          <GithubIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
          GitHub
        </Button>
        <Button
          asChild
          type={BUTTON_TYPE}
          variant={OUTLINE_VARIANT}
          size="sm"
          className="h-10 rounded-xl px-3 text-[11px]"
        >
          <a href={currentArtifact.downloadUrl}>
            <DownloadIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
            ZIP
          </a>
        </Button>
      </div>
    </div>
  );
}
