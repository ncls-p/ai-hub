import { describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("@/modules/admin/use-cases", () => ({
  ensureBootstrapAdmin: vi.fn(),
  isAdminRole: vi.fn(),
}));

vi.mock("@/modules/auth/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init: unknown) => ({ body, init })),
  },
}));

vi.mock("@/server/domain/services/authorization", () => ({
  authorization: {
    checkPermission: vi.fn(),
  },
}));

import * as adminUseCases from "@/modules/admin/use-cases";
import * as sessionMod from "@/modules/auth/session";
import * as authzMod from "@/server/domain/services/authorization";

describe("admin/auth – isPlatformAdminSession", () => {
  // Import the function lazily so it picks up the mocks
  async function testSession(session: unknown) {
    const { isPlatformAdminSession } = await import("@/modules/admin/auth");
    return isPlatformAdminSession(session as never);
  }

  it("returns false when session is null", async () => {
    vi.mocked(adminUseCases.ensureBootstrapAdmin).mockResolvedValue(null);
    expect(await testSession(null)).toBe(false);
  });

  it("returns true when user has admin role", async () => {
    vi.mocked(adminUseCases.ensureBootstrapAdmin).mockResolvedValue(null);
    vi.mocked(adminUseCases.isAdminRole).mockReturnValue(true);
    const session = { user: { id: "admin-1", role: "admin" } };
    expect(await testSession(session)).toBe(true);
  });

  it("returns true when user is bootstrap admin", async () => {
    vi.mocked(adminUseCases.ensureBootstrapAdmin).mockResolvedValue("user-1");
    vi.mocked(adminUseCases.isAdminRole).mockReturnValue(false);
    const session = { user: { id: "user-1", role: "user" } };
    expect(await testSession(session)).toBe(true);
  });

  it("returns false when user is not admin and not bootstrap admin", async () => {
    vi.mocked(adminUseCases.ensureBootstrapAdmin).mockResolvedValue("other");
    vi.mocked(adminUseCases.isAdminRole).mockReturnValue(false);
    const session = { user: { id: "user-1", role: "user" } };
    expect(await testSession(session)).toBe(false);
  });
});

describe("admin/auth – canManageTenantGlobals", () => {
  async function testManage(session: unknown, workspaceId = "ws-1") {
    const { canManageTenantGlobals } = await import("@/modules/admin/auth");
    return canManageTenantGlobals(session as never, workspaceId);
  }

  it("returns false when session is null", async () => {
    expect(await testManage(null)).toBe(false);
  });

  it("returns true when user is platform admin", async () => {
    vi.mocked(adminUseCases.isAdminRole).mockReturnValue(true);
    const session = { user: { id: "admin-1", role: "admin" } };
    expect(await testManage(session)).toBe(true);
  });

  it("returns true when user has manage permission via authorization", async () => {
    vi.mocked(adminUseCases.isAdminRole).mockReturnValue(false);
    vi.mocked(adminUseCases.ensureBootstrapAdmin).mockResolvedValue(null);
    vi.mocked(authzMod.authorization.checkPermission).mockResolvedValue({
      granted: true,
    });
    const session = { user: { id: "user-1", role: "user" } };
    expect(await testManage(session)).toBe(true);
  });

  it("returns false when user lacks manage permission", async () => {
    vi.mocked(adminUseCases.isAdminRole).mockReturnValue(false);
    vi.mocked(adminUseCases.ensureBootstrapAdmin).mockResolvedValue(null);
    vi.mocked(authzMod.authorization.checkPermission).mockResolvedValue({
      granted: false,
    });
    const session = { user: { id: "user-1", role: "user" } };
    expect(await testManage(session)).toBe(false);
  });

  it("passes correct workspaceId to authorization", async () => {
    vi.mocked(adminUseCases.isAdminRole).mockReturnValue(false);
    vi.mocked(adminUseCases.ensureBootstrapAdmin).mockResolvedValue(null);
    vi.mocked(authzMod.authorization.checkPermission).mockResolvedValue({
      granted: true,
    });
    const session = { user: { id: "user-1", role: "user" } };
    await testManage(session, "custom-ws");
    expect(authzMod.authorization.checkPermission).toHaveBeenCalledWith(
      { principalType: "user", principalId: "user-1" },
      "workspaces.curate",
      "workspace",
      "custom-ws",
    );
  });
});

describe("admin/auth – requireAdminApiSession", () => {
  async function testAdmin() {
    const { requireAdminApiSession } = await import("@/modules/admin/auth");
    return requireAdminApiSession();
  }

  it("returns unauthorized when no session", async () => {
    vi.mocked(sessionMod.getSession).mockResolvedValue(null);
    const result = await testAdmin();
    expect(result.ok).toBe(false);
  });

  it("returns forbidden when not admin", async () => {
    const session = {
      session: {
        id: "s",
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: "user-1",
        expiresAt: new Date(),
        token: "t",
      },
      user: {
        id: "user-1",
        role: "user",
        email: "u@t.com",
        name: "U",
        emailVerified: true,
        banned: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
    vi.mocked(sessionMod.getSession).mockResolvedValue(session);
    vi.mocked(adminUseCases.isAdminRole).mockReturnValue(false);
    vi.mocked(adminUseCases.ensureBootstrapAdmin).mockResolvedValue(null);
    const result = await testAdmin();
    expect(result.ok).toBe(false);
  });

  it("returns session when admin", async () => {
    const session = {
      session: {
        id: "s",
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: "admin-1",
        expiresAt: new Date(),
        token: "t",
      },
      user: {
        id: "admin-1",
        role: "admin",
        email: "a@t.com",
        name: "A",
        emailVerified: true,
        banned: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
    vi.mocked(sessionMod.getSession).mockResolvedValue(session);
    vi.mocked(adminUseCases.isAdminRole).mockReturnValue(true);
    const result = await testAdmin();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.user.id).toBe("admin-1");
    }
  });
});
