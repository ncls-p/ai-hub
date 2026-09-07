"use client";

import {
  Building2Icon,
  EllipsisIcon,
  FolderKanbanIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useWorkspace } from "@/hooks/use-workspace";
import { useRouter } from "@/i18n/navigation";
import { fetchJson } from "@/lib/api-client";

type Action =
  | "renameProject"
  | "renameOrganization"
  | "deleteProject"
  | "deleteOrganization";

type ScopeLifecycleDialogProps = {
  organization: { name: string; slug: string };
  project: { name: string; slug: string };
  canManageProject: boolean;
  canManageOrganization: boolean;
  canDeleteProject: boolean;
  canDeleteOrganization: boolean;
  onRenamed: () => Promise<void>;
};

export function ScopeLifecycleDialog({
  organization,
  project,
  canManageProject,
  canManageOrganization,
  canDeleteProject,
  canDeleteOrganization,
  onRenamed,
}: ScopeLifecycleDialogProps) {
  const t = useTranslations("access");
  const router = useRouter();
  const { workspaceId, setWorkspaceId, refresh } = useWorkspace();
  const [action, setAction] = useState<Action | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isProject = action === "renameProject" || action === "deleteProject";
  const isRename =
    action === "renameProject" || action === "renameOrganization";
  const current = isProject ? project : organization;

  function openAction(nextAction: Action) {
    const value =
      nextAction === "renameProject" || nextAction === "deleteProject"
        ? project
        : organization;
    setName(value.name);
    setSlug(value.slug);
    setConfirmation("");
    setError(null);
    setAction(nextAction);
  }

  async function submit() {
    if (!action || !workspaceId) return;
    setPending(true);
    setError(null);
    try {
      const result = await fetchJson<{
        nextWorkspaceId?: string | null;
      }>("/api/workspace/iam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          workspaceId,
          ...(isRename ? { name, slug } : { confirmationName: confirmation }),
        }),
      });
      await refresh();
      if (isRename) {
        await onRenamed();
      } else if (result.nextWorkspaceId) {
        setWorkspaceId(result.nextWorkspaceId);
      } else {
        router.replace("/setup");
      }
      setAction(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("mutationError"));
    } finally {
      setPending(false);
    }
  }

  const deleteConfirmed = confirmation.trim() === current.name;
  const canSubmit = isRename
    ? name.trim().length >= 2 && slug.trim().length > 0
    : deleteConfirmed;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline">
            <EllipsisIcon data-icon="inline-start" aria-hidden="true" />
            {t("manageScope")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-64">
          <DropdownMenuLabel>{t("projectActions")}</DropdownMenuLabel>
          {canManageProject || canDeleteProject ? (
            <>
              {canManageProject ? (
                <DropdownMenuItem onSelect={() => openAction("renameProject")}>
                  <PencilIcon aria-hidden="true" />
                  {t("renameProject")}
                </DropdownMenuItem>
              ) : null}
              {canDeleteProject ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => openAction("deleteProject")}
                >
                  <Trash2Icon aria-hidden="true" />
                  {t("deleteProject")}
                </DropdownMenuItem>
              ) : null}
            </>
          ) : null}
          {canManageProject && canManageOrganization ? (
            <DropdownMenuSeparator />
          ) : null}
          {canManageOrganization || canDeleteOrganization ? (
            <>
              <DropdownMenuLabel>{t("organizationActions")}</DropdownMenuLabel>
              {canManageOrganization ? (
                <DropdownMenuItem
                  onSelect={() => openAction("renameOrganization")}
                >
                  <PencilIcon aria-hidden="true" />
                  {t("renameOrganization")}
                </DropdownMenuItem>
              ) : null}
              {canDeleteOrganization ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => openAction("deleteOrganization")}
                >
                  <Trash2Icon aria-hidden="true" />
                  {t("deleteOrganization")}
                </DropdownMenuItem>
              ) : null}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={action !== null}
        onOpenChange={(open) => !open && setAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action ? t(`scopeLifecycleTitles.${action}`) : null}
            </DialogTitle>
            <DialogDescription>
              {action ? t(`scopeLifecycleDescriptions.${action}`) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
              {isProject ? (
                <FolderKanbanIcon aria-hidden="true" />
              ) : (
                <Building2Icon aria-hidden="true" />
              )}
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {current.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {current.slug}
                </span>
              </span>
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertTitle>{t("scopeLifecycleFailed")}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {isRename ? (
              <>
                <Field>
                  <FieldLabel htmlFor="scope-lifecycle-name">
                    {isProject ? t("projectName") : t("organizationName")}
                  </FieldLabel>
                  <Input
                    id="scope-lifecycle-name"
                    required
                    minLength={2}
                    maxLength={255}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoFocus
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="scope-lifecycle-slug">
                    {t("scopeUrl")}
                  </FieldLabel>
                  <Input
                    id="scope-lifecycle-slug"
                    required
                    maxLength={128}
                    value={slug}
                    onChange={(event) => setSlug(event.target.value)}
                  />
                  <FieldDescription>
                    {t("scopeUrlDescription")}
                  </FieldDescription>
                </Field>
              </>
            ) : (
              <>
                <Alert variant="destructive">
                  <AlertTitle>{t("permanentDeletion")}</AlertTitle>
                  <AlertDescription>
                    {action === "deleteProject"
                      ? t("deleteProjectWarning")
                      : t("deleteOrganizationWarning")}
                  </AlertDescription>
                </Alert>
                <Field>
                  <FieldLabel htmlFor="scope-delete-confirmation">
                    {t("typeNameToConfirm", { name: current.name })}
                  </FieldLabel>
                  <Input
                    id="scope-delete-confirmation"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    autoComplete="off"
                    autoFocus
                  />
                </Field>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setAction(null)}
            >
              {t("scopeLifecycleCancel")}
            </Button>
            <Button
              type="button"
              variant={isRename ? "default" : "destructive"}
              disabled={!canSubmit || pending}
              onClick={() => void submit()}
            >
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {isRename ? t("saveChanges") : t("deletePermanently")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
