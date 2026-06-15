import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { requireAdminApiSession } from "@/modules/admin/auth";
import { updateManagedUser } from "@/modules/admin/use-cases";
import { ensurePrimaryWorkspaceForUser } from "@/modules/workspace/use-cases";

const paramsSchema = z.object({ userId: z.uuid() });
const updateUserSchema = z.object({
	role: z.enum(["user", "admin"]).optional(),
	banned: z.boolean().optional(),
	banReason: z.string().max(500).optional(),
});

export async function PATCH(
	req: NextRequest,
	{ params }: { params: Promise<{ userId: string }> },
) {
	try {
		const auth = await requireAdminApiSession();
		if (!auth.ok) return auth.response;

		const parsedParams = paramsSchema.safeParse(await params);
		const parsedBody = updateUserSchema.safeParse(await req.json());
		if (!parsedParams.success || !parsedBody.success) {
			return NextResponse.json(
				{
					error: "Invalid input",
					details: parsedBody.success ? undefined : parsedBody.error.issues,
				},
				{ status: 400 },
			);
		}

		const user = await updateManagedUser({
			actorUserId: auth.session.user.id,
			userId: parsedParams.data.userId,
			...parsedBody.data,
		});

		if (parsedBody.data.role) {
			await ensurePrimaryWorkspaceForUser({
				userId: user.id,
				role: user.role,
				invitedBy: auth.session.user.id,
			});
		}

		return NextResponse.json({ user });
	} catch (error) {
		logger.error("Failed to update user", {}, error as Error);
		const message =
			error instanceof Error ? error.message : "Internal server error";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}
