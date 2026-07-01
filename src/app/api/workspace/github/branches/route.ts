import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { listGitHubBranches } from "@/modules/github/publishing";

const querySchema = z.object({
  workspaceId: z.uuid(),
  repositoryId: z.uuid(),
});

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = querySchema.safeParse({
        workspaceId: req.nextUrl.searchParams.get("workspaceId"),
        repositoryId: req.nextUrl.searchParams.get("repositoryId"),
      });
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "agents.chat",
      );
      if (forbidden) return forbidden;
      return NextResponse.json({
        branches: await listGitHubBranches({
          userId: session.user.id,
          repositoryId: parsed.data.repositoryId,
        }),
      });
    },
    { logLabel: "Failed to load branches" },
  );
}
