import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/modules/auth/session";
import {
	createWorkspace,
	getWorkspacesByUserId,
} from "@/modules/workspace/use-cases";
import { logger } from "@/lib/logger";

const slugSchema = z
	.string()
	.min(1)
	.max(128)
	.regex(/^[a-z0-9-]+$/);

const createWorkspaceSchema = z.object({
	organizationName: z.string().min(1).max(255),
	organizationSlug: slugSchema,
	workspaceName: z.string().min(1).max(255),
	workspaceSlug: slugSchema,
});

function isUniqueConstraintError(error: unknown) {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "23505"
	);
}

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

export async function POST(req: NextRequest) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = await req.json();
		const parsed = createWorkspaceSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json(
				{ error: "Invalid input", details: parsed.error.issues },
				{ status: 400 },
			);
		}

		const workspace = await createWorkspace({
			userId: session.user.id,
			...parsed.data,
		});

		return NextResponse.json(workspace, { status: 201 });
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			return NextResponse.json(
				{ error: "Organization or workspace slug already exists" },
				{ status: 409 },
			);
		}

		logger.error("Failed to create workspace", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
