import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/modules/auth/session", () => ({
	getSession: vi.fn(),
}));

vi.mock("@/modules/admin/auth", () => ({
	isPlatformAdminSession: vi.fn(),
}));

vi.mock("@/server/domain/services/authorization", () => ({
	authorization: {
		checkPermission: vi.fn(),
		requirePermission: vi.fn(),
		requireWorkspaceMember: vi.fn(),
	},
}));

vi.mock("@/lib/logger", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
	logHandledError: vi.fn(),
}));

vi.mock("next/server", () => ({
	NextResponse: {
		json: vi.fn((body: unknown, init: unknown) => ({
			body,
			init,
			status: (init as { status?: number })?.status ?? 200,
		})),
	},
}));

import { getSession } from "@/modules/auth/session";
import { isPlatformAdminSession } from "@/modules/admin/auth";
import * as authz from "@/server/domain/services/authorization";

import type { NextRequest } from "next/server";

describe("route-handler – handleRoute", async () => {
	const { handleRoute } = await import("@/lib/route-handler");
	const mockReq = {
		headers: new Headers({ "x-request-id": "test-request-id" }),
		method: "GET",
		nextUrl: new URL("http://localhost"),
	} as unknown as NextRequest;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 401 when no session", async () => {
		vi.mocked(getSession).mockResolvedValue(null);
		const response = await handleRoute(mockReq, async () => new Response("ok"));
		expect(response.status).toBe(401);
		expect(response.body).toEqual({ error: "Unauthorized" });
	});

	it("calls handler with session and request", async () => {
		const session = { session: { id: "s" }, user: { id: "u" } };
		vi.mocked(getSession).mockResolvedValue(session as never);
		const handler = vi.fn().mockResolvedValue(new Response("ok"));
		await handleRoute(mockReq, handler);
		expect(handler).toHaveBeenCalledWith({
			session,
			request: expect.anything(),
			requestId: "test-request-id",
		});
	});

	it("returns 500 on unhandled error", async () => {
		vi.mocked(getSession).mockRejectedValue(new Error("boom"));
		const response = await handleRoute(mockReq, async () => new Response("ok"));
		expect(response.status).toBe(500);
		expect(response.body).toEqual({ error: "Internal server error" });
	});

	it("returns custom response via expectedError", async () => {
		const customError = new Error("not found");
		vi.mocked(getSession).mockResolvedValue({
			session: { id: "s" },
			user: { id: "u" },
		} as never);
		const handler = vi.fn().mockRejectedValue(customError);
		const customResponse = { status: 404, body: { error: "Not found" } };
		const response = await handleRoute(mockReq, handler, {
			expectedError: (err: unknown) => {
				if (typeof err === "object" && (err as Error).message === "not found") {
					return customResponse as never;
				}
				return null;
			},
		});
		expect(response).toBe(customResponse);
	});
});

describe("route-handler – requireWorkspacePermissionAsync", async () => {
	const { requireWorkspacePermissionAsync } = await import(
		"@/lib/route-handler"
	);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns null when permission is granted", async () => {
		vi.mocked(authz.authorization.checkPermission).mockResolvedValue({
			granted: true,
		});
		const result = await requireWorkspacePermissionAsync(
			"session-1",
			"ws-1",
			"read",
		);
		expect(result).toBeNull();
		expect(authz.authorization.checkPermission).toHaveBeenCalledWith(
			{ principalType: "user", principalId: "session-1" },
			"read",
			"workspace",
			"ws-1",
		);
	});

	it("returns 403 when permission is denied", async () => {
		vi.mocked(authz.authorization.checkPermission).mockResolvedValue({
			granted: false,
			reason: "Not a member",
		});
		const result = await requireWorkspacePermissionAsync(
			"session-1",
			"ws-1",
			"write",
		);
		expect(result!.status).toBe(403);
		expect(result!.body).toEqual({
			error: "Forbidden",
			reason: "Not a member",
		});
	});
});

describe("route-handler – requireWorkspaceMemberAsync", async () => {
	const { requireWorkspaceMemberAsync } = await import("@/lib/route-handler");

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns null when member", async () => {
		vi.mocked(authz.authorization.requireWorkspaceMember).mockResolvedValue(
			true,
		);
		const result = await requireWorkspaceMemberAsync("user-1", "ws-1");
		expect(result).toBeNull();
		expect(authz.authorization.requireWorkspaceMember).toHaveBeenCalledWith(
			"user-1",
			"ws-1",
		);
	});

	it("returns 403 when not a member", async () => {
		vi.mocked(authz.authorization.requireWorkspaceMember).mockResolvedValue(
			false,
		);
		const result = await requireWorkspaceMemberAsync("user-1", "ws-1");
		expect(result!.status).toBe(403);
		expect(result!.body).toEqual({ error: "Forbidden" });
	});
});

describe("route-handler – handleAdminRoute", async () => {
	const { handleAdminRoute } = await import("@/lib/route-handler");
	const mockReq = {
		headers: new Headers({ "x-request-id": "admin-request-id" }),
		method: "GET",
		nextUrl: new URL("http://localhost"),
	} as unknown as NextRequest;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 401 when no session", async () => {
		vi.mocked(getSession).mockResolvedValue(null);
		const response = await handleAdminRoute(
			mockReq,
			async () => new Response("ok"),
		);
		expect(response.status).toBe(401);
	});

	it("returns 403 when not admin", async () => {
		vi.mocked(getSession).mockResolvedValue({
			session: { id: "s" },
			user: { id: "u" },
		} as never);
		vi.mocked(isPlatformAdminSession).mockResolvedValue(false);
		const response = await handleAdminRoute(
			mockReq,
			async () => new Response("ok"),
		);
		expect(response.status).toBe(403);
		expect(response.body).toEqual({ error: "Forbidden" });
	});

	it("calls handler when admin", async () => {
		const session = { session: { id: "s" }, user: { id: "u" } };
		vi.mocked(getSession).mockResolvedValue(session as never);
		vi.mocked(isPlatformAdminSession).mockResolvedValue(true);
		const handler = vi.fn().mockResolvedValue(new Response("ok"));
		await handleAdminRoute(mockReq, handler);
		expect(handler).toHaveBeenCalledWith({
			session,
			request: expect.anything(),
			requestId: "admin-request-id",
		});
	});

	it("returns 500 on unhandled error", async () => {
		vi.mocked(getSession).mockRejectedValue(new Error("boom"));
		const response = await handleAdminRoute(
			mockReq,
			async () => new Response("ok"),
		);
		expect(response.status).toBe(500);
	});
});
