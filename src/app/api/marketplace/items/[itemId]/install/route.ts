import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { installMarketplaceItem } from "@/modules/marketplace/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const schema = z.object({ workspaceId: z.uuid() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
        { status: 400 },
      );
    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "marketplaceItems.install",
      "workspace",
      parsed.data.workspaceId,
    );
    if (!permission.granted)
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    const { itemId } = await params;
    return NextResponse.json(
      await installMarketplaceItem({
        itemId,
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
      }),
      { status: 201 },
    );
  } catch (error) {
    logHandledError("Failed to install marketplace item", {}, error as Error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      {
        status:
          error instanceof Error &&
          (error.message.includes("not found") ||
            error.message.includes("available"))
            ? 404
            : 500,
      },
    );
  }
}
