import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
	deleteScheduledTask,
	updateScheduledTask,
} from "@/modules/scheduled-tasks/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const paramsSchema = z.object({ taskId: z.uuid() });
const workspaceQuerySchema = z.object({ workspaceId: z.uuid() });
const updateSchema = z.object({
	workspaceId: z.uuid(),
	agentId: z.uuid().optional(),
	conversationId: z.uuid().nullable().optional(),
	title: z.string().trim().min(1).max(255).optional(),
	prompt: z.string().trim().min(1).max(8_000).optional(),
	frequency: z.enum(["daily", "interval"]).optional(),
	timezone: z.string().trim().min(1).max(64).optional(),
	timeOfDay: z
		.string()
		.regex(/^\d{2}:\d{2}$/)
		.nullable()
		.optional(),
	intervalMinutes: z.number().int().min(5).max(43_200).nullable().optional(),
	enabled: z.boolean().optional(),
});

async function requireChatPermission(userId: string, workspaceId: string) {
	const isMember = await authorization.requireWorkspaceMember(
		userId,
		workspaceId,
	);
	if (!isMember) return false;
	return authorization.hasPermission(
		{ principalType: "user", principalId: userId },
		"agents.chat",
		"workspace",
		workspaceId,
	);
}

export async function PATCH(
	req: NextRequest,
	{ params }: { params: Promise<{ taskId: string }> },
) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const parsedParams = paramsSchema.safeParse(await params);
		const parsed = updateSchema.safeParse(await req.json());
		if (!parsedParams.success || !parsed.success) {
			return NextResponse.json({ error: "Invalid input" }, { status: 400 });
		}

		const allowed = await requireChatPermission(
			session.user.id,
			parsed.data.workspaceId,
		);
		if (!allowed) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}

		const task = await updateScheduledTask(
			parsedParams.data.taskId,
			parsed.data.workspaceId,
			session.user.id,
			parsed.data,
		);
		return NextResponse.json({ task });
	} catch (error) {
		logger.error("Failed to update scheduled task", {}, error as Error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 400 },
		);
	}
}

export async function DELETE(
	req: NextRequest,
	{ params }: { params: Promise<{ taskId: string }> },
) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const parsedParams = paramsSchema.safeParse(await params);
		const parsedQuery = workspaceQuerySchema.safeParse({
			workspaceId: req.nextUrl.searchParams.get("workspaceId"),
		});
		if (!parsedParams.success || !parsedQuery.success) {
			return NextResponse.json({ error: "Invalid input" }, { status: 400 });
		}

		const allowed = await requireChatPermission(
			session.user.id,
			parsedQuery.data.workspaceId,
		);
		if (!allowed) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}

		await deleteScheduledTask(
			parsedParams.data.taskId,
			parsedQuery.data.workspaceId,
			session.user.id,
		);
		return NextResponse.json({ ok: true });
	} catch (error) {
		logger.error("Failed to delete scheduled task", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
