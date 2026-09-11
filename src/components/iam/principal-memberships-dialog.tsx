"use client";

import { useEffect, useRef, useState } from "react";
import { UsersIcon } from "lucide-react";
import { fetchJson } from "@/lib/api-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { AccessSnapshot } from "./access-console.access-member";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import { PrincipalProjectAssignments } from "./principal-project-assignments";
import { PersonTeamMemberships } from "./person-team-memberships";

export type MembershipPrincipal = {
  id: string;
  name: string;
  type: "user" | "group";
};
export type MembershipMutation = (
  payload: Record<string, unknown>,
) => Promise<void>;

export function PrincipalMembershipsDialog({
  model,
  principal,
}: {
  model: AccessConsoleViewModel;
  principal: MembershipPrincipal;
}) {
  const { t, snapshot, workspaceId } = model;
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState(workspaceId);
  const [loaded, setLoaded] = useState<AccessSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const current = loaded?.activeProject.id === projectId ? loaded : null;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetchJson<AccessSnapshot>(`/api/workspace/iam?workspaceId=${projectId}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setLoaded(data);
          setLoadError(null);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setLoadError(
            error instanceof Error ? error.message : t("mutationError"),
          );
      });
    return () => controller.abort();
  }, [open, projectId, revision, t]);

  function reload() {
    setLoaded(null);
    setLoadError(null);
    setRevision((value) => value + 1);
  }

  const mutate: MembershipMutation = async (payload) => {
    if (busy.current || !current || loadError) return;
    busy.current = true;
    setPending(true);
    setMutationError(null);
    try {
      await fetchJson("/api/workspace/iam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: projectId, ...payload }),
      });
      reload();
      await model.load({ preserveData: true });
      await model.refreshWorkspaces();
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : t("mutationError"),
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (busy.current) return;
        setOpen(value);
        if (value) {
          setProjectId(workspaceId);
          setMutationError(null);
          reload();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={Boolean(model.pendingAction) || Boolean(model.refreshError)}
          aria-label={t("memberships.manageFor", { name: principal.name })}
        >
          <UsersIcon data-icon="inline-start" aria-hidden="true" />
          {t(
            principal.type === "user"
              ? "memberships.manage"
              : "memberships.projects",
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t("memberships.title", { name: principal.name })}
          </DialogTitle>
          <DialogDescription>
            {t(
              principal.type === "user"
                ? "memberships.description"
                : "memberships.teamDescription",
            )}
          </DialogDescription>
        </DialogHeader>
        {principal.type === "user" ? (
          <PersonTeamMemberships
            snapshot={current ?? snapshot}
            principal={principal}
            mutate={mutate}
            disabled={pending || !current || Boolean(loadError)}
            t={t}
          />
        ) : null}
        <Field>
          <FieldLabel htmlFor={`membership-project-${principal.id}`}>
            {t("memberships.project")}
          </FieldLabel>
          <Select
            value={projectId}
            disabled={pending}
            onValueChange={(id) => {
              setProjectId(id);
              setMutationError(null);
              reload();
            }}
          >
            <SelectTrigger
              id={`membership-project-${principal.id}`}
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {snapshot.projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {loadError ? (
          <Alert variant="destructive">
            <AlertDescription>
              <p>{loadError}</p>
              <Button variant="outline" onClick={reload}>
                {t("retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : !current ? (
          <p role="status" className="flex items-center gap-2 text-sm">
            <Spinner />
            {t("memberships.loading")}
          </p>
        ) : (
          <PrincipalProjectAssignments
            key={projectId}
            snapshot={current}
            principal={principal}
            mutate={mutate}
            pending={pending}
            t={t}
            roleLabel={model.roleLabel}
          />
        )}
        {mutationError ? (
          <Alert variant="destructive">
            <AlertDescription>{mutationError}</AlertDescription>
          </Alert>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
