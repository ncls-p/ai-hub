import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAdminRole } from "@/modules/admin/use-cases";
import {
  getAgentDefaultPreferences,
  setOrganizationDefaultAgent,
  setUserDefaultAgent,
} from "@/modules/agent/use-cases";
import { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";
import { logHandledError } from "@/lib/logger";

const querySchema = z.object({ workspaceId: z.uuid() });
const patchSchema = z.object({
  workspaceId: z.uuid(),
  scope: z.enum(["organization", "user"]),
  defaultAgentId: z.uuid().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      workspaceId: searchParams.get("workspaceId"),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "agents.list",
      "workspace",
      parsed.data.workspaceId,
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    return NextResponse.json(
      await getAgentDefaultPreferences(
        parsed.data.workspaceId,
        session.user.id,
      ),
    );
  } catch (error) {
    logHandledError("Failed to read agent preferences", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { workspaceId, scope, defaultAgentId } = parsed.data;
    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      scope === "organization" ? "agents.update" : "agents.list",
      "workspace",
      workspaceId,
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    const canAdminCurate = isAdminRole(session.user.role);
    if (scope === "organization") {
      if (!canAdminCurate) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.json(
        await setOrganizationDefaultAgent({
          workspaceId,
          userId: session.user.id,
          agentId: defaultAgentId,
        }),
      );
    }

    return NextResponse.json(
      await setUserDefaultAgent({
        workspaceId,
        userId: session.user.id,
        agentId: defaultAgentId,
        canAdminCurate,
      }),
    );
  } catch (error) {
    if (
      error instanceof Error &&
      ["Agent not found", "Organization assistant not found"].includes(
        error.message,
      )
    ) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    logHandledError("Failed to update agent preferences", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
