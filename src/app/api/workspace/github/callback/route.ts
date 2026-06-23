import { NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/env";
import { getSession } from "@/modules/auth/session";
import {
	parseGitHubState,
	syncGitHubInstallation,
} from "@/modules/github/publishing";
import { authorization } from "@/server/domain/services/authorization";

function publicOrigin(req: NextRequest) {
	const forwardedHost = req.headers
		.get("x-forwarded-host")
		?.split(",")[0]
		?.trim();
	const forwardedProto =
		req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "https";
	if (forwardedHost && forwardedHost !== "0.0.0.0") {
		return `${forwardedProto}://${forwardedHost}`;
	}
	return env.BETTER_AUTH_URL || req.nextUrl.origin;
}

function chatRedirect(req: NextRequest, params: Record<string, string>) {
	const url = new URL("/chat", publicOrigin(req));
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
	try {
		const session = await getSession();
		if (!session) {
			return chatRedirect(req, { github: "unauthorized" });
		}
		const installationId = req.nextUrl.searchParams.get("installation_id");
		const state = req.nextUrl.searchParams.get("state");
		if (!installationId || !state) {
			return chatRedirect(req, { github: "missing" });
		}
		const parsedState = parseGitHubState(state);
		if (parsedState.userId !== session.user.id) {
			return chatRedirect(req, { github: "forbidden" });
		}
		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"agents.chat",
			"workspace",
			parsedState.workspaceId,
		);
		if (!permission.granted) {
			return chatRedirect(req, { github: "forbidden" });
		}
		await syncGitHubInstallation({
			userId: session.user.id,
			installationId,
		});
		return chatRedirect(req, { github: "connected" });
	} catch (error) {
		return chatRedirect(req, {
			github: "error",
			message: error instanceof Error ? error.message.slice(0, 160) : "failed",
		});
	}
}
