import { PERMISSION_CATALOG } from "./permission-catalog.permission-catalog-group";

export const KNOWN_PERMISSIONS = new Set<string>(
  PERMISSION_CATALOG.flatMap((group) =>
    group.permissions.map((permission) => permission.id),
  ),
);

export function isKnownPermission(permission: string) {
  return KNOWN_PERMISSIONS.has(permission);
}

export { expandPermissionGrants } from "./permission-matching";

const ORGANIZATION_ONLY_PERMISSIONS = new Set([
  "organization.get",
  "organization.update",
  "organization.delete",
  "organization.transfer",
  "workspaces.create",
  "members.manage",
  "teams.manage",
]);

export function isPermissionCompatibleWithScope(
  permission: string,
  scopeType: "organization" | "workspace",
) {
  return (
    scopeType === "organization" ||
    (!ORGANIZATION_ONLY_PERMISSIONS.has(permission) &&
      !permission.startsWith("members.") &&
      !permission.startsWith("teams."))
  );
}
