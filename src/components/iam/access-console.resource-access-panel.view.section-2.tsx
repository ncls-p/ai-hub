import { PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";

import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { ResourceAccessPanelViewModel } from "./access-console.resource-access-panel.view";
export function ResourceAccessPanelSection2({
  model,
}: {
  model: ResourceAccessPanelViewModel;
}) {
  const {
    assignResourceRole,
    assignmentQuery,
    details,
    detailsLoading,
    detailsError,
    loadDetails,
    filteredGroupedAssignments,
    filteredPrincipals,
    includeDependencies,
    pending,
    principalIds,
    principalQuery,
    principalType,
    removeResourceAssignment,
    roleId,
    selected,
    setAssignmentQuery,
    setDetails,
    setIncludeDependencies,
    setPrincipalIds,
    setPrincipalQuery,
    setPrincipalType,
    setRoleId,
    setSelected,
    t,
  } = model;
  return (
    <Dialog
      open={Boolean(selected)}
      onOpenChange={(open) => {
        if (!open && !pending) {
          setSelected(null);
          setDetails(null);
        }
      }}
    >
      <DialogContent className="max-h-[90vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {selected
              ? t("resourceAccessTitle", { name: selected.name })
              : t("resourceAccess")}
          </DialogTitle>
          <DialogDescription>
            {t("resourceAccessDescription")}
          </DialogDescription>
        </DialogHeader>
        {detailsError ? (
          <Alert variant="destructive">
            <AlertTitle>{t("resourcesLoadFailed")}</AlertTitle>
            <AlertDescription>
              {detailsError}
              <Button
                type="button"
                variant="outline"
                disabled={detailsLoading}
                onClick={() => selected && void loadDetails(selected)}
              >
                {t("retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : detailsLoading || !details ? (
          <div className="flex min-h-48 items-center justify-center">
            <Spinner />
            <span className="sr-only">{t("loadingResources")}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {details.capabilities.canManageResourceAccess ? (
              <form
                className="grid min-w-0 grid-cols-1 gap-4 border-b pb-5 sm:grid-cols-2"
                onSubmit={assignResourceRole}
              >
                <Field className="min-w-0">
                  <FieldLabel htmlFor="resource-principal-type">
                    {t("principalType")}
                  </FieldLabel>
                  <Select
                    value={principalType}
                    onValueChange={(value) => {
                      setPrincipalType(value as "user" | "group");
                      setPrincipalIds([]);
                    }}
                  >
                    <SelectTrigger
                      id="resource-principal-type"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="user">{t("member")}</SelectItem>
                        <SelectItem value="group">{t("team")}</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field className="min-w-0 sm:col-span-2 sm:row-start-2">
                  <FieldLabel htmlFor="resource-principal">
                    {t("principal")}
                  </FieldLabel>
                  <Input
                    value={principalQuery}
                    onChange={(event) => setPrincipalQuery(event.target.value)}
                    placeholder={t("searchPrincipal")}
                    aria-label={t("searchPrincipal")}
                    className="mb-2"
                  />
                  <div
                    id="resource-principal"
                    className="max-h-40 flex flex-col gap-1 overflow-y-auto rounded-md border p-2"
                  >
                    {filteredPrincipals.map((principal) => {
                      const id =
                        "userId" in principal ? principal.userId : principal.id;
                      return (
                        <label
                          key={principal.id}
                          className="flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 hover:bg-muted"
                        >
                          <Checkbox
                            aria-label={principal.name}
                            checked={principalIds.includes(id)}
                            onCheckedChange={(checked) =>
                              setPrincipalIds((current) =>
                                checked
                                  ? [...new Set([...current, id])]
                                  : current.filter((value) => value !== id),
                              )
                            }
                          />
                          <span className="min-w-0 text-sm">
                            <span className="block truncate font-medium">
                              {principal.name}
                            </span>
                            {"email" in principal ? (
                              <span className="block truncate text-muted-foreground">
                                {principal.email}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </Field>
                <Field className="min-w-0">
                  <FieldLabel htmlFor="resource-role">{t("role")}</FieldLabel>
                  <Select value={roleId} onValueChange={setRoleId}>
                    <SelectTrigger id="resource-role" className="w-full">
                      <SelectValue placeholder={t("choose")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {details.roles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.displayName}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                {selected?.type === "agent" ? (
                  <label className="flex items-start gap-2 sm:col-span-2">
                    <Checkbox
                      aria-label={t("shareAgentDependencies")}
                      checked={includeDependencies}
                      onCheckedChange={(checked) =>
                        setIncludeDependencies(Boolean(checked))
                      }
                    />
                    <span className="text-sm">
                      <span className="block font-medium">
                        {t("shareAgentDependencies")}
                      </span>
                      <span className="block text-muted-foreground">
                        {t("shareAgentDependenciesDescription")}
                      </span>
                    </span>
                  </label>
                ) : null}
                <Button
                  className="sm:col-span-2 sm:justify-self-end"
                  type="submit"
                  disabled={
                    principalIds.length === 0 || !roleId || Boolean(pending)
                  }
                >
                  {pending === "assign" ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <PlusIcon data-icon="inline-start" aria-hidden="true" />
                  )}
                  {t("grantResourceAccess")}
                </Button>
              </form>
            ) : null}

            <div className="relative">
              <SearchIcon
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                className="pl-9"
                value={assignmentQuery}
                onChange={(event) => setAssignmentQuery(event.target.value)}
                placeholder={t("searchResourceAccess")}
                aria-label={t("searchResourceAccess")}
              />
            </div>

            <div className="@container min-w-0 border-y">
              <table className="w-full table-fixed text-left @max-xl:block">
                <thead className="text-xs text-muted-foreground @max-xl:sr-only">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t("principal")}</th>
                    <th className="px-4 py-3 font-medium">{t("role")}</th>
                    <th className="px-4 py-3 text-right font-medium">
                      {t("actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y @max-xl:block">
                  {filteredGroupedAssignments.map(([principalKey, group]) => (
                    <tr
                      key={principalKey}
                      className="@max-xl:grid @max-xl:grid-cols-[minmax(0,1fr)_auto]"
                    >
                      <td className="px-4 py-3 @max-xl:col-span-2">
                        <div className="break-words [overflow-wrap:anywhere] font-medium">
                          {group.principalName}
                        </div>
                        {group.principalDetail ? (
                          <div className="break-all text-xs text-muted-foreground">
                            {group.principalDetail}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {group.assignments.map((assignment) => (
                            <span
                              key={assignment.id}
                              className="flex min-w-0 flex-col gap-1"
                            >
                              <span className="text-sm break-words [overflow-wrap:anywhere]">
                                {assignment.roleName}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {assignment.scope === "resource"
                                  ? t("resourceScope")
                                  : assignment.scope === "organization"
                                    ? t("organizationScope")
                                    : t("projectScope")}
                              </span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {group.assignments.some(
                          (assignment) => assignment.scope === "resource",
                        ) && details.capabilities.canManageResourceAccess ? (
                          <div className="flex justify-end gap-1">
                            {group.assignments
                              .filter(
                                (assignment) => assignment.scope === "resource",
                              )
                              .map((assignment) => (
                                <Button
                                  key={assignment.id}
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={t("removeResourceRole", {
                                    role: assignment.roleName,
                                    name: assignment.principalName,
                                  })}
                                  disabled={Boolean(pending)}
                                  onClick={() =>
                                    void removeResourceAssignment(assignment.id)
                                  }
                                >
                                  {pending === assignment.id ? (
                                    <Spinner />
                                  ) : (
                                    <Trash2Icon aria-hidden="true" />
                                  )}
                                </Button>
                              ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {t("inherited")}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredGroupedAssignments.length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-8 text-center text-sm text-muted-foreground"
                        colSpan={3}
                      >
                        {t("noResourceAccessResults")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
