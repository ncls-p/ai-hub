import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute } from "@/lib/route-handler";
import {
  shareMarketplaceItem,
  unshareMarketplaceItem,
} from "@/modules/marketplace/use-cases";

const shareSchema = z.object({ targetUserId: z.uuid() });

function marketplaceErrorHandler(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Internal server error";
  let status = 500;
  if (error instanceof Error) {
    if (error.message.includes("not found")) status = 404;
    else if (error.message.includes("Not authorized")) status = 403;
  }
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const { itemId } = await params;
      const parsed = shareSchema.safeParse(await req.json());
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );

      const share = await shareMarketplaceItem({
        itemId,
        userId: session.user.id,
        targetUserId: parsed.data.targetUserId,
      });
      return NextResponse.json(share);
    },
    {
      logLabel: "Failed to share marketplace item",
      expectedError: (error) => marketplaceErrorHandler(error),
    },
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const { itemId } = await params;
      const { searchParams } = new URL(req.url);
      const targetUserId = searchParams.get("targetUserId");
      if (!targetUserId)
        return NextResponse.json(
          { error: "targetUserId query param required" },
          { status: 400 },
        );

      await unshareMarketplaceItem({
        itemId,
        userId: session.user.id,
        targetUserId,
      });
      return NextResponse.json({ success: true });
    },
    {
      logLabel: "Failed to unshare marketplace item",
      expectedError: (error) => marketplaceErrorHandler(error),
    },
  );
}
