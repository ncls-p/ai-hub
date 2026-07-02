import { NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/env";
import { logger, logHandledError } from "@/lib/logger";
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
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const startedAt = Date.now();
  try {
    const session = await getSession();
    if (!session) {
      logger.warn("GitHub callback rejected", {
        requestId,
        reason: "no_session",
        durationMs: Date.now() - startedAt,
      });
      return chatRedirect(req, { github: "unauthorized" });
    }
    const installationId = req.nextUrl.searchParams.get("installation_id");
    const state = req.nextUrl.searchParams.get("state");
    if (!installationId || !state) {
      logger.warn("GitHub callback rejected", {
        requestId,
        userId: session.user.id,
        reason: "missing_installation_or_state",
        durationMs: Date.now() - startedAt,
      });
      return chatRedirect(req, { github: "missing" });
    }
    const parsedState = parseGitHubState(state);
    if (parsedState.userId !== session.user.id) {
      logger.warn("GitHub callback rejected", {
        requestId,
        userId: session.user.id,
        stateUserId: parsedState.userId,
        reason: "state_user_mismatch",
        durationMs: Date.now() - startedAt,
      });
      return chatRedirect(req, { github: "forbidden" });
    }
    const permission = await authorization.checkPermission(
      { principalType: "user", principalId: session.user.id },
      "agents.chat",
      "workspace",
      parsedState.workspaceId,
    );
    if (!permission.granted) {
      logger.warn("GitHub callback rejected", {
        requestId,
        userId: session.user.id,
        workspaceId: parsedState.workspaceId,
        reason: permission.reason ?? "missing_workspace_permission",
        durationMs: Date.now() - startedAt,
      });
      return chatRedirect(req, { github: "forbidden" });
    }
    await syncGitHubInstallation({
      userId: session.user.id,
      installationId,
    });
    logger.info("GitHub callback completed", {
      requestId,
      userId: session.user.id,
      workspaceId: parsedState.workspaceId,
      installationId,
      durationMs: Date.now() - startedAt,
    });
    return chatRedirect(req, { github: "connected" });
  } catch (error) {
    logHandledError(
      "GitHub callback failed",
      { requestId, durationMs: Date.now() - startedAt },
      error as Error,
    );
    return chatRedirect(req, {
      github: "error",
      message: error instanceof Error ? error.message.slice(0, 160) : "failed",
    });
  }
}
