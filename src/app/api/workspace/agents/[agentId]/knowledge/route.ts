import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/modules/auth/session";
import {
	getActiveVersion,
	getVisibleAgentById,
	updateAgent,
} from "@/modules/agent/use-cases";
import { isAdminRole } from "@/modules/admin/use-cases";
import { getKnowledgeBindingsForVersion } from "@/modules/knowledge/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { logger } from "@/lib/logger";

const routeParamsSchema = z.object({ agentId: z.uuid() });
const workspaceQuerySchema = z.object({ workspaceId: z.uuid() });
const putSchema = z.object({
	workspaceId: z.uuid(),
	knowledgeBaseIds: z.array(z.uuid()),
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
		const parsedQuery = workspaceQuerySchema.safeParse({
			workspaceId: searchParams.get("workspaceId"),
		});

		if (!parsedParams.success || !parsedQuery.success) {
			return NextResponse.json({ error: "Invalid request" }, { status: 400 });
		}

		const { agentId } = parsedParams.data;
		const { workspaceId } = parsedQuery.data;

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

		const agent = await getVisibleAgentById(
			agentId,
			workspaceId,
			session.user.id,
			isAdminRole(session.user.role),
		);
		if (!agent) {
			return NextResponse.json({ error: "Agent not found" }, { status: 404 });
		}

		const version = await getActiveVersion(agentId);
		if (!version) {
			return NextResponse.json({ bindings: [] });
		}

		const bindings = await getKnowledgeBindingsForVersion(version.id);
		return NextResponse.json({ bindings });
	} catch (error) {
		logger.error("Failed to get knowledge bindings", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function PUT(
	req: NextRequest,
	{ params }: { params: Promise<{ agentId: string }> },
) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const parsedParams = routeParamsSchema.safeParse(await params);
		const body = await req.json();
		const parsedBody = putSchema.safeParse(body);

		if (!parsedParams.success || !parsedBody.success) {
			return NextResponse.json({ error: "Invalid input" }, { status: 400 });
		}

		const { agentId } = parsedParams.data;
		const { workspaceId, knowledgeBaseIds } = parsedBody.data;

		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"agents.update",
			"workspace",
			workspaceId,
		);
		if (!permission.granted) {
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		}

		const { version } = await updateAgent({
			agentId,
			workspaceId,
			userId: session.user.id,
			canAdminCurate: isAdminRole(session.user.role),
			knowledgeBindings: knowledgeBaseIds,
		});
		const bindings = await getKnowledgeBindingsForVersion(version.id);
		return NextResponse.json({ version, bindings });
	} catch (error) {
		if ((error as Error).message === "Agent not found") {
			return NextResponse.json({ error: "Agent not found" }, { status: 404 });
		}
		if ((error as Error).message === "Knowledge base not found") {
			return NextResponse.json(
				{ error: "Knowledge base not found" },
				{ status: 400 },
			);
		}
		if (
			(error as Error).message ===
			"Only the creator or an admin can update this agent"
		) {
			return NextResponse.json(
				{ error: (error as Error).message },
				{ status: 403 },
			);
		}
		logger.error("Failed to update knowledge bindings", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
