import { NextRequest, NextResponse } from "next/server";
import { isPlatformAdminSession } from "@/modules/admin/auth";
import { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";
import { logger, logHandledError } from "@/lib/logger";

/** Wrap an async handler with session authentication and consistent error handling. */
export type RouteHandlerOptions = {
	logLabel?: string;
	expectedError?: (error: unknown) => NextResponse | null;
};

type AuthSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

type RouteLogScope = "workspace" | "admin";

function requestIdFrom(req: NextRequest) {
	return req.headers?.get?.("x-request-id") ?? crypto.randomUUID();
}

function routePathFrom(req: NextRequest) {
	if (req.nextUrl?.pathname) return req.nextUrl.pathname;
	if (req.url) return new URL(req.url).pathname;
	return "unknown";
}

function attachRequestId(response: Response, requestId: string) {
	try {
		response.headers.set("x-request-id", requestId);
	} catch {
		// Some tests and edge cases use lightweight Response-like objects.
	}
	return response;
}

function routeLogData(
	req: NextRequest,
	requestId: string,
	startedAt: number,
	scope: RouteLogScope,
	status: number,
	session?: AuthSession,
) {
	return {
		requestId,
		method: req.method ?? "UNKNOWN",
		path: routePathFrom(req),
		status,
		durationMs: Date.now() - startedAt,
		scope,
		userId: session?.user?.id,
	};
}

function logRouteCompleted(
	req: NextRequest,
	requestId: string,
	startedAt: number,
	scope: RouteLogScope,
	response: Response,
	session?: AuthSession,
) {
	logger.info(
		"API request completed",
		routeLogData(req, requestId, startedAt, scope, response.status, session),
	);
	return attachRequestId(response, requestId);
}

function logRouteRejected(
	req: NextRequest,
	requestId: string,
	startedAt: number,
	scope: RouteLogScope,
	status: number,
	reason: string,
	session?: AuthSession,
) {
	logger.warn("API request rejected", {
		...routeLogData(req, requestId, startedAt, scope, status, session),
		reason,
	});
}

/** Wrap an async handler with session authentication and consistent error handling. */
export async function handleRoute(
	req: NextRequest,
	handler: (ctx: {
		session: AuthSession;
		request: NextRequest;
		requestId: string;
	}) => Promise<Response>,
	opts?: RouteHandlerOptions,
): Promise<Response> {
	const requestId = requestIdFrom(req);
	const startedAt = Date.now();

	try {
		const session = await getSession();
		if (!session) {
			logRouteRejected(
				req,
				requestId,
				startedAt,
				"workspace",
				401,
				"no_session",
			);
			return attachRequestId(
				NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
				requestId,
			);
		}
		const response = await handler({ session, request: req, requestId });
		return logRouteCompleted(
			req,
			requestId,
			startedAt,
			"workspace",
			response,
			session,
		);
	} catch (error) {
		const expected = opts?.expectedError?.(error);
		if (expected) {
			logger.info("API request handled expected error", {
				...routeLogData(
					req,
					requestId,
					startedAt,
					"workspace",
					expected.status,
				),
				error: error instanceof Error ? error.message : String(error),
			});
			return attachRequestId(expected, requestId);
		}
		logHandledError(
			opts?.logLabel ?? "Route handler error",
			routeLogData(req, requestId, startedAt, "workspace", 500),
			error as Error,
		);
		return attachRequestId(
			NextResponse.json({ error: "Internal server error" }, { status: 500 }),
			requestId,
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
	const result = await authorization.checkPermission(
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
		session: AuthSession;
		request: NextRequest;
		requestId: string;
	}) => Promise<Response>,
	opts?: RouteHandlerOptions,
): Promise<Response> {
	const requestId = requestIdFrom(req);
	const startedAt = Date.now();

	try {
		const session = await getSession();
		if (!session) {
			logRouteRejected(req, requestId, startedAt, "admin", 401, "no_session");
			return attachRequestId(
				NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
				requestId,
			);
		}
		if (!(await isPlatformAdminSession(session))) {
			logRouteRejected(
				req,
				requestId,
				startedAt,
				"admin",
				403,
				"not_platform_admin",
				session,
			);
			return attachRequestId(
				NextResponse.json({ error: "Forbidden" }, { status: 403 }),
				requestId,
			);
		}
		const response = await handler({ session, request: req, requestId });
		return logRouteCompleted(
			req,
			requestId,
			startedAt,
			"admin",
			response,
			session,
		);
	} catch (error) {
		const expected = opts?.expectedError?.(error);
		if (expected) {
			logger.info("API admin request handled expected error", {
				...routeLogData(req, requestId, startedAt, "admin", expected.status),
				error: error instanceof Error ? error.message : String(error),
			});
			return attachRequestId(expected, requestId);
		}
		logHandledError(
			opts?.logLabel ?? "Admin route handler error",
			routeLogData(req, requestId, startedAt, "admin", 500),
			error as Error,
		);
		return attachRequestId(
			NextResponse.json({ error: "Internal server error" }, { status: 500 }),
			requestId,
		);
	}
}
