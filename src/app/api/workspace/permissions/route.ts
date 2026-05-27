import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";

const querySchema = z.object({
	workspaceId: z.uuid(),
});

export async function GET(req: NextRequest) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const parsed = querySchema.safeParse({
			workspaceId: req.nextUrl.searchParams.get("workspaceId"),
		});
		if (!parsed.success) {
			return NextResponse.json(
				{ error: "Invalid input", details: parsed.error.issues },
				{ status: 400 },
			);
		}

		const { workspaceId } = parsed.data;
		const isMember = await authorization.requireWorkspaceMember(
			session.user.id,
			workspaceId,
		);
		if (!isMember) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}

		const ctx = {
			principalType: "user" as const,
			principalId: session.user.id,
		};

		const [canViewUsage, canViewAudit, canInviteMembers] = await Promise.all([
			authorization.hasPermission(ctx, "usage.view", "workspace", workspaceId),
			authorization.hasPermission(ctx, "audit.view", "workspace", workspaceId),
			authorization.hasPermission(
				ctx,
				"members.invite",
				"workspace",
				workspaceId,
			),
		]);

		return NextResponse.json({
			canViewUsage,
			canViewAudit,
			canInviteMembers,
		});
	} catch (error) {
		logger.error("Failed to read workspace permissions", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
