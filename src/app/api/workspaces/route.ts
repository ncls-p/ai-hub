import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
	ensurePrimaryWorkspaceForUser,
	getWorkspacesByUserId,
} from "@/modules/workspace/use-cases";

export async function GET() {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const workspaces = await getWorkspacesByUserId(session.user.id);
		return NextResponse.json(workspaces);
	} catch (error) {
		logger.error("Failed to list workspaces", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function POST() {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const workspace = await ensurePrimaryWorkspaceForUser({
			userId: session.user.id,
			role: session.user.role,
		});

		return NextResponse.json(workspace);
	} catch (error) {
		logger.error("Failed to resolve primary workspace", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
