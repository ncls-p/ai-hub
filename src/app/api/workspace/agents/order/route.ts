import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAdminRole } from "@/modules/admin/use-cases";
import { reorderOrganizationAgents } from "@/modules/agent/use-cases";
import { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";
import { logHandledError } from "@/lib/logger";

const orderSchema = z.object({
  workspaceId: z.uuid(),
  agentIds: z.array(z.uuid()).max(200),
});

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = orderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { workspaceId, agentIds } = parsed.data;
    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "agents.update",
      "workspace",
      workspaceId,
    );
    if (!permission.granted || !isAdminRole(session.user.role)) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    await reorderOrganizationAgents({
      workspaceId,
      userId: session.user.id,
      agentIds,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Organization assistant not found"
    ) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    logHandledError(
      "Failed to reorder organization agents",
      {},
      error as Error,
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
