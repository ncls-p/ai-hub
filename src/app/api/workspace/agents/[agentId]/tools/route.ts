import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  getAgentById,
  getVisibleAgentById,
  getActiveVersion,
  updateAgent,
} from "@/modules/agent/use-cases";
import { isAdminRole } from "@/modules/admin/use-cases";
import {
  getToolBindingsForVersion,
  toolBindingInputSchema,
} from "@/modules/tool/use-cases";
import { audit } from "@/server/domain/services/audit";

const routeParamsSchema = z.object({ agentId: z.uuid() });
const querySchema = z.object({
  workspaceId: z.uuid(),
  versionId: z.uuid().optional(),
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
      const parsedQuery = querySchema.safeParse({
        workspaceId: searchParams.get("workspaceId"),
        versionId: searchParams.get("versionId") ?? undefined,
      });
      if (!parsedParams.success || !parsedQuery.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const { agentId } = parsedParams.data;
      const { workspaceId, versionId } = parsedQuery.data;
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
      const activeVersion = versionId ? null : await getActiveVersion(agentId);
      const targetVersionId = versionId ?? activeVersion?.id;
      if (!targetVersionId) {
        return NextResponse.json([]);
      }
      const bindings = await getToolBindingsForVersion(targetVersionId);
      return NextResponse.json(bindings);
    },
    { logLabel: "Failed to list agent tools" },
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
      const { searchParams } = new URL(req.url);
      const parsedQuery = querySchema.safeParse({
        workspaceId: searchParams.get("workspaceId"),
        versionId: searchParams.get("versionId") ?? undefined,
      });
      if (!parsedParams.success || !parsedQuery.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const { agentId } = parsedParams.data;
      const { workspaceId } = parsedQuery.data;
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        workspaceId,
        "agents.update",
      );
      if (forbidden) return forbidden;
      const agent = await getAgentById(agentId, workspaceId);
      if (!agent) {
        return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      }
      if (!agent.activeVersionId) {
        return NextResponse.json(
          { error: "No active version to bind tools to" },
          { status: 400 },
        );
      }
      const body = await req.json();
      const parsedBody = z
        .object({ bindings: z.array(toolBindingInputSchema) })
        .safeParse(body);
      if (!parsedBody.success) {
        return NextResponse.json(
          { error: "Invalid request body", details: parsedBody.error.issues },
          { status: 400 },
        );
      }
      const { version } = await updateAgent({
        agentId,
        workspaceId,
        userId: session.user.id,
        canAdminCurate: isAdminRole(session.user.role),
        toolBindings: parsedBody.data.bindings,
      });
      await audit.emit({
        workspaceId,
        actorPrincipalType: "user",
        actorPrincipalId: session.user.id,
        action: "agent.tools.updated",
        resourceType: "agent",
        resourceId: agentId,
        outcome: "success",
        metadata: {
          versionId: version.id,
          versionNumber: version.versionNumber,
          bindingCount: parsedBody.data.bindings.length,
        },
      });
      const bindings = await getToolBindingsForVersion(version.id);
      return NextResponse.json({ version, bindings });
    },
    {
      logLabel: "Failed to update agent tools",
      expectedError: (error) => {
        if (error instanceof Error && error.message === "Agent not found") {
          return NextResponse.json(
            { error: "Agent not found" },
            { status: 404 },
          );
        }
        if (
          error instanceof Error &&
          [
            "Tool not found",
            "Custom tool not found",
            "MCP tool not found",
          ].includes(error.message)
        ) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        if (
          error instanceof Error &&
          error.message === "Only the creator or an admin can update this agent"
        ) {
          return NextResponse.json({ error: error.message }, { status: 403 });
        }
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 },
        );
      },
    },
  );
}
