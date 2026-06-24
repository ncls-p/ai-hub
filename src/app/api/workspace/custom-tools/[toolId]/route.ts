import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { deleteCustomTool } from "@/modules/custom-tools/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const paramsSchema = z.object({ toolId: z.uuid() });
const querySchema = z.object({ workspaceId: z.uuid() });

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsedParams = paramsSchema.safeParse(await params);
    const parsedQuery = querySchema.safeParse({
      workspaceId: new URL(req.url).searchParams.get("workspaceId"),
    });
    if (!parsedParams.success || !parsedQuery.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "tools.configure",
      "workspace",
      parsedQuery.data.workspaceId,
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    return NextResponse.json(
      await deleteCustomTool({
        workspaceId: parsedQuery.data.workspaceId,
        userId: session.user.id,
        customToolId: parsedParams.data.toolId,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete custom tool";
    logHandledError(
      "Failed to delete custom tool",
      { message },
      error as Error,
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
