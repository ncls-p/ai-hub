import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { createMcpServer, listMcpServers } from "@/modules/mcp/use-cases";

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

export async function GET(req: NextRequest) {
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
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "mcpServers.get",
      );
      if (forbidden) return forbidden;
      return NextResponse.json(await listMcpServers(parsed.data.workspaceId));
    },
    { logLabel: "Failed to list MCP servers" },
  );
}

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = createSchema.safeParse(await req.json());
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "mcpServers.manage",
      );
      if (forbidden) return forbidden;
      const server = await createMcpServer({
        ...parsed.data,
        userId: session.user.id,
      });
      return NextResponse.json(server, { status: 201 });
    },
    { logLabel: "Failed to create MCP server" },
  );
}
