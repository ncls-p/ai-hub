import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { updateMcpTool } from "@/modules/mcp/use-cases";

const updateSchema = z.object({
  workspaceId: z.uuid(),
  enabled: z.boolean().optional(),
  requireApproval: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string; toolId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = updateSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "mcpServers.manage",
      );
      if (forbidden) return forbidden;
      const { serverId, toolId } = await params;
      const tool = await updateMcpTool({
        toolId,
        serverId,
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
        enabled: parsed.data.enabled,
        requireApproval: parsed.data.requireApproval,
      });
      return NextResponse.json(tool);
    },
    {
      logLabel: "Failed to update MCP tool",
      expectedError: (error) => {
        const msg =
          error instanceof Error ? error.message : "Internal server error";
        return NextResponse.json({ error: msg }, { status: 400 });
      },
    },
  );
}
