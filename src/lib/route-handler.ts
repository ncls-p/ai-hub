import { NextRequest, NextResponse } from "next/server";
import { isPlatformAdminSession } from "@/modules/admin/auth";
import { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";
import { logHandledError } from "@/lib/logger";

/**
 * Wrap an async handler with session auth + error handling.
 *
 * Usage in a route handler:
 *
 *   export async function GET(req: NextRequest) {
 *     return handleRoute(req, async ({ session }) => {
 *       // your logic here
 *       return NextResponse.json({ ok: true });
 *     }, { logLabel: "List widgets" });
 *   }
 */
export type RouteHandlerOptions = {
	logLabel?: string;
	expectedError?: (error: unknown) => NextResponse | null;
};

export async function handleRoute(
	req: NextRequest,
	handler: (ctx: {
		session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
		request: NextRequest;
	}) => Promise<Response>,
	opts?: RouteHandlerOptions,
): Promise<Response> {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		return await handler({ session, request: req });
	} catch (error) {
		const expected = opts?.expectedError?.(error);
		if (expected) return expected;
		logHandledError(
			opts?.logLabel ?? "Route handler error",
			{},
			error as Error,
		);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

/**
 * Async version – check workspace permission and return early on failure.
 */
export async function requireWorkspacePermissionAsync(
	sessionId: string,
	workspaceId: string,
	permission: string,
): Promise<NextResponse | null> {
	const result = await authorization.requirePermission(
		{ principalType: "user", principalId: sessionId },
		permission,
		"workspace",
		workspaceId,
	);
	if (!result.granted) {
		return NextResponse.json(
			{ error: "Forbidden", reason: result.reason },
			{ status: 403 },
		);
	}
	return null;
}

/**
 * Check that the user is a workspace member.
 */
export async function requireWorkspaceMemberAsync(
	userId: string,
	workspaceId: string,
): Promise<NextResponse | null> {
	const isMember = await authorization.requireWorkspaceMember(
		userId,
		workspaceId,
	);
	if (!isMember) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	return null;
}

/**
 * Wrap an async handler with admin session auth + error handling.
 * Requires the user to have the admin role.
 */
export async function handleAdminRoute(
	req: NextRequest,
	handler: (ctx: {
		session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
		request: NextRequest;
	}) => Promise<Response>,
	opts?: RouteHandlerOptions,
): Promise<Response> {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		if (!(await isPlatformAdminSession(session))) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}
		return await handler({ session, request: req });
	} catch (error) {
		const expected = opts?.expectedError?.(error);
		if (expected) return expected;
		logHandledError(
			opts?.logLabel ?? "Admin route handler error",
			{},
			error as Error,
		);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
