import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { updateMcpTool } from "@/modules/mcp/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const updateSchema = z.object({
	workspaceId: z.uuid(),
	enabled: z.boolean().optional(),
});

export async function PATCH(
	req: NextRequest,
	{ params }: { params: Promise<{ serverId: string; toolId: string }> },
) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const parsed = updateSchema.safeParse(await req.json());
		if (!parsed.success) {
			return NextResponse.json(
				{ error: "Invalid input", details: parsed.error.issues },
				{ status: 400 },
			);
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

		const { serverId, toolId } = await params;
		const tool = await updateMcpTool({
			toolId,
			serverId,
			workspaceId: parsed.data.workspaceId,
			userId: session.user.id,
			enabled: parsed.data.enabled,
		});
		return NextResponse.json(tool);
	} catch (error) {
		logger.error("Failed to update MCP tool", {}, error as Error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 400 },
		);
	}
}
