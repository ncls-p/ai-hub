import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { handleRoute } from "@/lib/route-handler";
import { publishCodeWorkspaceToGitHub } from "@/modules/github/publishing";
import { authorization } from "@/server/domain/services/authorization";

const publishSchema = z.object({
  workspaceId: z.uuid(),
  projectId: z.uuid(),
  repositoryId: z.uuid(),
  mode: z.enum(["pull_request", "direct_push"]),
  targetBranch: z.string().trim().min(1).max(255),
  sourceBranch: z.string().trim().min(1).max(255).optional(),
  targetDirectory: z.string().trim().max(260).optional(),
  commitMessage: z.string().trim().min(1).max(240),
  pullRequestTitle: z.string().trim().min(1).max(240).optional(),
  pullRequestBody: z.string().trim().max(4000).optional(),
  conversationId: z.uuid().optional(),
  agentId: z.uuid().optional(),
  confirmDirectPush: z.boolean().default(false),
});

function githubPublishRouteLog(
  stage: string,
  metadata: Record<string, unknown>,
  level: "info" | "error" = "info",
) {
  logger[level]("GitHub publish route", { stage, ...metadata });
}

export async function POST(req: NextRequest) {
  return handleRoute(req, async ({ session, requestId }) => {
    let routeLogContext: Record<string, unknown> = { requestId };
    try {
      const body = (await req.json().catch(() => null)) as unknown;
      const parsed = publishSchema.safeParse(body);
      if (!parsed.success) {
        githubPublishRouteLog(
          "invalid-request",
          { requestId, userId: session.user.id, issues: parsed.error.issues.length },
          "error",
        );
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      routeLogContext = {
        requestId,
        userId: session.user.id,
        workspaceId: parsed.data.workspaceId,
        projectId: parsed.data.projectId,
        repositoryId: parsed.data.repositoryId,
        mode: parsed.data.mode,
        targetBranch: parsed.data.targetBranch,
        targetDirectory: parsed.data.targetDirectory || null,
      };
      githubPublishRouteLog("request", routeLogContext);
      const permission = await authorization.checkPermission(
        { principalType: "user", principalId: session.user.id },
        "agents.chat",
        "workspace",
        parsed.data.workspaceId,
      );
      if (!permission.granted) {
        githubPublishRouteLog(
          "forbidden",
          { ...routeLogContext, reason: permission.reason },
          "error",
        );
        return NextResponse.json(
          { error: "Forbidden", reason: permission.reason },
          { status: 403 },
        );
      }
      const result = await publishCodeWorkspaceToGitHub({
        ...parsed.data,
        userId: session.user.id,
      });
      githubPublishRouteLog("success", routeLogContext);
      return NextResponse.json({ result });
    } catch (error) {
      githubPublishRouteLog(
        "failure",
        {
          ...routeLogContext,
          error: error instanceof Error ? error.message : String(error),
        },
        "error",
      );
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "GitHub publish failed",
        },
        { status: 400 },
      );
    }
  });
}
