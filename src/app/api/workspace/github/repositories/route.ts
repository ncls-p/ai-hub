import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute } from "@/lib/route-handler";
import { getUserGitHubStatus } from "@/modules/github/publishing";
import { authorization } from "@/server/domain/services/authorization";

const querySchema = z.object({ workspaceId: z.uuid() });

export async function GET(req: NextRequest) {
  return handleRoute(req, async ({ session }) => {
    const parsed = querySchema.safeParse({
      workspaceId: req.nextUrl.searchParams.get("workspaceId"),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const permission = await authorization.checkPermission(
      { principalType: "user", principalId: session.user.id },
      "agents.chat",
      "workspace",
      parsed.data.workspaceId,
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }
    const status = await getUserGitHubStatus({
      userId: session.user.id,
      workspaceId: parsed.data.workspaceId,
      origin: req.nextUrl.origin,
    });
    return NextResponse.json({ repositories: status.repositories });
  });
}
