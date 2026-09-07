"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchJson } from "@/lib/api-client";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import { INITIAL_ACCOUNT_FORM } from "./access-console.resource-transfer-preview";
import { MutatingButton } from "./access-console.scope-path";

export function AccessPeopleTransferBranch2({
  model,
}: {
  model: AccessConsoleViewModel;
}) {
  const {
    accountForm,
    accountMode,
    memberEmail,
    memberOpen,
    setAccountForm,
    setAccountMode,
    setMemberEmail,
    setMemberOpen,
    snapshot,
    t,
    workspaceId,
  } = model;
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);
  const [chosenRoleId, setChosenRoleId] = useState<string | null>(null);
  const availableRoles = snapshot.capabilities.canManageProjectAccess
    ? snapshot.roles.filter(
        (role) =>
          role.scopeType === "workspace" &&
          role.permissions.includes("workspaces.get") &&
          snapshot.assignableRoleIds.includes(role.id),
      )
    : [];
  const roleId =
    chosenRoleId ??
    availableRoles.find((role) =>
      ["workspace.viewer", "custom.standard.workspace.viewer"].includes(
        role.name,
      ),
    )?.id ??
    "none";
  const selectedRole = availableRoles.find((role) => role.id === roleId);
  const email = accountMode === "create" ? accountForm.email : memberEmail;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      if (
        accountMode === "create" &&
        createdEmail !== email.trim().toLowerCase()
      ) {
        await fetchJson("/api/workspace/iam", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...accountForm,
            action: "createAccount",
            workspaceId,
            projectRoleId: roleId === "none" ? undefined : roleId,
          }),
        });
        setCreatedEmail(email.trim().toLowerCase());
      }
      await fetchJson("/api/workspace/iam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addMember",
          workspaceId,
          email,
          projectRoleId: roleId === "none" ? undefined : roleId,
        }),
      });
      toast.success(
        t(accountMode === "create" ? "accountAndMemberCreated" : "memberAdded"),
      );
      setMemberOpen(false);
      setMemberEmail("");
      setAccountForm(INITIAL_ACCOUNT_FORM);
      setCreatedEmail(null);
      setChosenRoleId(null);
      await Promise.all([
        model.refreshPlatformAccounts(),
        model.load({ preserveData: true }),
        model.refreshWorkspaces(),
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("mutationError"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={memberOpen}
      onOpenChange={(open) => {
        if (!pending) {
          setMemberOpen(open);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <UserPlusIcon data-icon="inline-start" />
          {t("addPerson")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("addPersonTitle")}</DialogTitle>
          <DialogDescription>
            {t("simpleAccess.addDescription", {
              project: snapshot.activeProject.name,
            })}
          </DialogDescription>
        </DialogHeader>
        {snapshot.actions.organization["members.create"] ? (
          <Tabs
            value={accountMode}
            onValueChange={(value) => {
              if (!pending) {
                setAccountMode(value as "existing" | "create");
                setError(null);
              }
            }}
          >
            <TabsList className="w-full">
              <TabsTrigger value="existing">{t("existingAccount")}</TabsTrigger>
              <TabsTrigger value="create">{t("createAccount")}</TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
        <form className="contents" onSubmit={submit}>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {createdEmail === email.trim().toLowerCase() ? (
            <Alert>
              <AlertDescription>
                {t("simpleAccess.accountCreatedRetry")}
              </AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup>
            {accountMode === "create" ? (
              <Field>
                <FieldLabel htmlFor="account-name">{t("name")}</FieldLabel>
                <Input
                  id="account-name"
                  autoComplete="name"
                  required
                  maxLength={255}
                  disabled={
                    pending || createdEmail === email.trim().toLowerCase()
                  }
                  value={accountForm.name}
                  onChange={(event) =>
                    setAccountForm({ ...accountForm, name: event.target.value })
                  }
                />
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="member-email">{t("email")}</FieldLabel>
              <Input
                id="member-email"
                type="email"
                autoComplete="email"
                required
                disabled={pending}
                value={email}
                onChange={(event) =>
                  accountMode === "create"
                    ? setAccountForm({
                        ...accountForm,
                        email: event.target.value,
                      })
                    : setMemberEmail(event.target.value)
                }
              />
            </Field>
            {accountMode === "create" &&
            createdEmail !== email.trim().toLowerCase() ? (
              <Field>
                <FieldLabel htmlFor="account-password">
                  {t("temporaryPassword")}
                </FieldLabel>
                <Input
                  id="account-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={128}
                  disabled={pending}
                  value={accountForm.password}
                  onChange={(event) =>
                    setAccountForm({
                      ...accountForm,
                      password: event.target.value,
                    })
                  }
                />
                <Button
                  className="self-start"
                  size="sm"
                  variant="ghost"
                  type="button"
                  aria-label={t(
                    showPassword
                      ? "simpleAccess.hidePassword"
                      : "simpleAccess.showPassword",
                  )}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  {t(
                    showPassword
                      ? "simpleAccess.hidePassword"
                      : "simpleAccess.showPassword",
                  )}
                </Button>
                <FieldDescription>
                  {t("simpleAccess.passwordHelp")}
                </FieldDescription>
              </Field>
            ) : null}
            {availableRoles.length ? (
              <Field>
                <FieldLabel htmlFor="member-project-role">
                  {t("simpleAccess.projectRole")}
                </FieldLabel>
                <Select
                  value={roleId}
                  onValueChange={setChosenRoleId}
                  disabled={pending}
                >
                  <SelectTrigger id="member-project-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {availableRoles
                        .filter((role) => role.isSystem)
                        .map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {model.roleLabel(role.name, role.displayName)}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                    {availableRoles.some((role) => !role.isSystem) ? (
                      <SelectGroup>
                        {availableRoles
                          .filter((role) => !role.isSystem)
                          .map((role) => (
                            <SelectItem key={role.id} value={role.id}>
                              {role.displayName}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    ) : null}
                    <SelectGroup>
                      <SelectItem value="none">
                        {t("simpleAccess.noProjectAccess")}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {selectedRole?.description ??
                    t("simpleAccess.noProjectAccessDescription")}
                </FieldDescription>
              </Field>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("simpleAccess.noProjectAccessDescription")}
              </p>
            )}
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setMemberOpen(false)}
            >
              {t("simpleAccess.cancel")}
            </Button>
            <MutatingButton
              pending={pending}
              disabled={Boolean(model.refreshError)}
            >
              {t(accountMode === "create" ? "createAndAdd" : "addPerson")}
            </MutatingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
