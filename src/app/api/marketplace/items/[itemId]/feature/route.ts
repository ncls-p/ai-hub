import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
  featureMarketplaceItem,
  unfeatureMarketplaceItem,
} from "@/modules/marketplace/use-cases";
import { isAdminRole } from "@/modules/admin/use-cases";

const featureSchema = z.object({
  order: z.number().int().min(0).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isAdminRole(session.user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { itemId } = await params;
    const parsed = featureSchema.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
        { status: 400 },
      );

    const featured = await featureMarketplaceItem({
      itemId,
      adminUserId: session.user.id,
      ...parsed.data,
    });
    return NextResponse.json(featured);
  } catch (error) {
    logHandledError("Failed to feature marketplace item", {}, error as Error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      {
        status:
          error instanceof Error && error.message.includes("not found")
            ? 404
            : 500,
      },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isAdminRole(session.user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { itemId } = await params;
    const unfeatured = await unfeatureMarketplaceItem({
      itemId,
      adminUserId: session.user.id,
    });
    return NextResponse.json(unfeatured);
  } catch (error) {
    logHandledError("Failed to unfeature marketplace item", {}, error as Error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      {
        status:
          error instanceof Error && error.message.includes("not found")
            ? 404
            : 500,
      },
    );
  }
}
