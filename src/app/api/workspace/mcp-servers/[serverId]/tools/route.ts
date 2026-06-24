import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { listMcpTools, syncMcpTools } from "@/modules/mcp/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const querySchema = z.object({ workspaceId: z.uuid() });

async function ensure(
  userId: string,
  workspaceId: string,
  permissionName: string,
) {
  return authorization.requirePermission(
    { principalType: "user", principalId: userId },
    permissionName,
    "workspace",
    workspaceId,
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> },
) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = querySchema.safeParse({
      workspaceId: new URL(req.url).searchParams.get("workspaceId"),
    });
    if (!parsed.success)
      return NextResponse.json(
        { error: "workspaceId must be a valid UUID" },
        { status: 400 },
      );
    const permission = await ensure(
      session.user.id,
      parsed.data.workspaceId,
      "mcpServers.get",
    );
    if (!permission.granted)
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    const { serverId } = await params;
    return NextResponse.json(
      await listMcpTools(serverId, parsed.data.workspaceId),
    );
  } catch (error) {
    logHandledError("Failed to list MCP tools", {}, error as Error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      {
        status:
          error instanceof Error && error.message.includes("not found")
            ? 404
            : 500,
      },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> },
) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const permission = await ensure(
      session.user.id,
      parsed.data.workspaceId,
      "mcpServers.manage",
    );
    if (!permission.granted)
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    const { serverId } = await params;
    return NextResponse.json(
      await syncMcpTools(serverId, parsed.data.workspaceId, session.user.id),
    );
  } catch (error) {
    logHandledError("Failed to sync MCP tools", {}, error as Error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      {
        status:
          error instanceof Error && error.message.includes("not found")
            ? 404
            : 500,
      },
    );
  }
}
