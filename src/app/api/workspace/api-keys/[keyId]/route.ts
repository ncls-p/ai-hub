import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { revokeWorkspaceApiKey } from "@/modules/api-keys/use-cases";

const querySchema = z.object({ workspaceId: z.uuid() });

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ keyId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const { keyId } = await params;
      const parsed = querySchema.safeParse({
        workspaceId: req.nextUrl.searchParams.get("workspaceId"),
      });
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid input" }, { status: 400 });
      }

      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "apiKeys.manage",
      );
      if (forbidden) return forbidden;

      await revokeWorkspaceApiKey({
        keyId,
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
      });

      return NextResponse.json({ ok: true });
    },
    {
      logLabel: "Failed to revoke API key",
      expectedError: (error) => {
        const message =
          error instanceof Error ? error.message : "Internal server error";
        return NextResponse.json({ error: message }, { status: 400 });
      },
    },
  );
}
