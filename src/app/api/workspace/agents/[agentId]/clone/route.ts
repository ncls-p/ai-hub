import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { isAdminRole } from "@/modules/admin/use-cases";
import { cloneAgent } from "@/modules/agent/use-cases";
import { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";

const routeParamsSchema = z.object({ agentId: z.uuid() });
const cloneAgentSchema = z.object({
	workspaceId: z.uuid(),
	name: z.string().trim().min(1).max(255).optional(),
	slug: z
		.string()
		.trim()
		.min(1)
		.max(128)
		.regex(/^[a-z0-9-]+$/)
		.optional(),
});

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ agentId: string }> },
) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const parsedParams = routeParamsSchema.safeParse(await params);
		const parsedBody = cloneAgentSchema.safeParse(await req.json());
		if (!parsedParams.success || !parsedBody.success) {
			return NextResponse.json({ error: "Invalid request" }, { status: 400 });
		}

		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"agents.create",
			"workspace",
			parsedBody.data.workspaceId,
		);
		if (!permission.granted) {
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		}

		const result = await cloneAgent({
			agentId: parsedParams.data.agentId,
			workspaceId: parsedBody.data.workspaceId,
			userId: session.user.id,
			canAdminCurate: isAdminRole(session.user.role),
			name: parsedBody.data.name,
			slug: parsedBody.data.slug,
		});

		return NextResponse.json(result, { status: 201 });
	} catch (error) {
		if ((error as Error).message === "Agent not found") {
			return NextResponse.json({ error: "Agent not found" }, { status: 404 });
		}
		logger.error("Failed to clone agent", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
