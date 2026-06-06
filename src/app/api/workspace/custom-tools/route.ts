import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { listCustomTools } from "@/modules/custom-tools/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const querySchema = z.object({ workspaceId: z.uuid() });

export async function GET(req: NextRequest) {
	try {
		const session = await getSession();
		if (!session)
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		const parsed = querySchema.safeParse({
			workspaceId: new URL(req.url).searchParams.get("workspaceId"),
		});
		if (!parsed.success)
			return NextResponse.json(
				{ error: "workspaceId must be a valid UUID" },
				{ status: 400 },
			);

		const isMember = await authorization.requireWorkspaceMember(
			session.user.id,
			parsed.data.workspaceId,
		);
		if (!isMember) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}

		return NextResponse.json(
			await listCustomTools(parsed.data.workspaceId, session.user.id),
		);
	} catch (error) {
		logger.error("Failed to list custom tools", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
