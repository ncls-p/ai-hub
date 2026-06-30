import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/modules/auth/session";
import { getUserGitHubStatus } from "@/modules/github/publishing";
import { authorization } from "@/server/domain/services/authorization";

const querySchema = z.object({ workspaceId: z.uuid() });

export async function GET(req: NextRequest) {
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
  return NextResponse.json(
    await getUserGitHubStatus({
      userId: session.user.id,
      workspaceId: parsed.data.workspaceId,
      origin: req.nextUrl.origin,
    }),
  );
}
