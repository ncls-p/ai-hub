import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
  archiveMcpServer,
  getMcpServer,
  toMcpServerForEdit,
  toSafeMcpServer,
  updateMcpServer,
} from "@/modules/mcp/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const querySchema = z.object({ workspaceId: z.uuid() });
const updateSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().min(1).max(255).optional(),
  transport: z.enum(["stdio", "sse", "streamable-http"]).optional(),
  url: z.url().or(z.literal("")).optional(),
  command: z.string().max(2048).optional(),
  args: z.array(z.string().max(512)).optional(),
  enabled: z.boolean().optional(),
  requireApproval: z.boolean().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

async function ensure(
  sessionUserId: string,
  workspaceId: string,
  permissionName: string,
) {
  return authorization.requirePermission(
    { principalType: "user", principalId: sessionUserId },
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
    const server = await getMcpServer(serverId, parsed.data.workspaceId);
    if (!server)
      return NextResponse.json(
        { error: "MCP server not found" },
        { status: 404 },
      );
    return NextResponse.json(toMcpServerForEdit(server));
  } catch (error) {
    logHandledError("Failed to get MCP server", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> },
) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
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
    const server = await updateMcpServer({
      serverId,
      userId: session.user.id,
      ...parsed.data,
    });
    return NextResponse.json(toSafeMcpServer(server));
  } catch (error) {
    logHandledError("Failed to update MCP server", {}, error as Error);
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

export async function DELETE(
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
      "mcpServers.manage",
    );
    if (!permission.granted)
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    const { serverId } = await params;
    await archiveMcpServer(serverId, parsed.data.workspaceId, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    logHandledError("Failed to archive MCP server", {}, error as Error);
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
