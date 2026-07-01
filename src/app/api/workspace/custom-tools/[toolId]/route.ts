import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { deleteCustomTool } from "@/modules/custom-tools/use-cases";

const paramsSchema = z.object({ toolId: z.uuid() });
const querySchema = z.object({ workspaceId: z.uuid() });

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ toolId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsedQuery = querySchema.safeParse({
        workspaceId: new URL(req.url).searchParams.get("workspaceId"),
      });
      if (!parsedParams.success || !parsedQuery.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsedQuery.data.workspaceId,
        "tools.configure",
      );
      if (forbidden) return forbidden;
      return NextResponse.json(
        await deleteCustomTool({
          workspaceId: parsedQuery.data.workspaceId,
          userId: session.user.id,
          customToolId: parsedParams.data.toolId,
        }),
      );
    },
    {
      logLabel: "Failed to delete custom tool",
      expectedError: (error) => {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to delete custom tool";
        return NextResponse.json({ error: message }, { status: 500 });
      },
    },
  );
}
