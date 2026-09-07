import {
  LockKeyholeIcon,
  PencilIcon,
  SearchIcon,
  ShieldIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import { ConfirmRemovalButton } from "./access-console.scope-path";
export function AccessRolesSection1({
  model,
}: {
  model: AccessConsoleViewModel;
}) {
  const {
    filteredRoles,
    mutate,
    pendingAction,
    roleLabel,
    roleQuery,
    setEditingRoleId,
    setPermissionQuery,
    setRoleEditorReadOnly,
    setRoleForm,
    setRoleOpen,
    setRoleQuery,
    setVisibleRoleCount,
    snapshot,
    t,
    visibleRoleCount,
    workspaceId,
  } = model;
  return (
    <CardContent className="flex flex-col gap-4 px-0">
      <div className="relative mx-6 max-w-md">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="role-search"
          className="pl-9"
          value={roleQuery}
          placeholder={t("searchRoles")}
          aria-label={t("searchRoles")}
          onChange={(event) => {
            setRoleQuery(event.target.value);
            setVisibleRoleCount(25);
          }}
        />
      </div>
      {filteredRoles.length === 0 ? (
        <Empty className="min-h-52">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{t("noSearchResults")}</EmptyTitle>
            <EmptyDescription>
              {t("noSearchResultsDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="@container min-w-0 border-y border-border/60">
          <table className="w-full table-fixed text-left @max-3xl:block">
            <thead className="@max-3xl:sr-only bg-muted/35 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="w-2/5 px-6 py-3">{t("roleColumn")}</th>
                <th className="px-3 py-3">{t("scope")}</th>
                <th className="px-3 py-3">{t("permissionsColumn")}</th>
                <th className="px-3 py-3">{t("assignmentsColumn")}</th>
                <th className="w-32 px-6 py-3 text-right">{t("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 @max-3xl:block">
              {filteredRoles.slice(0, visibleRoleCount).map((role) => {
                const assignmentCount = snapshot.assignments.filter(
                  (item) => item.roleId === role.id,
                ).length;
                const canManageRole = role.canUpdate;
                return (
                  <tr
                    key={role.id}
                    className="align-top transition-colors hover:bg-muted/20 @max-3xl:grid @max-3xl:grid-cols-2 @max-3xl:p-4"
                  >
                    <td className="px-6 py-4 @max-3xl:col-span-2 @max-3xl:px-0 @max-3xl:py-2">
                      <div className="min-w-0 break-words [overflow-wrap:anywhere]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            {roleLabel(role.name, role.displayName)}
                          </span>
                          {role.isSystem ? (
                            <Badge variant="secondary">
                              <LockKeyholeIcon aria-hidden="true" />
                              {t("builtIn")}
                            </Badge>
                          ) : (
                            <Badge variant="outline">{t("custom")}</Badge>
                          )}
                        </div>
                        <p className="mt-1 max-w-lg text-xs text-muted-foreground">
                          {role.description || t("noRoleDescription")}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <Badge variant="outline">
                        {role.scopeType === "organization"
                          ? t("organizationScope")
                          : t("projectScope")}
                      </Badge>
                    </td>
                    <td className="px-3 py-4">
                      <button
                        type="button"
                        className="text-left text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => {
                          setEditingRoleId(role.id);
                          setRoleEditorReadOnly(!role.canUpdate);
                          setRoleForm({
                            displayName: roleLabel(role.name, role.displayName),
                            description: role.description ?? "",
                            scopeType:
                              role.scopeType === "organization"
                                ? "organization"
                                : "workspace",
                            permissions: [...role.permissions],
                          });
                          setPermissionQuery("");
                          setRoleOpen(true);
                        }}
                      >
                        {t("permissionCount", {
                          count: role.permissions.length,
                        })}
                      </button>
                    </td>
                    <td className="px-3 py-4 text-sm text-muted-foreground">
                      {t("assignmentCount", {
                        count: assignmentCount,
                      })}
                    </td>
                    <td className="px-6 py-4 @max-3xl:col-span-2 @max-3xl:px-0 @max-3xl:py-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingRoleId(role.id);
                            setRoleEditorReadOnly(!role.canUpdate);
                            setRoleForm({
                              displayName: roleLabel(
                                role.name,
                                role.displayName,
                              ),
                              description: role.description ?? "",
                              scopeType:
                                role.scopeType === "organization"
                                  ? "organization"
                                  : "workspace",
                              permissions: [...role.permissions],
                            });
                            setPermissionQuery("");
                            setRoleOpen(true);
                          }}
                        >
                          {canManageRole ? (
                            <PencilIcon
                              data-icon="inline-start"
                              aria-hidden="true"
                            />
                          ) : null}
                          {canManageRole ? t("edit") : t("view")}
                        </Button>
                        {role.canDelete && assignmentCount === 0 ? (
                          <ConfirmRemovalButton
                            pending={pendingAction === `delete-role-${role.id}`}
                            label={t("deleteRole", {
                              name: role.displayName,
                            })}
                            title={t("deleteRoleTitle", {
                              name: role.displayName,
                            })}
                            description={t("deleteRoleDescription")}
                            onConfirm={() =>
                              void mutate(
                                `delete-role-${role.id}`,
                                {
                                  action: "deleteRole",
                                  workspaceId,
                                  roleId: role.id,
                                },
                                t("roleDeleted"),
                              )
                            }
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {filteredRoles.length > visibleRoleCount ? (
        <div className="flex justify-center px-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => setVisibleRoleCount((count) => count + 25)}
          >
            {t("showMore", {
              count: Math.min(25, filteredRoles.length - visibleRoleCount),
            })}
          </Button>
        </div>
      ) : null}
    </CardContent>
  );
}
