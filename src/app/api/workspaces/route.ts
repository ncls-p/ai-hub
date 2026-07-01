import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/lib/route-handler";
import {
  ensurePrimaryWorkspaceForUser,
  getWorkspacesByUserId,
} from "@/modules/workspace/use-cases";

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const workspaces = await getWorkspacesByUserId(session.user.id);
      return NextResponse.json(workspaces);
    },
    { logLabel: "Failed to list workspaces" },
  );
}

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const workspace = await ensurePrimaryWorkspaceForUser({
        userId: session.user.id,
        role: session.user.role,
      });
      return NextResponse.json(workspace);
    },
    { logLabel: "Failed to resolve primary workspace" },
  );
}
