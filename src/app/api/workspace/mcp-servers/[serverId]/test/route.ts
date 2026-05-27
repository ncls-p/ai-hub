import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { testMcpConnection } from "@/modules/mcp/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const querySchema = z.object({ workspaceId: z.uuid() });

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ serverId: string }> },
) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const parsed = querySchema.safeParse({
			workspaceId: new URL(req.url).searchParams.get("workspaceId"),
		});
		if (!parsed.success) {
			return NextResponse.json({ error: "Invalid request" }, { status: 400 });
		}

		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"mcpServers.manage",
			"workspace",
			parsed.data.workspaceId,
		);
		if (!permission.granted) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}

		const { serverId } = await params;
		const result = await testMcpConnection(
			serverId,
			parsed.data.workspaceId,
			session.user.id,
		);
		return NextResponse.json(result);
	} catch (error) {
		logger.error("Failed to test MCP server", {}, error as Error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 400 },
		);
	}
}
