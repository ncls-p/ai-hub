"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
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
import { Input } from "@/components/ui/input";
import { isPermissionCompatibleWithScope } from "@/modules/iam/permission-catalog";
import {
  expandPermissionGrants,
  matchesPermission,
} from "@/modules/iam/permission-matching";
import type { AccessSnapshot } from "./access-console.access-member";

export function RolePermissionPicker({
  catalog,
  selected,
  grantable,
  scope,
  readOnly,
  query,
  onQuery,
  onChange,
}: {
  catalog: AccessSnapshot["permissionCatalog"];
  selected: string[];
  grantable: Set<string>;
  scope: "organization" | "workspace";
  readOnly: boolean;
  query: string;
  onQuery: (value: string) => void;
  onChange: (permissions: string[]) => void;
}) {
  const t = useTranslations("access");
  const available = (id: string) =>
    isPermissionCompatibleWithScope(id, scope) && grantable.has(id);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {t("simpleAccess.roleBasicsDescription")}
      </p>
      <Field>
        <FieldLabel htmlFor="permission-search">
          {t("searchPermissions")}
        </FieldLabel>
        <Input
          id="permission-search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
        />
        <FieldDescription>
          {t("permissionCount", { count: selected.length })}
        </FieldDescription>
      </Field>
      {catalog.map((group) => {
        const scoped = group.permissions.filter((permission) =>
          isPermissionCompatibleWithScope(permission.id, scope),
        );
        const visible = scoped.filter((permission) =>
          [
            permission.id,
            t(`permissions.${permission.id.replaceAll(".", "_")}.label`),
          ].some((value) =>
            value
              .toLocaleLowerCase()
              .includes(query.trim().toLocaleLowerCase()),
          ),
        );
        if (!visible.length) return null;
        const eligible = scoped.filter((permission) =>
          available(permission.id),
        );
        const all =
          scoped.length > 0 &&
          scoped.every((permission) => selected.includes(permission.id));
        const readPermissions = eligible.filter(({ id }) =>
          /\.(get|list|view[^.]*)$/.test(id),
        );
        const selectedInGroup = scoped.filter(({ id }) =>
          selected.includes(id),
        );
        const level = !selectedInGroup.length
          ? "none"
          : all
            ? "manage"
            : readPermissions.length &&
                selectedInGroup.length === readPermissions.length &&
                readPermissions.every(({ id }) => selected.includes(id))
              ? "view"
              : "custom";
        return (
          <div key={group.id} className="min-w-0 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-medium" id={`category-${group.id}`}>
                {t(`permissionGroups.${group.id}.label`)}
              </span>
              <Select
                value={level}
                disabled={readOnly || !eligible.length}
                onValueChange={(value) => {
                  const keep = selected.filter(
                    (grant) =>
                      !scoped.some(({ id }) => matchesPermission(grant, id)),
                  );
                  const next =
                    value === "manage"
                      ? eligible
                      : value === "view"
                        ? readPermissions
                        : [];
                  onChange(
                    expandPermissionGrants([
                      ...keep,
                      ...next.map(({ id }) => id),
                    ]),
                  );
                }}
              >
                <SelectTrigger
                  aria-labelledby={`category-${group.id}`}
                  className="w-36"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">
                      {t("simpleAccess.noAccess")}
                    </SelectItem>
                    {readPermissions.length ? (
                      <SelectItem value="view">
                        {t("simpleAccess.readAccess")}
                      </SelectItem>
                    ) : null}
                    <SelectItem
                      value="manage"
                      disabled={eligible.length !== scoped.length}
                    >
                      {t("simpleAccess.fullAccess")}
                    </SelectItem>
                    {level === "custom" ? (
                      <SelectItem value="custom" disabled>
                        {t("simpleAccess.customAccess")}
                      </SelectItem>
                    ) : null}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <details
              key={`${group.id}-${Boolean(query)}`}
              open={query ? true : undefined}
              className="mt-2"
            >
              <summary className="cursor-pointer text-sm text-muted-foreground">
                {t("permissionsColumn")}{" "}
                <span className="text-sm text-muted-foreground">
                  (
                  {
                    scoped.filter((permission) =>
                      selected.includes(permission.id),
                    ).length
                  }
                  /{scoped.length})
                </span>
              </summary>
              <div className="flex flex-col gap-3 pt-3">
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    disabled={!eligible.length}
                    onClick={() =>
                      onChange(
                        all
                          ? selected.filter(
                              (grant) =>
                                !eligible.some((permission) =>
                                  matchesPermission(grant, permission.id),
                                ),
                            )
                          : expandPermissionGrants([
                              ...selected,
                              ...eligible.map((permission) => permission.id),
                            ]),
                      )
                    }
                  >
                    {all ? t("clearGroup") : t("selectGroup")}
                  </Button>
                ) : null}
                <FieldGroup>
                  {visible.map((permission) => {
                    const checked = selected.includes(permission.id);
                    const disabled = readOnly || !available(permission.id);
                    return (
                      <Field
                        key={permission.id}
                        orientation="horizontal"
                        data-disabled={disabled}
                      >
                        <Checkbox
                          id={`permission-${permission.id}`}
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={(value) =>
                            onChange(
                              value
                                ? expandPermissionGrants([
                                    ...selected,
                                    permission.id,
                                  ])
                                : selected.filter(
                                    (grant) =>
                                      !matchesPermission(grant, permission.id),
                                  ),
                            )
                          }
                        />
                        <FieldContent>
                          <FieldLabel htmlFor={`permission-${permission.id}`}>
                            {t(
                              `permissions.${permission.id.replaceAll(".", "_")}.label`,
                            )}
                          </FieldLabel>
                          <FieldDescription>
                            {t(
                              `permissions.${permission.id.replaceAll(".", "_")}.description`,
                            )}
                          </FieldDescription>
                        </FieldContent>
                      </Field>
                    );
                  })}
                </FieldGroup>
              </div>
            </details>
          </div>
        );
      })}
    </div>
  );
}
