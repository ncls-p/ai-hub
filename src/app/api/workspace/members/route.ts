import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
	addWorkspaceMember,
	findUserByEmail,
	listWorkspaceMembers,
} from "@/modules/workspace/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const querySchema = z.object({
	workspaceId: z.uuid(),
});

const addMemberSchema = z.object({
	workspaceId: z.uuid(),
	email: z.email(),
	roleName: z.enum(["workspace.member", "workspace.owner"]).optional(),
});

export async function GET(req: NextRequest) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const parsed = querySchema.safeParse({
			workspaceId: req.nextUrl.searchParams.get("workspaceId"),
		});
		if (!parsed.success) {
			return NextResponse.json(
				{ error: "Invalid input", details: parsed.error.issues },
				{ status: 400 },
			);
		}

		const isMember = await authorization.requireWorkspaceMember(
			session.user.id,
			parsed.data.workspaceId,
		);
		if (!isMember) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}

		const members = await listWorkspaceMembers(parsed.data.workspaceId);
		return NextResponse.json({ members });
	} catch (error) {
		logger.error("Failed to list workspace members", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function POST(req: NextRequest) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const parsed = addMemberSchema.safeParse(await req.json());
		if (!parsed.success) {
			return NextResponse.json(
				{ error: "Invalid input", details: parsed.error.issues },
				{ status: 400 },
			);
		}

		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"members.invite",
			"workspace",
			parsed.data.workspaceId,
		);
		if (!permission.granted) {
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		}

		const user = await findUserByEmail(parsed.data.email);
		if (!user) {
			return NextResponse.json(
				{ error: "No account found with this email. Create the user first." },
				{ status: 404 },
			);
		}

		await addWorkspaceMember({
			workspaceId: parsed.data.workspaceId,
			userId: user.id,
			roleName: parsed.data.roleName,
			invitedBy: session.user.id,
		});

		return NextResponse.json({ member: user }, { status: 201 });
	} catch (error) {
		logger.error("Failed to add workspace member", {}, error as Error);
		const message =
			error instanceof Error ? error.message : "Internal server error";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}
