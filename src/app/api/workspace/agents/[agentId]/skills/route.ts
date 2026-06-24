import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/modules/auth/session";
import {
  getActiveVersion,
  getVisibleAgentById,
  updateAgent,
} from "@/modules/agent/use-cases";
import { isAdminRole } from "@/modules/admin/use-cases";
import { getSkillBindingsForVersion } from "@/modules/skills/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { logHandledError } from "@/lib/logger";

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

    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "agents.get",
      "workspace",
      parsedQuery.data.workspaceId,
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

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
  } catch (error) {
    logHandledError("Failed to get skill bindings", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsedParams = routeParamsSchema.safeParse(await params);
    const parsedBody = putSchema.safeParse(await req.json());

    if (!parsedParams.success || !parsedBody.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { agentId } = parsedParams.data;
    const { workspaceId, skillIds } = parsedBody.data;

    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "agents.update",
      "workspace",
      workspaceId,
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    const { version } = await updateAgent({
      agentId,
      workspaceId,
      userId: session.user.id,
      canAdminCurate: isAdminRole(session.user.role),
      skillBindings: skillIds,
    });
    const bindings = await getSkillBindingsForVersion(version.id);
    return NextResponse.json({ version, bindings });
  } catch (error) {
    if ((error as Error).message === "Agent not found") {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    if (
      (error as Error).message ===
      "Only the creator or an admin can update this agent"
    ) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 403 },
      );
    }
    if ((error as Error).message === "Skill not found") {
      return NextResponse.json({ error: "Skill not found" }, { status: 400 });
    }
    logHandledError("Failed to update skill bindings", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
