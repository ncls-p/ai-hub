import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute } from "@/lib/route-handler";
import { adminModerateItem } from "@/modules/marketplace/use-cases";
import { isAdminRole } from "@/modules/admin/use-cases";

const moderateSchema = z.object({
  action: z.enum(["suspend", "unsuspend", "archive", "unarchive"]),
});

function handleMarketplaceError(error: unknown): NextResponse {
  const message =
    error instanceof Error ? error.message : "Internal server error";
  const status =
    error instanceof Error && error.message.includes("not found") ? 404 : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function PUT(
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
      const parsed = moderateSchema.safeParse(await req.json());
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );

      const updated = await adminModerateItem({
        itemId,
        adminUserId: session.user.id,
        action: parsed.data.action,
      });
      return NextResponse.json(updated);
    },
    {
      logLabel: "Failed to moderate marketplace item",
      expectedError: handleMarketplaceError,
    },
  );
}
