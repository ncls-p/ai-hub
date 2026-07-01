import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { isAdminRole } from "@/modules/admin/use-cases";
import { cloneAgent } from "@/modules/agent/use-cases";

const routeParamsSchema = z.object({ agentId: z.uuid() });
const cloneAgentSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().trim().min(1).max(255).optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = routeParamsSchema.safeParse(await params);
      const parsedBody = cloneAgentSchema.safeParse(await req.json());
      if (!parsedParams.success || !parsedBody.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsedBody.data.workspaceId,
        "agents.create",
      );
      if (forbidden) return forbidden;
      const result = await cloneAgent({
        agentId: parsedParams.data.agentId,
        workspaceId: parsedBody.data.workspaceId,
        userId: session.user.id,
        canAdminCurate: isAdminRole(session.user.role),
        name: parsedBody.data.name,
        slug: parsedBody.data.slug,
      });
      return NextResponse.json(result, { status: 201 });
    },
    {
      logLabel: "Failed to clone agent",
      expectedError: (error) => {
        if (error instanceof Error && error.message === "Agent not found") {
          return NextResponse.json(
            { error: "Agent not found" },
            { status: 404 },
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
