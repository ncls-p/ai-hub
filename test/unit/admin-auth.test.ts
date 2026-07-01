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

import * as adminUseCases from "@/modules/admin/use-cases";
import * as sessionMod from "@/modules/auth/session";

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
