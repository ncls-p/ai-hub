import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { publishMarketplaceItem } from "@/modules/marketplace/use-cases";

const publishSchema = z.object({
	visibility: z.enum(["public", "private"]).default("public"),
	tags: z.array(z.string()).optional(),
});

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ itemId: string }> },
) {
	try {
		const session = await getSession();
		if (!session)
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
	} catch (error) {
		logger.error("Failed to publish marketplace item", {}, error as Error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{
				status:
					error instanceof Error && error.message.includes("not found")
						? 404
						: error instanceof Error && error.message.includes("Not authorized")
							? 403
							: 500,
			},
		);
	}
}
