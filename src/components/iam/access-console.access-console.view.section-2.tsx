import { useWorkspace } from "@/hooks/use-workspace";
import { Building2Icon, PlusIcon } from "lucide-react";

import { ScopeLifecycleDialog } from "@/components/iam/scope-lifecycle-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import {
  INITIAL_ORGANIZATION_FORM,
  INITIAL_PROJECT_FORM,
} from "./access-console.resource-transfer-preview";
import { MutatingButton } from "./access-console.scope-path";
export function AccessConsoleSection2({
  model,
}: {
  model: AccessConsoleViewModel;
}) {
  const { workspaces } = useWorkspace();
  const {
    canCreateProjects,
    canManageOrganizationLifecycle,
    canManageProjectLifecycle,
    load,
    mutate,
    organizationForm,
    organizationOpen,
    pendingAction,
    projectForm,
    projectOpen,
    setOrganizationForm,
    setOrganizationOpen,
    setProjectForm,
    setProjectOpen,
    setWorkspaceId,
    snapshot,
    t,
    workspaceId,
  } = model;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1 sm:max-w-md">
        <Field>
          <FieldLabel htmlFor="access-project">{t("activeProject")}</FieldLabel>
          <Select value={workspaceId ?? ""} onValueChange={setWorkspaceId}>
            <SelectTrigger id="access-project" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {workspaces.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="w-full sm:w-auto">
        <h3 className="py-2 text-sm font-medium">
          {t("simpleAccess.projectSettings")}
        </h3>
        <p className="max-w-md py-2 text-sm text-muted-foreground">
          {snapshot.organization.name} · {t("inheritanceHint")}
        </p>
        <div className="flex flex-wrap gap-2 py-2">
          {canManageProjectLifecycle ||
          canManageOrganizationLifecycle ||
          snapshot.actions.workspace["workspaces.delete"] ||
          snapshot.actions.organization["organization.delete"] ? (
            <ScopeLifecycleDialog
              organization={snapshot.organization}
              project={snapshot.activeProject}
              canManageProject={canManageProjectLifecycle}
              canManageOrganization={canManageOrganizationLifecycle}
              canDeleteProject={snapshot.actions.workspace["workspaces.delete"]}
              canDeleteOrganization={
                snapshot.actions.organization["organization.delete"]
              }
              onRenamed={() => load({ preserveData: true })}
            />
          ) : null}
          <Dialog open={organizationOpen} onOpenChange={setOrganizationOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline">
                <Building2Icon data-icon="inline-start" aria-hidden="true" />
                {t("newOrganization")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("createOrganizationTitle")}</DialogTitle>
                <DialogDescription>
                  {t("createOrganizationDescription")}
                </DialogDescription>
              </DialogHeader>
              <form
                className="contents"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const created = await mutate(
                    "createOrganization",
                    {
                      action: "createOrganization",
                      ...organizationForm,
                    },
                    t("organizationCreated"),
                    { close: () => setOrganizationOpen(false) },
                  );
                  if (created) setOrganizationForm(INITIAL_ORGANIZATION_FORM);
                }}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="organization-name">
                      {t("organizationName")}
                    </FieldLabel>
                    <Input
                      id="organization-name"
                      required
                      minLength={2}
                      value={organizationForm.organizationName}
                      onChange={(event) =>
                        setOrganizationForm((current) => ({
                          ...current,
                          organizationName: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="first-project-name">
                      {t("firstProjectName")}
                    </FieldLabel>
                    <Input
                      id="first-project-name"
                      minLength={2}
                      value={organizationForm.projectName}
                      onChange={(event) =>
                        setOrganizationForm((current) => ({
                          ...current,
                          projectName: event.target.value,
                        }))
                      }
                    />
                  </Field>
                </FieldGroup>
                <DialogFooter>
                  <MutatingButton
                    pending={pendingAction === "createOrganization"}
                  >
                    {t("createOrganization")}
                  </MutatingButton>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {canCreateProjects ? (
            <Dialog open={projectOpen} onOpenChange={setProjectOpen}>
              <DialogTrigger asChild>
                <Button type="button">
                  <PlusIcon data-icon="inline-start" aria-hidden="true" />
                  {t("newProject")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("createProjectTitle")}</DialogTitle>
                  <DialogDescription>
                    {t("createProjectDescription", {
                      organization: snapshot.organization.name,
                    })}
                  </DialogDescription>
                </DialogHeader>
                <form
                  className="contents"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const created = await mutate(
                      "createProject",
                      {
                        action: "createProject",
                        workspaceId,
                        ...projectForm,
                      },
                      t("projectCreated"),
                      { close: () => setProjectOpen(false) },
                    );
                    if (created) setProjectForm(INITIAL_PROJECT_FORM);
                  }}
                >
                  <Field>
                    <FieldLabel htmlFor="project-name">
                      {t("projectName")}
                    </FieldLabel>
                    <Input
                      id="project-name"
                      required
                      minLength={2}
                      value={projectForm.name}
                      onChange={(event) =>
                        setProjectForm({ name: event.target.value })
                      }
                    />
                  </Field>
                  <DialogFooter>
                    <MutatingButton pending={pendingAction === "createProject"}>
                      {t("createProject")}
                    </MutatingButton>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </div>
    </div>
  );
}
