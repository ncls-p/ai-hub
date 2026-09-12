"use client";

import { useState } from "react";
import { ShieldPlusIcon } from "lucide-react";
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
import { Spinner } from "@/components/ui/spinner";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";

export function PersonOrganizationRole({
  model,
  person,
}: {
  model: AccessConsoleViewModel;
  person: AccessConsoleViewModel["visiblePeople"][number];
}) {
  const [open, setOpen] = useState(false);
  const {
    snapshot,
    t,
    roleLabel,
    pendingAction,
    refreshError,
    mutate,
    workspaceId,
  } = model;
  const assignments = person.assignments.filter(
    (item) => item.scope === "organization",
  );
  const owner = assignments.some(
    (item) => item.roleKey === "organization.owner",
  );
  const admin = assignments.some(
    (item) =>
      item.roleKey === "organization.admin" ||
      item.roleKey === "custom.standard.organization.admin",
  );
  const adminRole = snapshot.roles.find(
    (role) =>
      (role.name === "organization.admin" ||
        role.name === "custom.standard.organization.admin") &&
      snapshot.assignableRoleIds.includes(role.id),
  );
  const canPromote =
    !owner &&
    !admin &&
    person.memberStatus === "active" &&
    snapshot.actions.organization["roles.assign"] &&
    snapshot.subordinateIds.organization.includes(person.userId) &&
    adminRole;
  const key = `organization-admin-${person.userId}`;
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <span className="py-2 text-sm break-words">
        {owner
          ? roleLabel("organization.owner", "")
          : admin
            ? roleLabel("organization.admin", "")
            : t("organizationMemberLabel")}
      </span>
      {canPromote ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-auto min-h-10 max-w-full whitespace-normal text-left"
              disabled={Boolean(pendingAction) || Boolean(refreshError)}
              aria-label={t("appointOrganizationAdminFor", {
                name: person.name,
              })}
            >
              <ShieldPlusIcon aria-hidden="true" />
              {t("appointOrganizationAdmin")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t("appointOrganizationAdminFor", { name: person.name })}
              </DialogTitle>
              <DialogDescription>
                {t("organizationAdminGrantDescription", {
                  name: person.name,
                  organization: snapshot.organization.name,
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={Boolean(pendingAction)}
                onClick={() => setOpen(false)}
              >
                {t("simpleAccess.cancel")}
              </Button>
              <Button
                disabled={Boolean(pendingAction) || Boolean(refreshError)}
                onClick={() =>
                  void mutate(
                    key,
                    {
                      action: "assignRole",
                      workspaceId,
                      principalType: "user",
                      principalId: person.userId,
                      scopeType: "organization",
                      roleId: adminRole!.id,
                    },
                    t("roleAssigned"),
                    { close: () => setOpen(false) },
                  )
                }
              >
                {pendingAction === key ? <Spinner /> : null}
                {t("confirmOrganizationAdmin")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
