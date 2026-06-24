import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { createMcpServer, listMcpServers } from "@/modules/mcp/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const querySchema = z.object({ workspaceId: z.uuid() });
const createSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().min(1).max(255),
  transport: z.enum(["stdio", "sse", "streamable-http"]),
  command: z.string().max(2048).optional(),
  args: z.array(z.string().max(512)).optional(),
  url: z.url().optional(),
  requireApproval: z.boolean().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

async function requireUserPermission(
  userId: string,
  workspaceId: string,
  permission: string,
) {
  const result = await authorization.requirePermission(
    { principalType: "user", principalId: userId },
    permission,
    "workspace",
    workspaceId,
  );
  return result;
}

export async function GET(req: NextRequest) {
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
    const permission = await requireUserPermission(
      session.user.id,
      parsed.data.workspaceId,
      "mcpServers.get",
    );
    if (!permission.granted)
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    return NextResponse.json(await listMcpServers(parsed.data.workspaceId));
  } catch (error) {
    logHandledError("Failed to list MCP servers", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
        { status: 400 },
      );
    const permission = await requireUserPermission(
      session.user.id,
      parsed.data.workspaceId,
      "mcpServers.manage",
    );
    if (!permission.granted)
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    const server = await createMcpServer({
      ...parsed.data,
      userId: session.user.id,
    });
    return NextResponse.json(server, { status: 201 });
  } catch (error) {
    logHandledError("Failed to create MCP server", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
