import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
	removeWorkspaceMember,
	updateWorkspaceMemberRole,
} from "@/modules/workspace/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const querySchema = z.object({
	workspaceId: z.uuid(),
});

const patchSchema = z.object({
	workspaceId: z.uuid(),
	roleName: z.enum(["workspace.member", "workspace.owner", "workspace.admin"]),
});

async function canManageMembers(userId: string, workspaceId: string) {
	const manage = await authorization.hasPermission(
		{ principalType: "user", principalId: userId },
		"members.manage",
		"workspace",
		workspaceId,
	);
	if (manage) return true;
	return authorization.hasPermission(
		{ principalType: "user", principalId: userId },
		"members.remove",
		"workspace",
		workspaceId,
	);
}

export async function PATCH(
	req: NextRequest,
	{ params }: { params: Promise<{ userId: string }> },
) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { userId } = await params;
		const parsed = patchSchema.safeParse(await req.json());
		if (!parsed.success) {
			return NextResponse.json(
				{ error: "Invalid input", details: parsed.error.issues },
				{ status: 400 },
			);
		}

		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"members.manage",
			"workspace",
			parsed.data.workspaceId,
		);
		if (!permission.granted) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}

		await updateWorkspaceMemberRole({
			workspaceId: parsed.data.workspaceId,
			userId,
			roleName: parsed.data.roleName,
			updatedBy: session.user.id,
		});

		return NextResponse.json({ ok: true });
	} catch (error) {
		logger.error("Failed to update workspace member", {}, error as Error);
		const message =
			error instanceof Error ? error.message : "Internal server error";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}

export async function DELETE(
	req: NextRequest,
	{ params }: { params: Promise<{ userId: string }> },
) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { userId } = await params;
		const parsed = querySchema.safeParse({
			workspaceId: req.nextUrl.searchParams.get("workspaceId"),
		});
		if (!parsed.success) {
			return NextResponse.json(
				{ error: "Invalid input", details: parsed.error.issues },
				{ status: 400 },
			);
		}

		if (userId === session.user.id) {
			return NextResponse.json(
				{ error: "You cannot remove yourself from the workspace" },
				{ status: 400 },
			);
		}

		if (!(await canManageMembers(session.user.id, parsed.data.workspaceId))) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}

		await removeWorkspaceMember({
			workspaceId: parsed.data.workspaceId,
			userId,
			removedBy: session.user.id,
		});

		return NextResponse.json({ ok: true });
	} catch (error) {
		logger.error("Failed to remove workspace member", {}, error as Error);
		const message =
			error instanceof Error ? error.message : "Internal server error";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}
