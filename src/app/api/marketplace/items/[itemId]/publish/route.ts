import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute } from "@/lib/route-handler";
import { publishMarketplaceItem } from "@/modules/marketplace/use-cases";

const publishSchema = z.object({
  visibility: z.enum(["public", "private"]).default("public"),
  tags: z.array(z.string()).optional(),
});

function handleMarketplaceError(error: unknown): NextResponse {
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
      const parsed = publishSchema.safeParse(await req.json());
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );

      const published = await publishMarketplaceItem(
        itemId,
        session.user.id,
        parsed.data,
      );
      return NextResponse.json(published);
    },
    {
      logLabel: "Failed to publish marketplace item",
      expectedError: handleMarketplaceError,
    },
  );
}
