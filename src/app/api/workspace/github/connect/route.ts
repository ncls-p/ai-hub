import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/modules/auth/session";
import { createGitHubConnectUrl } from "@/modules/github/publishing";
import { authorization } from "@/server/domain/services/authorization";

const querySchema = z.object({ workspaceId: z.uuid() });

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const parsed = querySchema.safeParse({
      workspaceId: req.nextUrl.searchParams.get("workspaceId"),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const permission = await authorization.requirePermission(
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
    return NextResponse.redirect(
      createGitHubConnectUrl({
        origin: req.nextUrl.origin,
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "GitHub unavailable" },
      { status: 400 },
    );
  }
}
