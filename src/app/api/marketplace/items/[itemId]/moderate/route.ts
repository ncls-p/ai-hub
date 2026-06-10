import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { adminModerateItem } from "@/modules/marketplace/use-cases";
import { isAdminRole } from "@/modules/admin/use-cases";

const moderateSchema = z.object({
	action: z.enum(["suspend", "unsuspend", "archive", "unarchive"]),
});

export async function PUT(
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
	} catch (error) {
		logger.error("Failed to moderate marketplace item", {}, error as Error);
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
