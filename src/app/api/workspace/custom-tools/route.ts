import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute, requireWorkspaceMemberAsync } from "@/lib/route-handler";
import { listCustomTools } from "@/modules/custom-tools/use-cases";

const querySchema = z.object({ workspaceId: z.uuid() });

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = querySchema.safeParse({
        workspaceId: new URL(req.url).searchParams.get("workspaceId"),
      });
      if (!parsed.success)
        return NextResponse.json(
          { error: "workspaceId must be a valid UUID" },
          { status: 400 },
        );

      const forbidden = await requireWorkspaceMemberAsync(
        session.user.id,
        parsed.data.workspaceId,
      );
      if (forbidden) return forbidden;

      return NextResponse.json(
        await listCustomTools(parsed.data.workspaceId, session.user.id),
      );
    },
    { logLabel: "Failed to list custom tools" },
  );
}
