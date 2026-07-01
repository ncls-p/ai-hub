import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { listMcpTools, syncMcpTools } from "@/modules/mcp/use-cases";

const querySchema = z.object({ workspaceId: z.uuid() });

async function ensure(
  userId: string,
  workspaceId: string,
  permissionName: string,
) {
  return requireWorkspacePermissionAsync(userId, workspaceId, permissionName);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = querySchema.safeParse({
        workspaceId: new URL(req.url).searchParams.get("workspaceId"),
      });
      if (!parsed.success)
        return NextResponse.json(
          { error: "workspaceId must be a valid UUID" },
          { status: 400 },
        );
      const forbidden = await ensure(
        session.user.id,
        parsed.data.workspaceId,
        "mcpServers.get",
      );
      if (forbidden) return forbidden;
      const { serverId } = await params;
      return NextResponse.json(
        await listMcpTools(serverId, parsed.data.workspaceId),
      );
    },
    {
      logLabel: "Failed to list MCP tools",
      expectedError: (error) => {
        const msg =
          error instanceof Error ? error.message : "Internal server error";
        const status =
          error instanceof Error && error.message.includes("not found")
            ? 404
            : 500;
        return NextResponse.json({ error: msg }, { status });
      },
    },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = querySchema.safeParse({
        workspaceId:
          new URL(req.url).searchParams.get("workspaceId") ??
          (await req.json().catch(() => ({}))).workspaceId,
      });
      if (!parsed.success)
        return NextResponse.json(
          { error: "workspaceId must be a valid UUID" },
          { status: 400 },
        );
      const forbidden = await ensure(
        session.user.id,
        parsed.data.workspaceId,
        "mcpServers.manage",
      );
      if (forbidden) return forbidden;
      const { serverId } = await params;
      return NextResponse.json(
        await syncMcpTools(serverId, parsed.data.workspaceId, session.user.id),
      );
    },
    {
      logLabel: "Failed to sync MCP tools",
      expectedError: (error) => {
        const msg =
          error instanceof Error ? error.message : "Internal server error";
        const status =
          error instanceof Error && error.message.includes("not found")
            ? 404
            : 500;
        return NextResponse.json({ error: msg }, { status });
      },
    },
  );
}
