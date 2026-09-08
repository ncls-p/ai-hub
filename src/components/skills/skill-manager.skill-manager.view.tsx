import { DestructiveConfirmationDialog } from "@/components/destructive-confirmation-dialog";
import { ResourceShareDialog } from "@/components/marketplace/resource-share-dialog";
import { ResourcePackageExport } from "@/components/marketplace/resource-package-export";
import { ResourceProvenanceBadge } from "@/components/resource-provenance-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookMarkedIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Share2,
  Trash2Icon,
} from "lucide-react";
import {
  BUTTON_TYPE,
  SKILLS_PAGE_SIZE,
  SkillDetailDialog,
  fileCount,
} from "./skill-manager.button-type";
import { SkillEditorDialog } from "./skill-manager.skill-editor-dialog";
import type { useSkillManagerController } from "./skill-manager.skill-manager";
import { SkillManagerSection1 } from "./skill-manager.skill-manager.view.section-1";
import { SkillManagerSection2 } from "./skill-manager.skill-manager.view.section-2";

export type SkillManagerViewModel = Extract<
  ReturnType<typeof useSkillManagerController>,
  { kind: "ready" }
>;
export function SkillManagerView({ model }: { model: SkillManagerViewModel }) {
  const {
    canManageTenantGlobals,
    deleteSkill,
    deletingSkillId,
    editorState,
    filteredSkills,
    loadError,
    loadSkills,
    loading,
    pendingDeleteSkill,
    retryLoadSkills,
    setEditorState,
    setPendingDeleteSkill,
    setShareResource,
    setVisibleCount,
    shareResource,
    skills,
    t,
    tShare,
    visibleCount,
    visibleSkills,
    workspaceId,
  } = model;
  return (
    <div className="space-y-3">
      <SkillManagerSection2 model={model} />

      <SkillManagerSection1 model={model} />

      {loading ? (
        <div className="overflow-hidden rounded-2xl border border-border/65 bg-card">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-3 border-b border-border/55 p-4 last:border-b-0"
            >
              <Skeleton className="size-9 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-3/5" />
              </div>
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div
          className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-center"
          role="alert"
        >
          <p className="text-sm font-medium">{t("loadFailed")}</p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
            {t("loadFailedDescription")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => void retryLoadSkills()}
          >
            {t("retry")}
          </Button>
        </div>
      ) : skills.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{t("emptyTitle")}</p>
          <p className="mt-1">{t("emptyDescription")}</p>
        </div>
      ) : filteredSkills.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{t("noResultsTitle")}</p>
          <p className="mt-1">{t("noResultsDescription")}</p>
        </div>
      ) : (
        <>
          <div
            role="list"
            className="overflow-hidden rounded-2xl border border-border/65 bg-card/85 shadow-[var(--surface-shadow)]"
          >
            {visibleSkills.map((skill) => (
              <article
                key={skill.id}
                role="listitem"
                className="group/skill flex flex-col gap-3 border-b border-border/55 p-3.5 last:border-b-0 sm:flex-row sm:items-center"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
                  <BookMarkedIcon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold">
                      {skill.name}
                    </h3>
                    <ResourceProvenanceBadge provenance={skill.provenance} />
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {skill.description || t("noDescription")}
                  </p>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:max-w-[42%] sm:justify-end">
                  <Badge variant={skill.isGlobal ? "secondary" : "outline"}>
                    {skill.isGlobal
                      ? t("scopeOrganization")
                      : t("scopePrivate")}
                  </Badge>
                  <Badge variant="outline" className="max-w-44 truncate">
                    {skill.sourcePackage || t("manual")}
                  </Badge>
                  <span className="px-1 text-xs text-muted-foreground">
                    {t("fileCount", {
                      count: fileCount(skill.markdownFilesJson),
                    })}
                  </span>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-1">
                  <SkillDetailDialog skill={skill} />
                  {skill.canEdit ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type={BUTTON_TYPE}
                          variant="ghost"
                          size="icon"
                          className="size-10"
                          aria-label={t("actionsAria", { name: skill.name })}
                        >
                          <MoreHorizontalIcon aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <ResourcePackageExport
                          presentation="menu-item"
                          workspaceId={workspaceId}
                          resource={{
                            kind: "skill",
                            id: skill.id,
                            name: skill.name,
                          }}
                        />
                        <DropdownMenuItem
                          onSelect={() =>
                            window.requestAnimationFrame(() =>
                              setEditorState({ skill }),
                            )
                          }
                        >
                          <PencilIcon aria-hidden="true" />
                          {t("edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            setShareResource({
                              kind: "skill",
                              id: skill.id,
                              name: skill.name,
                              description: skill.description,
                            })
                          }
                        >
                          <Share2 aria-hidden="true" />
                          {tShare("action")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setPendingDeleteSkill(skill)}
                        >
                          <Trash2Icon aria-hidden="true" />
                          {t("deleteConfirm")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          {visibleCount < filteredSkills.length ? (
            <div className="flex justify-center pt-1">
              <Button
                type={BUTTON_TYPE}
                variant="outline"
                onClick={() =>
                  setVisibleCount((current) => current + SKILLS_PAGE_SIZE)
                }
              >
                {t("showMore", {
                  count: Math.min(
                    SKILLS_PAGE_SIZE,
                    filteredSkills.length - visibleCount,
                  ),
                })}
              </Button>
            </div>
          ) : null}
        </>
      )}

      {editorState ? (
        <SkillEditorDialog
          key={editorState.skill?.id ?? "create"}
          skill={editorState.skill}
          open
          onOpenChange={(open) => {
            if (!open) setEditorState(null);
          }}
          onSaved={loadSkills}
          canManageGlobal={canManageTenantGlobals}
        />
      ) : null}
      <ResourceShareDialog
        resource={shareResource}
        workspaceId={workspaceId}
        open={shareResource !== null}
        onCloseAction={() => setShareResource(null)}
      />
      <DestructiveConfirmationDialog
        open={pendingDeleteSkill !== null}
        title={t("deleteTitle")}
        description={t("deleteDescription", {
          name: pendingDeleteSkill?.name ?? "",
        })}
        cancelLabel={t("deleteCancel")}
        confirmLabel={deletingSkillId ? t("deleting") : t("deleteConfirm")}
        busy={deletingSkillId !== null}
        onOpenChange={(open) => {
          if (!open && !deletingSkillId) setPendingDeleteSkill(null);
        }}
        onConfirm={() => {
          if (pendingDeleteSkill) void deleteSkill(pendingDeleteSkill);
        }}
      />
    </div>
  );
}
