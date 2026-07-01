import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAdminRole } from "@/modules/admin/use-cases";
import { reorderOrganizationAgents } from "@/modules/agent/use-cases";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";

const orderSchema = z.object({
  workspaceId: z.uuid(),
  agentIds: z.array(z.uuid()).max(200),
});

export async function PUT(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const body = await req.json();
      const parsed = orderSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }

      const { workspaceId, agentIds } = parsed.data;
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        workspaceId,
        "agents.update",
      );
      if (forbidden) return forbidden;
      if (!isAdminRole(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      await reorderOrganizationAgents({
        workspaceId,
        userId: session.user.id,
        agentIds,
      });
      return NextResponse.json({ ok: true });
    },
    {
      logLabel: "Failed to reorder organization agents",
      expectedError: (error) => {
        if (
          error instanceof Error &&
          error.message === "Organization assistant not found"
        ) {
          return NextResponse.json({ error: error.message }, { status: 404 });
        }
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 },
        );
      },
    },
  );
}
