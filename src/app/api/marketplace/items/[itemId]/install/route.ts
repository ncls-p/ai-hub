import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { installMarketplaceItem } from "@/modules/marketplace/use-cases";

const schema = z.object({ workspaceId: z.uuid() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = schema.safeParse(await req.json());
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "marketplaceItems.install",
      );
      if (forbidden) return forbidden;
      const { itemId } = await params;
      return NextResponse.json(
        await installMarketplaceItem({
          itemId,
          workspaceId: parsed.data.workspaceId,
          userId: session.user.id,
        }),
        { status: 201 },
      );
    },
    {
      logLabel: "Failed to install marketplace item",
      expectedError: (error) => {
        const message =
          error instanceof Error ? error.message : "Internal server error";
        const isNotFound =
          error instanceof Error &&
          (error.message.includes("not found") ||
            error.message.includes("available"));
        return NextResponse.json(
          { error: message },
          { status: isNotFound ? 404 : 500 },
        );
      },
    },
  );
}
