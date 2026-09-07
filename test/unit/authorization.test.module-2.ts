import { describe, expect, it, vi } from "vitest";

import { authorization } from "@/server/domain/services/authorization";
import { cache } from "@/server/infrastructure/cache";
import { dbModule } from "./authorization.test.db-module";

// ─── authorization.checkPermission ──────────────────────────────────

describe("authorization.checkPermission", () => {
  it("coalesces concurrent permission resolutions for the same resource", async () => {
    vi.mocked(cache.get).mockResolvedValue(null);
    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule._c.from.mockReturnValue(dbModule._c);
    dbModule._c.where.mockReturnValue(dbModule._c);
    dbModule._c.limit.mockResolvedValueOnce([]);

    const context = { principalType: "user" as const, principalId: "user-1" };
    const [first, second] = await Promise.all([
      authorization.listPermissions(context, "workspace", "ws-shared"),
      authorization.listPermissions(context, "workspace", "ws-shared"),
    ]);

    expect(first).toEqual([]);
    expect(second).toEqual([]);
    expect(dbModule.db.select).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledTimes(1);
  });

  it("returns granted=false when no permissions", async () => {
    vi.mocked(cache.get).mockResolvedValue(null);
    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule._c.from.mockReturnValue(dbModule._c);
    dbModule._c.where.mockReturnValue(dbModule._c);
    dbModule._c.innerJoin.mockReturnValue(dbModule._c);
    dbModule._c.limit.mockResolvedValueOnce([]);

    const result = await authorization.checkPermission(
      { principalType: "user", principalId: "user-1" },
      "agents.create",
      "workspace",
      "ws-1",
    );

    expect(result.granted).toBe(false);
    expect(result.reason).toContain("Missing permission");
  });

  it("returns granted=true when permission matches", async () => {
    vi.mocked(cache.get).mockResolvedValue(["agents.create"]);

    const result = await authorization.checkPermission(
      { principalType: "user", principalId: "user-1" },
      "agents.create",
      "workspace",
      "ws-1",
    );

    expect(result.granted).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("returns granted=true when wildcard matches", async () => {
    vi.mocked(cache.get).mockResolvedValue(["agents.*"]);

    const result = await authorization.checkPermission(
      { principalType: "user", principalId: "user-1" },
      "agents.delete",
      "workspace",
      "ws-1",
    );

    expect(result.granted).toBe(true);
  });

  it("resolves database role bindings, system permissions, and caches unique permissions", async () => {
    vi.mocked(cache.get).mockResolvedValue(null);
    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule._c.where
      .mockReturnValueOnce(dbModule._c)
      .mockReturnValueOnce(dbModule._c)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          roles: {
            name: "workspace.member",
            isSystem: true,
            permissionsJson: ["agents.create", "agents.create", "custom.do"],
          },
        },
        {
          roles: {
            name: "custom.invalid",
            permissionsJson: null,
          },
        },
      ]);
    dbModule._c.limit
      .mockResolvedValueOnce([{ organizationId: "org-1" }])
      .mockResolvedValueOnce([{ id: "member-1", status: "active" }])
      .mockResolvedValueOnce([{ organizationId: "org-1" }]);

    const result = await authorization.checkPermission(
      { principalType: "user", principalId: "user-1" },
      "tools.executeRestricted",
      "workspace",
      "ws-1",
    );

    expect(result.granted).toBe(true);
    expect(cache.set).toHaveBeenCalledWith(
      "perm:user:user-1:workspace:ws-1",
      expect.arrayContaining(["agents.create", "tools.executeRestricted"]),
      60,
    );
  });

  it("returns granted=true when manage matches", async () => {
    vi.mocked(cache.get).mockResolvedValue(["agents.manage"]);

    const result = await authorization.checkPermission(
      { principalType: "user", principalId: "user-1" },
      "agents.delete",
      "workspace",
      "ws-1",
    );

    expect(result.granted).toBe(true);
  });
});

// ─── authorization.requirePermission ─────────────────────────────────

describe("authorization.requirePermission", () => {
  it("returns granted result when permission is granted", async () => {
    vi.mocked(cache.get).mockResolvedValue(["agents.create"]);

    const result = await authorization.requirePermission(
      { principalType: "user", principalId: "user-1" },
      "agents.create",
      "workspace",
      "ws-1",
    );

    expect(result.granted).toBe(true);
  });

  it("returns not-granted result when permission denied", async () => {
    vi.mocked(cache.get).mockResolvedValue([]);
    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule._c.from.mockReturnValue(dbModule._c);
    dbModule._c.where.mockReturnValue(dbModule._c);
    dbModule._c.innerJoin.mockReturnValue(dbModule._c);

    const result = await authorization.requirePermission(
      { principalType: "user", principalId: "user-1" },
      "agents.create",
      "workspace",
      "ws-1",
    );

    expect(result.granted).toBe(false);
  });
});

// ─── authorization.hasPermission ─────────────────────────────────────

describe("authorization.hasPermission", () => {
  it("returns true when cached permission matches", async () => {
    vi.mocked(cache.get).mockResolvedValue(["agents.create"]);

    const result = await authorization.hasPermission(
      { principalType: "user", principalId: "user-1" },
      "agents.create",
      "workspace",
      "ws-1",
    );

    expect(result).toBe(true);
  });

  it("returns false when no matching permission", async () => {
    vi.mocked(cache.get).mockResolvedValue([]);
    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule._c.from.mockReturnValue(dbModule._c);
    dbModule._c.where.mockReturnValue(dbModule._c);
    dbModule._c.innerJoin.mockReturnValue(dbModule._c);

    const result = await authorization.hasPermission(
      { principalType: "user", principalId: "user-1" },
      "agents.create",
      "workspace",
      "ws-1",
    );

    expect(result).toBe(false);
  });
});
