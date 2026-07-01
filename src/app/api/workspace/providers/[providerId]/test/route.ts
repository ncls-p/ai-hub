import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { testProviderConnection } from "@/modules/provider/use-cases";

const paramsSchema = z.object({ providerId: z.uuid() });
const bodySchema = z.object({ workspaceId: z.uuid() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsedBody = bodySchema.safeParse(await req.json());
      if (!parsedParams.success || !parsedBody.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const { providerId } = parsedParams.data;
      const { workspaceId } = parsedBody.data;
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        workspaceId,
        "providers.test",
      );
      if (forbidden) return forbidden;
      const health = await testProviderConnection(providerId, workspaceId);
      return NextResponse.json(health);
    },
    {
      logLabel: "Failed to test provider",
      expectedError: (error) => {
        if (error instanceof Error && error.message === "Provider not found") {
          return NextResponse.json(
            { error: "Provider not found" },
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
