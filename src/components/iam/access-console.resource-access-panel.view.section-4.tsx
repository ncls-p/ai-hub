import {
  ArrowRightLeftIcon,
  BoxesIcon,
  EllipsisIcon,
  SearchIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { ResourceAccessPanelViewModel } from "./access-console.resource-access-panel.view";
export function ResourceAccessPanelSection4({
  model,
}: {
  model: ResourceAccessPanelViewModel;
}) {
  const {
    canManageResources,
    definitions,
    loadDetails,
    loadResources,
    loadingMoreResources,
    loadingResources,
    nextResourceOffset,
    openTransfer,
    query,
    resourceType,
    resources,
    resourcesError,
    setAssignmentQuery,
    setDeletingResource,
    setDetails,
    setNextResourceOffset,
    setPrincipalIds,
    setQuery,
    setResourceType,
    setResources,
    setRoleId,
    setSelected,
    t,
  } = model;
  return (
    <CardContent className="flex flex-col gap-4 px-0">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <Field>
          <FieldLabel htmlFor="resource-type">{t("resourceType")}</FieldLabel>
          <Select
            value={resourceType}
            onValueChange={(value) => {
              setResourceType(value);
              setResources([]);
              setNextResourceOffset(null);
            }}
          >
            <SelectTrigger id="resource-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {definitions.map((definition) => (
                  <SelectItem key={definition.type} value={definition.type}>
                    {t(`resourceTypes.${definition.type}`)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="resource-search">
            {t("searchResources")}
          </FieldLabel>
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="resource-search"
              className="pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchResourcesPlaceholder")}
            />
          </div>
        </Field>
      </div>

      {resourcesError ? (
        <Alert variant="destructive">
          <AlertTitle>{t("resourcesLoadFailed")}</AlertTitle>
          <AlertDescription>
            {resourcesError}
            <Button
              type="button"
              variant="outline"
              disabled={loadingResources || loadingMoreResources}
              onClick={() => void loadResources()}
            >
              {t("retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : loadingResources ? (
        <div className="flex min-h-40 items-center justify-center">
          <Spinner />
          <span className="sr-only">{t("loadingResources")}</span>
        </div>
      ) : resources.length === 0 ? (
        <Empty className="min-h-48 border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BoxesIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{t("noResources")}</EmptyTitle>
            <EmptyDescription>{t("noResourcesDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="@container min-w-0 border-y">
          <table className="w-full table-fixed text-left @max-xl:block">
            <thead className="text-xs text-muted-foreground @max-xl:sr-only">
              <tr>
                <th className="px-4 py-3 font-medium">{t("resource")}</th>
                <th className="w-64 px-4 py-3 text-right font-medium">
                  {t("actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y @max-xl:block">
              {resources.map((resource) => (
                <tr
                  key={resource.id}
                  className="hover:bg-muted/25 @max-xl:block"
                >
                  <td className="px-4 py-3 @max-xl:block">
                    <span className="break-words [overflow-wrap:anywhere] font-medium">
                      {resource.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right @max-xl:block">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelected(resource);
                          setDetails(null);
                          setPrincipalIds([]);
                          setRoleId("");
                          setAssignmentQuery("");
                          void loadDetails(resource);
                        }}
                      >
                        <ShieldCheckIcon
                          data-icon="inline-start"
                          aria-hidden="true"
                        />
                        {t("manageResourceAccess")}
                      </Button>
                      {canManageResources ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              aria-label={t("simpleAccess.resourceActions", {
                                name: resource.name,
                              })}
                            >
                              <EllipsisIcon aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                onSelect={() => void openTransfer(resource)}
                              >
                                <ArrowRightLeftIcon aria-hidden="true" />
                                {t("transfer")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => setDeletingResource(resource)}
                              >
                                <Trash2Icon aria-hidden="true" />
                                {t("deleteResource", { name: resource.name })}
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {nextResourceOffset !== null ? (
            <div className="flex justify-center border-t bg-muted/15 p-3">
              <Button
                type="button"
                variant="outline"
                disabled={loadingMoreResources}
                onClick={() => void loadResources(nextResourceOffset)}
              >
                {loadingMoreResources ? (
                  <Spinner data-icon="inline-start" />
                ) : null}
                {t("loadMoreResources")}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </CardContent>
  );
}
