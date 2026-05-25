import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { getAgentById, getActiveVersion } from "@/modules/agent/use-cases";
import { getToolBindingsForVersion } from "@/modules/tool/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const routeParamsSchema = z.object({ agentId: z.uuid() });
const querySchema = z.object({
	workspaceId: z.uuid(),
	versionId: z.uuid().optional(),
});

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ agentId: string }> },
) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const parsedParams = routeParamsSchema.safeParse(await params);
		const { searchParams } = new URL(req.url);
		const parsedQuery = querySchema.safeParse({
			workspaceId: searchParams.get("workspaceId"),
			versionId: searchParams.get("versionId") ?? undefined,
		});
		if (!parsedParams.success || !parsedQuery.success) {
			return NextResponse.json({ error: "Invalid request" }, { status: 400 });
		}

		const { agentId } = parsedParams.data;
		const { workspaceId, versionId } = parsedQuery.data;
		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"agents.get",
			"workspace",
			workspaceId,
		);
		if (!permission.granted) {
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		}

		const agent = await getAgentById(agentId, workspaceId);
		if (!agent) {
			return NextResponse.json({ error: "Agent not found" }, { status: 404 });
		}

		const activeVersion = versionId ? null : await getActiveVersion(agentId);
		const targetVersionId = versionId ?? activeVersion?.id;
		if (!targetVersionId) {
			return NextResponse.json([]);
		}

		const bindings = await getToolBindingsForVersion(targetVersionId);
		return NextResponse.json(bindings);
	} catch (error) {
		logger.error("Failed to list agent tools", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
