import { describe, expect, it } from "vitest";
import {
  PERMISSION_CATALOG,
  KNOWN_PERMISSIONS,
  isPermissionCompatibleWithScope,
} from "@/modules/iam/permission-catalog";
import {
  canDelegatePermissionSet,
  expandPermissionGrants,
  isSubordinatePermissionSet,
  matchesPermission,
} from "@/modules/iam/permission-matching";
import { SYSTEM_ROLES } from "@/server/domain/entities/iam";
import fr from "../../messages/fr.json";
import en from "../../messages/en.json";

describe("canonical permission semantics", () => {
  it("registers and translates every built-in permission", () => {
    for (const role of SYSTEM_ROLES)
      for (const permission of role.permissions)
        expect(KNOWN_PERMISSIONS.has(permission), permission).toBe(true);
    for (const group of PERMISSION_CATALOG)
      for (const permission of group.permissions)
        for (const locale of [fr, en])
          expect(locale.access.permissions).toHaveProperty(
            permission.id.replaceAll(".", "_"),
          );
  });
  it("makes runtime checks and editable expansion agree for every catalogue pair", () => {
    for (const grant of KNOWN_PERMISSIONS) {
      const expanded = expandPermissionGrants([grant]);
      for (const required of KNOWN_PERMISSIONS)
        expect(expanded.includes(required)).toBe(
          matchesPermission(grant, required),
        );
    }
  });
  it("does not imply assignment from role creation or deletion from scope renaming", () => {
    expect(matchesPermission("roles.create", "roles.assign")).toBe(false);
    expect(
      matchesPermission("organization.update", "organization.delete"),
    ).toBe(false);
    expect(matchesPermission("workspaces.update", "workspaces.delete")).toBe(
      false,
    );
    expect(matchesPermission("roles.manage", "roles.revoke")).toBe(true);
  });
  it("rejects unknown required permissions even for global or domain wildcards", () => {
    for (const grant of [
      "*",
      "agents.*",
      "agents.manage",
      "agents.futureAction",
    ])
      expect(matchesPermission(grant, "agents.futureAction")).toBe(false);
    for (const grant of [
      "agents",
      "agents.manage.extra",
      "agents.*.extra",
      ".*",
      "agents.",
    ]) {
      expect(matchesPermission(grant, "agents.get")).toBe(false);
      expect(canDelegatePermissionSet(["*"], [grant])).toBe(false);
    }
    expect(canDelegatePermissionSet(["*"], ["agents.futureAction"])).toBe(
      false,
    );
  });
  it("compares full effective sets and strictly rejects peers", () => {
    expect(
      canDelegatePermissionSet(["agents.*"], ["agents.get", "agents.create"]),
    ).toBe(true);
    expect(canDelegatePermissionSet(["agents.get"], ["agents.manage"])).toBe(
      false,
    );
    expect(
      isSubordinatePermissionSet(
        ["agents.get", "roles.assign"],
        ["agents.get"],
      ),
    ).toBe(true);
    expect(isSubordinatePermissionSet(["agents.get"], ["agents.get"])).toBe(
      false,
    );
    expect(
      isSubordinatePermissionSet(
        ["agents.get", "roles.assign"],
        ["providers.manage"],
      ),
    ).toBe(false);
  });
  it("keeps organization lifecycle and member/team rights out of project roles", () => {
    for (const permission of [
      "organization.delete",
      "organization.transfer",
      "members.create",
      "teams.update",
    ])
      expect(isPermissionCompatibleWithScope(permission, "workspace")).toBe(
        false,
      );
  });
});
