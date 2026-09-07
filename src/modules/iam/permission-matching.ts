import { PERMISSION_CATALOG } from "./permission-catalog.permission-catalog-group";

const known = new Set<string>(
  PERMISSION_CATALOG.flatMap((group) =>
    group.permissions.map((permission) => permission.id),
  ),
);
const viewActions = new Set([
  "get",
  "list",
  "view",
  "viewAllowed",
  "viewLimited",
  "viewMetadata",
  "viewOwn",
  "viewShared",
]);

/** Legacy aggregates expand only to registered actions, never to future/unknown strings. */
export function matchesPermission(grant: string, required: string): boolean {
  if (!known.has(required)) return false;
  if (grant === required || grant === "*") return true;
  if (grant.split(".").length !== 2) return false;
  const [domain, action] = grant.split(".");
  const [requiredDomain, requiredAction] = required.split(".");
  if (domain !== requiredDomain) return false;
  return (
    action === "*" ||
    action === "manage" ||
    (action === "view" && viewActions.has(requiredAction))
  );
}

export function expandPermissionGrants(grants: readonly string[]): string[] {
  return [...known].filter((permission) =>
    grants.some((grant) => matchesPermission(grant, permission)),
  );
}

export function canDelegatePermissionSet(
  actor: readonly string[],
  delegated: readonly string[],
): boolean {
  // Do not let unknown grants disappear during expansion and pass vacuously.
  if (
    delegated.some(
      (grant) =>
        !known.has(grant) &&
        grant !== "*" &&
        ![...known].some((permission) => matchesPermission(grant, permission)),
    )
  )
    return false;
  const held = new Set(expandPermissionGrants(actor));
  return expandPermissionGrants(delegated).every((permission) =>
    held.has(permission),
  );
}

/** Below means a strict subset of effective rights at the mutation scope. */
export function isSubordinatePermissionSet(
  actor: readonly string[],
  target: readonly string[],
): boolean {
  const held = expandPermissionGrants(actor);
  const affected = expandPermissionGrants(target);
  return (
    canDelegatePermissionSet(actor, target) && affected.length < held.length
  );
}
