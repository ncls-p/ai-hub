import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute } from "@/lib/route-handler";
import {
  featureMarketplaceItem,
  unfeatureMarketplaceItem,
} from "@/modules/marketplace/use-cases";
import { isAdminRole } from "@/modules/admin/use-cases";

const featureSchema = z.object({
  order: z.number().int().min(0).optional(),
});

function handleFeatureError(error: unknown): NextResponse {
  const message =
    error instanceof Error ? error.message : "Internal server error";
  const status =
    error instanceof Error && error.message.includes("not found") ? 404 : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      if (!isAdminRole(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const { itemId } = await params;
      const parsed = featureSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }
      const featured = await featureMarketplaceItem({
        itemId,
        adminUserId: session.user.id,
        ...parsed.data,
      });
      return NextResponse.json(featured);
    },
    {
      logLabel: "Failed to feature marketplace item",
      expectedError: (error) => handleFeatureError(error),
    },
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  return handleRoute(
    _req,
    async ({ session }) => {
      if (!isAdminRole(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const { itemId } = await params;
      const unfeatured = await unfeatureMarketplaceItem({
        itemId,
        adminUserId: session.user.id,
      });
      return NextResponse.json(unfeatured);
    },
    {
      logLabel: "Failed to unfeature marketplace item",
      expectedError: (error) => handleFeatureError(error),
    },
  );
}
