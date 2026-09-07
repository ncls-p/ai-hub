import { PlusIcon, UsersIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import { MutatingButton } from "./access-console.scope-path";
export function AccessPeopleTransferBranch1({
  model,
}: {
  model: AccessConsoleViewModel;
}) {
  const {
    assignment,
    assignmentOpen,
    bulkAssignmentIds,
    canManageOrganizationAccess,
    mutate,
    pendingAction,
    principalOptions,
    roleLabel,
    scopedRoles,
    selectedAssignmentRole,
    setAssignment,
    setAssignmentOpen,
    setBulkAssignmentIds,
    setSelectedPeople,
    t,
    workspaceId,
  } = model;
  return (
    <Dialog
      open={assignmentOpen}
      onOpenChange={(open) => {
        setAssignmentOpen(open);
        if (!open) setBulkAssignmentIds([]);
        if (open && !canManageOrganizationAccess) {
          setAssignment((current) => ({
            ...current,
            scopeType: "workspace",
            roleId: "",
          }));
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setBulkAssignmentIds([]);
            setAssignment({
              principalType: "user",
              principalId: "",
              roleId: "",
              scopeType: "workspace",
            });
          }}
        >
          <PlusIcon data-icon="inline-start" aria-hidden="true" />
          {t("assignRole")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("assignRoleTitle")}</DialogTitle>
          <DialogDescription>{t("assignRoleDescription")}</DialogDescription>
        </DialogHeader>
        <form
          className="contents"
          onSubmit={async (event) => {
            event.preventDefault();
            const saved = await mutate(
              "assignRole",
              bulkAssignmentIds.length > 0
                ? {
                    action: "assignRoleBulk",
                    workspaceId,
                    principalIds: bulkAssignmentIds,
                    roleId: assignment.roleId,
                    scopeType: assignment.scopeType,
                  }
                : {
                    action: "assignRole",
                    replaceExisting:
                      assignment.principalType === "user" &&
                      assignment.scopeType === "workspace" &&
                      model.snapshot.actions.workspace["roles.revoke"],
                    workspaceId,
                    ...assignment,
                  },
              t("roleAssigned"),
              { close: () => setAssignmentOpen(false) },
            );
            if (saved) {
              setSelectedPeople([]);
              setBulkAssignmentIds([]);
              setAssignment({
                principalType: "user",
                principalId: "",
                roleId: "",
                scopeType: "workspace",
              });
            }
          }}
        >
          <FieldGroup>
            {bulkAssignmentIds.length === 0 ? (
              <Field>
                <FieldLabel htmlFor="assignment-principal">
                  {t("principal")}
                </FieldLabel>
                <Select
                  required
                  value={assignment.principalId}
                  onValueChange={(value) =>
                    setAssignment({
                      ...assignment,
                      principalId: value,
                    })
                  }
                >
                  <SelectTrigger id="assignment-principal" className="w-full">
                    <SelectValue placeholder={t("choose")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {principalOptions.map((principal) => (
                        <SelectItem
                          key={
                            "userId" in principal
                              ? principal.userId
                              : principal.id
                          }
                          value={
                            "userId" in principal
                              ? principal.userId
                              : principal.id
                          }
                        >
                          {principal.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="assignment-role">{t("role")}</FieldLabel>
              <Select
                required
                value={assignment.roleId}
                onValueChange={(value) =>
                  setAssignment({
                    ...assignment,
                    roleId: value,
                  })
                }
              >
                <SelectTrigger id="assignment-role" className="w-full">
                  <SelectValue placeholder={t("choose")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {scopedRoles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {roleLabel(role.name, role.displayName)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {selectedAssignmentRole ? (
                <FieldDescription>
                  {selectedAssignmentRole.description ||
                    t("permissionCount", {
                      count: selectedAssignmentRole.permissions.length,
                    })}
                </FieldDescription>
              ) : null}
            </Field>
            {assignment.principalType === "user" &&
            assignment.scopeType === "workspace" &&
            model.snapshot.actions.workspace["roles.revoke"] ? (
              <p className="text-sm text-muted-foreground">
                {t("simpleAccess.replaceProjectRole")}
              </p>
            ) : null}
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                {t("simpleAccess.advancedScope")}
              </summary>
              <div className="flex flex-col gap-4 pt-3">
                {" "}
                <Field>
                  <FieldLabel htmlFor="assignment-scope">
                    {t("scope")}
                  </FieldLabel>
                  <Select
                    value={assignment.scopeType}
                    onValueChange={(value) =>
                      setAssignment({
                        ...assignment,
                        scopeType: value as "organization" | "workspace",
                        roleId: "",
                      })
                    }
                  >
                    <SelectTrigger id="assignment-scope" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="workspace">
                          {t("projectOnly")}
                        </SelectItem>
                        {canManageOrganizationAccess ? (
                          <SelectItem value="organization">
                            {t("wholeOrganization")}
                          </SelectItem>
                        ) : null}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                {bulkAssignmentIds.length === 0 ? (
                  <Field>
                    <FieldLabel htmlFor="assignment-principal-type">
                      {t("principalType")}
                    </FieldLabel>
                    <Select
                      value={assignment.principalType}
                      onValueChange={(value) =>
                        setAssignment({
                          ...assignment,
                          principalType: value as "user" | "group",
                          principalId: "",
                        })
                      }
                    >
                      <SelectTrigger
                        id="assignment-principal-type"
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
                ) : (
                  <Alert>
                    <UsersIcon aria-hidden="true" />
                    <AlertTitle>
                      {t("bulkGrantTitle", {
                        count: bulkAssignmentIds.length,
                      })}
                    </AlertTitle>
                    <AlertDescription>
                      {t("bulkGrantDescription")}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </details>
          </FieldGroup>
          <DialogFooter>
            <MutatingButton pending={pendingAction === "assignRole"}>
              {t("saveAssignment")}
            </MutatingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
