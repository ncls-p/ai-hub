import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAdminRole } from "@/modules/admin/use-cases";
import {
  getAgentDefaultPreferences,
  setOrganizationDefaultAgent,
  setUserDefaultAgent,
} from "@/modules/agent/use-cases";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";

const querySchema = z.object({ workspaceId: z.uuid() });
const patchSchema = z.object({
  workspaceId: z.uuid(),
  scope: z.enum(["organization", "user"]),
  defaultAgentId: z.uuid().nullable(),
});

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const { searchParams } = new URL(req.url);
      const parsed = querySchema.safeParse({
        workspaceId: searchParams.get("workspaceId"),
      });
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "agents.list",
      );
      if (forbidden) return forbidden;
      return NextResponse.json(
        await getAgentDefaultPreferences(
          parsed.data.workspaceId,
          session.user.id,
        ),
      );
    },
    { logLabel: "Failed to read agent preferences" },
  );
}

export async function PATCH(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const body = await req.json();
      const parsed = patchSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }
      const { workspaceId, scope, defaultAgentId } = parsed.data;
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        workspaceId,
        scope === "organization" ? "agents.update" : "agents.list",
      );
      if (forbidden) return forbidden;
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
    },
    {
      logLabel: "Failed to update agent preferences",
      expectedError: (error) => {
        if (
          error instanceof Error &&
          ["Agent not found", "Organization assistant not found"].includes(
            error.message,
          )
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
