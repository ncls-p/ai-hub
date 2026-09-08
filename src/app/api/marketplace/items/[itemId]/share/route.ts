import { db } from "@/server/infrastructure/db";
import { users } from "@/server/infrastructure/db/schema";
import { eq } from "drizzle-orm";
import { requireMarketplaceItemMutationPermission } from "@/app/api/marketplace/items/marketplace-route-auth";
import { handleRoute } from "@/lib/route-handler";
import {
  shareMarketplaceItem,
  unshareMarketplaceItem,
} from "@/modules/marketplace/use-cases";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const shareSchema = z.union([
  z.strictObject({ targetUserId: z.uuid() }),
  z.strictObject({
    targetEmail: z.string().trim().toLowerCase().pipe(z.email()),
  }),
]);

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
      const forbidden = await requireMarketplaceItemMutationPermission(
        session.user.id,
        itemId,
      );
      if (forbidden) return forbidden;
      const parsed = shareSchema.safeParse(await req.json());
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );

      const targetUserId =
        "targetUserId" in parsed.data
          ? parsed.data.targetUserId
          : (
              await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.email, parsed.data.targetEmail))
                .limit(1)
            )[0]?.id;
      if (!targetUserId)
        return NextResponse.json(
          { error: "Target user not found" },
          { status: 404 },
        );
      const share = await shareMarketplaceItem({
        itemId,
        userId: session.user.id,
        targetUserId,
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
      const forbidden = await requireMarketplaceItemMutationPermission(
        session.user.id,
        itemId,
      );
      if (forbidden) return forbidden;
      const { searchParams } = req.nextUrl;
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
