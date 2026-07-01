import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  getActiveVersion,
  getVisibleAgentById,
  updateAgent,
} from "@/modules/agent/use-cases";
import { isAdminRole } from "@/modules/admin/use-cases";
import { getSkillBindingsForVersion } from "@/modules/skills/use-cases";

const routeParamsSchema = z.object({ agentId: z.uuid() });
const workspaceQuerySchema = z.object({ workspaceId: z.uuid() });
const putSchema = z.object({
  workspaceId: z.uuid(),
  skillIds: z.array(z.uuid()),
});

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
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsedQuery.data.workspaceId,
        "agents.get",
      );
      if (forbidden) return forbidden;
      const agent = await getVisibleAgentById(
        parsedParams.data.agentId,
        parsedQuery.data.workspaceId,
        session.user.id,
        isAdminRole(session.user.role),
      );
      if (!agent) {
        return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      }
      const version = await getActiveVersion(parsedParams.data.agentId);
      if (!version) return NextResponse.json({ bindings: [] });
      const bindings = await getSkillBindingsForVersion(version.id);
      return NextResponse.json({ bindings });
    },
    { logLabel: "Failed to get skill bindings" },
  );
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = routeParamsSchema.safeParse(await params);
      const parsedBody = putSchema.safeParse(await req.json());
      if (!parsedParams.success || !parsedBody.success) {
        return NextResponse.json({ error: "Invalid input" }, { status: 400 });
      }
      const { agentId } = parsedParams.data;
      const { workspaceId, skillIds } = parsedBody.data;
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        workspaceId,
        "agents.update",
      );
      if (forbidden) return forbidden;
      const { version } = await updateAgent({
        agentId,
        workspaceId,
        userId: session.user.id,
        canAdminCurate: isAdminRole(session.user.role),
        skillBindings: skillIds,
      });
      const bindings = await getSkillBindingsForVersion(version.id);
      return NextResponse.json({ version, bindings });
    },
    {
      logLabel: "Failed to update skill bindings",
      expectedError: (error) => {
        if (error instanceof Error && error.message === "Agent not found") {
          return NextResponse.json(
            { error: "Agent not found" },
            { status: 404 },
          );
        }
        if (
          error instanceof Error &&
          error.message === "Only the creator or an admin can update this agent"
        ) {
          return NextResponse.json({ error: error.message }, { status: 403 });
        }
        if (error instanceof Error && error.message === "Skill not found") {
          return NextResponse.json(
            { error: "Skill not found" },
            { status: 400 },
          );
        }
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 },
        );
      },
    },
  );
}
