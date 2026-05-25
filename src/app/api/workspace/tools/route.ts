import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { listAvailableBuiltInTools } from "@/modules/tool/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const querySchema = z.object({ workspaceId: z.uuid() });

export async function GET(req: NextRequest) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { searchParams } = new URL(req.url);
		const parsed = querySchema.safeParse({
			workspaceId: searchParams.get("workspaceId"),
		});
		if (!parsed.success) {
			return NextResponse.json({ error: "Invalid request" }, { status: 400 });
		}

		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"tools.configure",
			"workspace",
			parsed.data.workspaceId,
		);
		if (!permission.granted) {
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		}

		return NextResponse.json(listAvailableBuiltInTools());
	} catch (error) {
		logger.error("Failed to list tools", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
