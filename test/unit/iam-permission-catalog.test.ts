import { describe, expect, it } from "vitest";

import {
  expandPermissionGrants,
  isKnownPermission,
  isPermissionCompatibleWithScope,
  KNOWN_PERMISSIONS,
  PERMISSION_CATALOG,
} from "@/modules/iam/permission-catalog";
import { SYSTEM_ROLES } from "@/server/domain/entities/iam";

describe("IAM permission catalog", () => {
  it("expands built-in wildcard grants into editable catalog permissions", () => {
    const permissions = expandPermissionGrants(["agents.*", "workflows.view"]);

    expect(permissions).toContain("agents.list");
    expect(permissions).toContain("agents.get");
    expect(permissions).toContain("agents.create");
    expect(permissions).toContain("workflows.view");
    expect(permissions).not.toContain("workflows.create");
    expect(permissions).not.toContain("agents.*");
  });

  it("contains unique permission identifiers", () => {
    const permissions = PERMISSION_CATALOG.flatMap((group) =>
      group.permissions.map((permission) => permission.id),
    );

    expect(new Set(permissions).size).toBe(permissions.length);
    expect(KNOWN_PERMISSIONS.size).toBe(permissions.length);
  });

  it("uses the assistant permissions enforced by the API", () => {
    expect(KNOWN_PERMISSIONS).toContain("agents.list");
    expect(KNOWN_PERMISSIONS).toContain("agents.get");
    expect(KNOWN_PERMISSIONS).not.toContain("agents.view");
  });

  it("contains the permissions required to administer the hierarchy", () => {
    for (const permission of [
      "organization.get",
      "workspaces.create",
      "members.manage",
      "teams.manage",
      "roles.manage",
    ]) {
      expect(isKnownPermission(permission)).toBe(true);
    }
  });

  it("keeps organization-only permissions out of project roles", () => {
    expect(isPermissionCompatibleWithScope("members.manage", "workspace")).toBe(
      false,
    );
    expect(isPermissionCompatibleWithScope("agents.chat", "workspace")).toBe(
      true,
    );
    expect(
      isPermissionCompatibleWithScope("members.manage", "organization"),
    ).toBe(true);
  });

  it("gives organization owners project permissions that can be inherited", () => {
    const owner = SYSTEM_ROLES.find(
      (role) => role.name === "organization.owner",
    );

    expect(owner?.permissions).toEqual(
      expect.arrayContaining([
        "workspaces.create",
        "roles.manage",
        "agents.chat",
        "providers.manage",
      ]),
    );
  });

  it("keeps the built-in project viewer read-only", () => {
    const viewer = SYSTEM_ROLES.find(
      (role) => role.name === "workspace.viewer",
    );

    expect(viewer?.permissions).toContain("agents.get");
    expect(viewer?.permissions).not.toContain("agents.create");
    expect(viewer?.permissions).not.toContain("roles.manage");
  });
  it("reserves usage and audit for administrators or explicitly delegated roles", () => {
    for (const name of [
      "workspace.viewer",
      "workspace.member",
      "organization.user",
    ]) {
      const role = SYSTEM_ROLES.find((entry) => entry.name === name)!;
      expect(role.permissions).not.toContain("usage.view");
      expect(role.permissions).not.toContain("audit.view");
      expect(role.permissions).not.toContain("audit.export");
    }
    for (const name of [
      "workspace.admin",
      "organization.admin",
      "organization.owner",
    ]) {
      const role = SYSTEM_ROLES.find((entry) => entry.name === name)!;
      expect(role.permissions).toEqual(
        expect.arrayContaining(["usage.view", "audit.view", "audit.export"]),
      );
    }
  });
});
