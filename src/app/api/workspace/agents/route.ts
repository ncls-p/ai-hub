import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/modules/auth/session";
import { db } from "@/server/infrastructure/db";
import { agents, workspaces } from "@/server/infrastructure/db/schema";
import { authorization } from "@/server/domain/services/authorization";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { logger } from "@/lib/logger";

const slugSchema = z
	.string()
	.min(1)
	.max(128)
	.regex(/^[a-z0-9-]+$/);

const createAgentSchema = z.object({
	name: z.string().min(1).max(255),
	slug: slugSchema,
	description: z.string().max(2048).optional(),
	workspaceId: z.uuid(),
});

const listAgentsSchema = z.object({
	workspaceId: z.uuid(),
});

function isUniqueConstraintError(error: unknown) {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "23505"
	);
}

export async function POST(req: NextRequest) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = await req.json();
		const parsed = createAgentSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json(
				{ error: "Invalid input", details: parsed.error.issues },
				{ status: 400 },
			);
		}

		const { name, slug, description, workspaceId } = parsed.data;

		// Verify workspace membership
		const [workspace] = await db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, workspaceId))
			.limit(1);

		if (!workspace) {
			return NextResponse.json(
				{ error: "Workspace not found" },
				{ status: 404 },
			);
		}

		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"agents.create",
			"workspace",
			workspaceId,
		);

		if (!permission.granted) {
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		}

		const [agent] = await db
			.insert(agents)
			.values({
				workspaceId,
				name,
				slug,
				description: description || null,
				createdById: session.user.id,
				visibility: "private",
				sourceType: "custom",
			})
			.returning();

		return NextResponse.json(agent, { status: 201 });
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			return NextResponse.json(
				{ error: "Agent slug already exists in this workspace" },
				{ status: 409 },
			);
		}

		logger.error("Failed to create agent", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function GET(req: NextRequest) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { searchParams } = new URL(req.url);
		const parsed = listAgentsSchema.safeParse({
			workspaceId: searchParams.get("workspaceId"),
		});

		if (!parsed.success) {
			return NextResponse.json(
				{ error: "workspaceId must be a valid UUID" },
				{ status: 400 },
			);
		}

		const { workspaceId } = parsed.data;

		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"agents.list",
			"workspace",
			workspaceId,
		);

		if (!permission.granted) {
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		}

		const list = await db
			.select()
			.from(agents)
			.where(
				and(eq(agents.workspaceId, workspaceId), isNull(agents.archivedAt)),
			)
			.orderBy(agents.createdAt);

		return NextResponse.json(list);
	} catch (error) {
		logger.error("Failed to list agents", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
