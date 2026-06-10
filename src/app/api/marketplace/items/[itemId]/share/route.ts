import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
	shareMarketplaceItem,
	unshareMarketplaceItem,
} from "@/modules/marketplace/use-cases";

const shareSchema = z.object({
	targetUserId: z.uuid(),
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
	} catch (error) {
		logger.error("Failed to share marketplace item", {}, error as Error);
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

export async function DELETE(
	req: NextRequest,
	{ params }: { params: Promise<{ itemId: string }> },
) {
	try {
		const session = await getSession();
		if (!session)
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
	} catch (error) {
		logger.error("Failed to unshare marketplace item", {}, error as Error);
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
