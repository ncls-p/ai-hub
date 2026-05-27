import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { agents, conversations } from "@/server/infrastructure/db/schema";

const querySchema = z.object({
	workspaceId: z.uuid().optional(),
	agentId: z.uuid().optional(),
});

export async function GET(req: Request) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { searchParams } = new URL(req.url);
		const parsed = querySchema.safeParse({
			agentId: searchParams.get("agentId") ?? undefined,
			workspaceId: searchParams.get("workspaceId") ?? undefined,
		});

		if (
			!parsed.success ||
			(!parsed.data.workspaceId && !parsed.data.agentId)
		) {
			return NextResponse.json(
				{ error: "workspaceId or agentId must be a valid UUID" },
				{ status: 400 },
			);
		}

		const { agentId } = parsed.data;
		let workspaceId = parsed.data.workspaceId ?? null;

		if (!workspaceId && agentId) {
			const [agent] = await db
				.select({ workspaceId: agents.workspaceId })
				.from(agents)
				.where(and(eq(agents.id, agentId), isNull(agents.archivedAt)))
				.limit(1);

			if (!agent) {
				return NextResponse.json({ error: "Agent not found" }, { status: 404 });
			}
			workspaceId = agent.workspaceId;
		}
		if (!workspaceId) {
			return NextResponse.json(
				{ error: "workspaceId or agentId must be a valid UUID" },
				{ status: 400 },
			);
		}

		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"conversations.viewOwn",
			"workspace",
			workspaceId,
		);
		if (!permission.granted) {
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		}

		const conditions = [
			eq(conversations.workspaceId, workspaceId),
			eq(conversations.userId, session.user.id),
			eq(conversations.status, "active"),
			isNull(conversations.archivedAt),
		];
		if (agentId) {
			conditions.push(eq(conversations.agentId, agentId));
		}

		const list = await db
			.select({
				id: conversations.id,
				title: conversations.title,
				agentId: conversations.agentId,
				agentVersionId: conversations.agentVersionId,
				createdAt: conversations.createdAt,
				updatedAt: conversations.updatedAt,
			})
			.from(conversations)
			.where(and(...conditions))
			.orderBy(desc(conversations.updatedAt));

		return NextResponse.json(list);
	} catch (error) {
		logger.error("Failed to list conversations", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
