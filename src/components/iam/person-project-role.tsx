"use client";

import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import { builtInRoleKey } from "./access-console.resource-transfer-preview";

type Person = AccessConsoleViewModel["visiblePeople"][number];

export function PersonProjectRole({
  model,
  person,
}: {
  model: AccessConsoleViewModel;
  person: Person;
}) {
  const {
    snapshot,
    t,
    mutate,
    pendingAction,
    refreshError,
    workspaceId,
    roleLabel,
  } = model;
  const directRoles = person.assignments.filter(
    (item) => item.scope === "project" && !item.inherited,
  );
  const currentRole = directRoles.length === 1 ? directRoles[0] : undefined;
  const roles = snapshot.roles.filter(
    (role) =>
      role.scopeType === "workspace" &&
      role.permissions.includes("workspaces.get") &&
      snapshot.assignableRoleIds.includes(role.id),
  );
  const canChange =
    person.memberStatus === "active" &&
    snapshot.subordinateIds.workspace.includes(person.userId) &&
    snapshot.actions.workspace["roles.assign"] &&
    (directRoles.length === 0 || snapshot.actions.workspace["roles.revoke"]);
  const label = (name: string, fallback: string) => {
    const key = builtInRoleKey(name);
    return key === "projectAdmin" ||
      key === "projectEditor" ||
      key === "projectViewer"
      ? t(`simpleAccess.roleNames.${key}`)
      : roleLabel(name, fallback);
  };
  const currentLabel = currentRole
    ? label(currentRole.roleKey, currentRole.roleName)
    : directRoles.length > 1
      ? t("simpleAccess.multipleRoles")
      : t("simpleAccess.noDirectRole");
  const isOwner = person.assignments.some(
    (item) => item.roleKey === "organization.owner",
  );
  const hasOtherAccess =
    person.assignments.some(
      (item) =>
        (item.scope !== "project" || item.inherited) &&
        item.roleKey !== "organization.member",
    ) || person.teams.length > 0;
  const key = `person-role-${person.userId}`;
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      {canChange && roles.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto min-h-10 max-w-full justify-between gap-2 whitespace-normal text-left"
              aria-label={t("simpleAccess.changePersonRole", {
                name: person.name,
                role: currentLabel,
              })}
              disabled={Boolean(pendingAction) || Boolean(refreshError)}
            >
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                {currentLabel}
              </span>
              {pendingAction === key ? (
                <Spinner />
              ) : (
                <ChevronDownIcon aria-hidden="true" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-80 max-w-[calc(100vw-2rem)]"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                {t("simpleAccess.projectRole")}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={currentRole?.roleId ?? ""}
                onValueChange={(roleId) => {
                  if (
                    roleId === currentRole?.roleId ||
                    pendingAction ||
                    refreshError
                  )
                    return;
                  void mutate(
                    key,
                    {
                      action: "assignRole",
                      workspaceId,
                      principalType: "user",
                      principalId: person.userId,
                      scopeType: "workspace",
                      roleId,
                      replaceExisting: directRoles.length > 0,
                    },
                    t("roleAssigned"),
                  );
                }}
              >
                {roles.map((role) => (
                  <DropdownMenuRadioItem
                    key={role.id}
                    value={role.id}
                    className="items-start py-3"
                    disabled={Boolean(pendingAction) || Boolean(refreshError)}
                  >
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="break-words [overflow-wrap:anywhere] font-medium">
                        {label(role.name, role.displayName)}
                      </span>
                      <span className="text-xs text-muted-foreground break-words [overflow-wrap:anywhere]">
                        {role.description || t("simpleAccess.customRoleHelp")}
                      </span>
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {t("simpleAccess.replaceProjectRole")}
            </p>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="py-2 text-sm break-words [overflow-wrap:anywhere]">
          {currentLabel}
        </span>
      )}
      {hasOtherAccess ? (
        <span className="text-xs text-muted-foreground">
          {t(
            isOwner
              ? "simpleAccess.ownerAccess"
              : "simpleAccess.additionalAccess",
          )}
        </span>
      ) : null}
    </div>
  );
}
