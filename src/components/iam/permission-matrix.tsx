"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isPermissionCompatibleWithScope } from "@/modules/iam/permission-catalog";
import { matchesPermission } from "@/modules/iam/permission-matching";
import type { AccessSnapshot } from "./access-console.access-member";

export function PermissionMatrix({
  snapshot,
  roleLabel,
}: {
  snapshot: AccessSnapshot;
  roleLabel: (name: string, fallback: string) => string;
}) {
  const t = useTranslations("access");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"organization" | "workspace">("workspace");
  const roles = snapshot.roles.filter((role) => role.scopeType === scope);
  const rows = snapshot.permissionCatalog
    .flatMap((group) => group.permissions)
    .filter((permission) => {
      const key = permission.id.replaceAll(".", "_");
      return (
        isPermissionCompatibleWithScope(permission.id, scope) &&
        [
          permission.id,
          t(`permissions.${key}.label`),
          t(`permissions.${key}.description`),
        ].some((value) =>
          value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
        )
      );
    });
  const effective =
    scope === "organization"
      ? snapshot.organizationPermissions
      : snapshot.effectivePermissions;
  const value = (allowed: boolean) =>
    allowed ? t("matrix.allowed") : t("matrix.denied");
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("matrix.description")}</p>
      <FieldGroup className="sm:flex-row">
        <Field>
          <FieldLabel htmlFor="matrix-search">
            {t("searchPermissions")}
          </FieldLabel>
          <Input
            id="matrix-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="matrix-scope">{t("scope")}</FieldLabel>
          <Select
            value={scope}
            onValueChange={(value) => setScope(value as typeof scope)}
          >
            <SelectTrigger id="matrix-scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="workspace">{t("projectScope")}</SelectItem>
                <SelectItem value="organization">
                  {t("organizationScope")}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      <Table>
        <TableCaption>
          {t("matrix.caption", { count: rows.length })}
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t("permissionsColumn")}</TableHead>
            <TableHead scope="col">{t("matrix.effective")}</TableHead>
            <TableHead scope="col">{t("matrix.delegable")}</TableHead>
            {roles.map((role) => (
              <TableHead key={role.id} scope="col">
                {roleLabel(role.name, role.displayName)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((permission) => (
            <TableRow key={permission.id}>
              <TableHead scope="row" className="whitespace-normal">
                <span className="block">
                  {t(`permissions.${permission.id.replaceAll(".", "_")}.label`)}
                </span>
                <code className="text-xs">{permission.id}</code>
                <p className="min-w-64 text-xs text-muted-foreground">
                  {t(
                    `permissions.${permission.id.replaceAll(".", "_")}.description`,
                  )}
                </p>
              </TableHead>
              <TableCell>{value(effective.includes(permission.id))}</TableCell>
              <TableCell>
                {value(
                  snapshot.grantablePermissions[scope].includes(permission.id),
                )}
              </TableCell>
              {roles.map((role) => (
                <TableCell key={role.id}>
                  {value(
                    role.permissions.some((grant) =>
                      matchesPermission(grant, permission.id),
                    ),
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={roles.length + 3}>
                {t("noSearchResults")}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
