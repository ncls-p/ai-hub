import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/modules/auth/session";
import {
  getVisibleAgentById,
  getAgentVersions,
  getAgentVersionById,
} from "@/modules/agent/use-cases";
import { isAdminRole } from "@/modules/admin/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { logHandledError } from "@/lib/logger";

const routeParamsSchema = z.object({ agentId: z.uuid() });
const workspaceQuerySchema = z.object({ workspaceId: z.uuid() });

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "agents.get",
      "workspace",
      workspaceId,
    );

    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    const agent = await getVisibleAgentById(
      agentId,
      workspaceId,
      session.user.id,
      isAdminRole(session.user.role),
    );
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // If versionId query param is present, return single version
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
  } catch (error) {
    logHandledError("Failed to list agent versions", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
