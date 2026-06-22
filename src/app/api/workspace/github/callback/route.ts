import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/modules/auth/session";
import {
	parseGitHubState,
	syncGitHubInstallation,
} from "@/modules/github/publishing";
import { authorization } from "@/server/domain/services/authorization";

function chatRedirect(req: NextRequest, params: Record<string, string>) {
	const url = new URL("/chat", req.nextUrl.origin);
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
