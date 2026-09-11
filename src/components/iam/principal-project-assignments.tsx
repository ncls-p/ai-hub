import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AccessSnapshot } from "./access-console.access-member";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import type {
  MembershipMutation,
  MembershipPrincipal,
} from "./principal-memberships-dialog";
import { ConfirmRemovalButton } from "./access-console.scope-path";

export function PrincipalProjectAssignments({
  snapshot,
  principal,
  mutate,
  pending,
  t,
  roleLabel,
}: {
  snapshot: AccessSnapshot;
  principal: MembershipPrincipal;
  mutate: MembershipMutation;
  pending: boolean;
  t: AccessConsoleViewModel["t"];
  roleLabel: AccessConsoleViewModel["roleLabel"];
}) {
  const [roleId, setRoleId] = useState("");
  const assignments = snapshot.assignments.filter(
    (item) =>
      item.principalId === principal.id &&
      item.principalType === (principal.type === "group" ? "team" : "user") &&
      item.scope === "project",
  );
  const roles = snapshot.roles.filter(
    (role) =>
      role.scopeType === "workspace" &&
      role.permissions.includes("workspaces.get") &&
      snapshot.assignableRoleIds.includes(role.id) &&
      !assignments.some((item) => item.roleId === role.id),
  );
  const manageable =
    principal.type === "group"
      ? Boolean(
          snapshot.teams
            .find((team) => team.id === principal.id)
            ?.members.every((member) =>
              snapshot.subordinateIds.workspace.includes(member.userId),
            ),
        )
      : snapshot.subordinateIds.workspace.includes(principal.id);
  const canAssign = manageable && snapshot.actions.workspace["roles.assign"];
  const canRevoke = manageable && snapshot.actions.workspace["roles.revoke"];
  return (
    <section
      className="flex flex-col gap-3"
      aria-label={t("memberships.projects")}
    >
      <p className="text-sm text-muted-foreground">
        {t("memberships.directAccessHint")}
      </p>
      {assignments.length === 0 ? (
        <p className="text-sm">{t("simpleAccess.noDirectRole")}</p>
      ) : (
        assignments.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-lg border p-3"
          >
            <span className="min-w-0 break-words text-sm">
              {roleLabel(item.roleKey, item.roleName)}
            </span>
            {canRevoke ? (
              <ConfirmRemovalButton
                pending={pending}
                label={t("removeAssignment", { name: principal.name })}
                title={t("removeAssignmentTitle", { name: principal.name })}
                description={t("removeAssignmentDescription", {
                  role: roleLabel(item.roleKey, item.roleName),
                  scope: snapshot.activeProject.name,
                })}
                onConfirm={() =>
                  void mutate({
                    action: "removeAssignment",
                    bindingId: item.id,
                  })
                }
              />
            ) : null}
          </div>
        ))
      )}
      {canAssign && roles.length > 0 ? (
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (roleId)
              void mutate({
                action: "assignRole",
                principalType: principal.type,
                principalId: principal.id,
                roleId,
                scopeType: "workspace",
              });
          }}
        >
          <Field className="min-w-0 flex-1">
            <FieldLabel htmlFor={`membership-role-${principal.id}`}>
              {t("simpleAccess.projectRole")}
            </FieldLabel>
            <Select value={roleId} onValueChange={setRoleId} disabled={pending}>
              <SelectTrigger
                id={`membership-role-${principal.id}`}
                className="w-full"
              >
                <SelectValue placeholder={t("memberships.chooseRole")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {roleLabel(role.name, role.displayName)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Button disabled={pending || !roleId} type="submit">
            {t("add")}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
