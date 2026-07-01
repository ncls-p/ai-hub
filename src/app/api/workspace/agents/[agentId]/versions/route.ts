import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  getVisibleAgentById,
  getAgentVersions,
  getAgentVersionById,
} from "@/modules/agent/use-cases";
import { isAdminRole } from "@/modules/admin/use-cases";

const routeParamsSchema = z.object({ agentId: z.uuid() });
const workspaceQuerySchema = z.object({ workspaceId: z.uuid() });

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = routeParamsSchema.safeParse(await params);
      const { searchParams } = new URL(req.url);
      const parsedQuery = workspaceQuerySchema.safeParse({
        workspaceId: searchParams.get("workspaceId"),
      });
      if (!parsedParams.success || !parsedQuery.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const { agentId } = parsedParams.data;
      const { workspaceId } = parsedQuery.data;
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        workspaceId,
        "agents.get",
      );
      if (forbidden) return forbidden;
      const agent = await getVisibleAgentById(
        agentId,
        workspaceId,
        session.user.id,
        isAdminRole(session.user.role),
      );
      if (!agent) {
        return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      }
      const versionId = searchParams.get("versionId");
      if (versionId) {
        const version = await getAgentVersionById(versionId);
        if (!version || version.agentId !== agentId) {
          return NextResponse.json(
            { error: "Version not found" },
            { status: 404 },
          );
        }
        return NextResponse.json({
          ...version,
          isActive: version.id === agent.activeVersionId,
        });
      }
      const versions = await getAgentVersions(agentId);
      const result = versions.map((v) => ({
        ...v,
        isActive: v.id === agent.activeVersionId,
      }));
      return NextResponse.json(result);
    },
    { logLabel: "Failed to list agent versions" },
  );
}
