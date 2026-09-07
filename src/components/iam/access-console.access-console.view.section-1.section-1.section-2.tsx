import { RolePermissionPicker } from "./role-permission-picker";
import { expandPermissionGrants } from "@/modules/iam/permission-matching";
import { CopyIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { isPermissionCompatibleWithScope } from "@/modules/iam/permission-catalog";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import { INITIAL_ROLE_FORM } from "./access-console.resource-transfer-preview";
import { MutatingButton } from "./access-console.scope-path";
export function AccessRolesSection2({
  model,
}: {
  model: AccessConsoleViewModel;
}) {
  const {
    canCustomizeViewedRole,
    canDelegateViewedRole,
    editingRoleId,
    grantablePermissionSet,
    mutate,
    pendingAction,
    permissionQuery,
    roleEditorReadOnly,
    roleForm,
    roleOpen,
    setEditingRoleId,
    setPermissionQuery,
    setRoleEditorReadOnly,
    setRoleForm,
    setRoleOpen,
    snapshot,
    t,
    workspaceId,
  } = model;
  const canCreateOrganizationRole =
    snapshot.actions.organization["roles.create"];
  const canCreateProjectRole = snapshot.actions.workspace["roles.create"];
  return (
    <CardHeader className="grid-cols-1! px-0 sm:grid-cols-[1fr_auto]!">
      <CardTitle>{t("rolesTitle")}</CardTitle>
      <CardDescription>{t("rolesDescription")}</CardDescription>
      <>
        <CardAction className="col-start-1 row-start-auto justify-self-start sm:col-start-2 sm:row-start-1 sm:justify-self-end">
          <Dialog
            open={roleOpen}
            onOpenChange={(open) => {
              setRoleOpen(open);
              if (open && !editingRoleId && !canCreateOrganizationRole) {
                setRoleForm((current) => ({
                  ...current,
                  scopeType: "workspace",
                  permissions: current.permissions.filter((permission) =>
                    isPermissionCompatibleWithScope(permission, "workspace"),
                  ),
                }));
              }
            }}
          >
            {canCreateProjectRole || canCreateOrganizationRole ? (
              <DialogTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setEditingRoleId(null);
                    setRoleEditorReadOnly(false);
                    setRoleForm({
                      ...INITIAL_ROLE_FORM,
                      scopeType: canCreateProjectRole
                        ? "workspace"
                        : "organization",
                    });
                    setPermissionQuery("");
                  }}
                >
                  <PlusIcon data-icon="inline-start" aria-hidden="true" />
                  {t("createRole")}
                </Button>
              </DialogTrigger>
            ) : null}
            <DialogContent className="max-h-[min(46rem,calc(100vh-2rem))] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {roleEditorReadOnly
                    ? t("viewRoleTitle", {
                        name: roleForm.displayName,
                      })
                    : editingRoleId
                      ? t("editRoleTitle", {
                          name: roleForm.displayName,
                        })
                      : t("createRoleTitle")}
                </DialogTitle>
                <DialogDescription>
                  {roleEditorReadOnly
                    ? t(
                        snapshot.roles.find((role) => role.id === editingRoleId)
                          ?.name === "organization.owner"
                          ? "simpleAccess.ownerProtected"
                          : "simpleAccess.roleReadOnly",
                      )
                    : editingRoleId
                      ? t("editRoleDescription")
                      : t("createRoleDescription")}
                </DialogDescription>
              </DialogHeader>
              <form
                className="contents"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const saved = await mutate(
                    editingRoleId ? "updateRole" : "createRole",
                    editingRoleId
                      ? {
                          action: "updateRole",
                          workspaceId,
                          roleId: editingRoleId,
                          expectedUpdatedAt: snapshot.roles.find(
                            (role) => role.id === editingRoleId,
                          )?.updatedAt,
                          displayName: roleForm.displayName,
                          description: roleForm.description,
                          permissions: expandPermissionGrants(
                            roleForm.permissions,
                          ),
                        }
                      : {
                          action: "createRole",
                          workspaceId,
                          ...roleForm,
                        },
                    editingRoleId ? t("roleUpdated") : t("roleCreated"),
                    { close: () => setRoleOpen(false) },
                  );
                  if (saved) {
                    setEditingRoleId(null);
                    setRoleForm(INITIAL_ROLE_FORM);
                  }
                }}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="role-name">{t("roleName")}</FieldLabel>
                    <Input
                      id="role-name"
                      disabled={roleEditorReadOnly}
                      required
                      minLength={2}
                      value={roleForm.displayName}
                      onChange={(event) =>
                        setRoleForm({
                          ...roleForm,
                          displayName: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="role-description">
                      {t("descriptionLabel")}
                    </FieldLabel>
                    <Textarea
                      id="role-description"
                      disabled={roleEditorReadOnly}
                      value={roleForm.description}
                      onChange={(event) =>
                        setRoleForm({
                          ...roleForm,
                          description: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="custom-role-scope">
                      {t("roleScope")}
                    </FieldLabel>
                    <Select
                      disabled={Boolean(editingRoleId) || roleEditorReadOnly}
                      value={roleForm.scopeType}
                      onValueChange={(value) =>
                        setRoleForm({
                          ...roleForm,
                          scopeType: value as "organization" | "workspace",
                          permissions: roleForm.permissions.filter(
                            (permission) =>
                              isPermissionCompatibleWithScope(
                                permission,
                                value as "organization" | "workspace",
                              ) &&
                              snapshot.grantablePermissions[
                                value as "organization" | "workspace"
                              ].includes(permission),
                          ),
                        })
                      }
                    >
                      <SelectTrigger id="custom-role-scope" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="workspace">
                            {t("projectRole")}
                          </SelectItem>
                          {canCreateOrganizationRole ? (
                            <SelectItem value="organization">
                              {t("organizationRole")}
                            </SelectItem>
                          ) : null}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <RolePermissionPicker
                    catalog={snapshot.permissionCatalog}
                    selected={roleForm.permissions}
                    grantable={grantablePermissionSet}
                    scope={roleForm.scopeType}
                    readOnly={roleEditorReadOnly}
                    query={permissionQuery}
                    onQuery={setPermissionQuery}
                    onChange={(permissions) =>
                      setRoleForm((current) => ({ ...current, permissions }))
                    }
                  />
                </FieldGroup>
                <DialogFooter className="sticky bottom-0 bg-background pt-3">
                  {roleEditorReadOnly &&
                  canCustomizeViewedRole &&
                  canDelegateViewedRole ? (
                    <Button
                      type="button"
                      onClick={() => {
                        setRoleEditorReadOnly(false);
                        setEditingRoleId(null);
                        setRoleForm((current) => ({
                          ...current,
                          displayName: t("roleCopyName", {
                            name: current.displayName,
                          }),
                        }));
                      }}
                    >
                      <CopyIcon data-icon="inline-start" aria-hidden="true" />
                      {t("duplicateAndCustomize")}
                    </Button>
                  ) : roleEditorReadOnly ? null : (
                    <MutatingButton
                      disabled={
                        Boolean(pendingAction) ||
                        Boolean(model.refreshError) ||
                        roleForm.permissions.length === 0
                      }
                      pending={
                        pendingAction ===
                        (editingRoleId ? "updateRole" : "createRole")
                      }
                    >
                      {editingRoleId ? t("saveRole") : t("createRole")}
                    </MutatingButton>
                  )}
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardAction>
      </>
    </CardHeader>
  );
}
