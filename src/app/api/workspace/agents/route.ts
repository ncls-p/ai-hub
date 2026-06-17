import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/modules/auth/session";
import {
	canEditAgent,
	createAgent,
	listAgents,
} from "@/modules/agent/use-cases";
import { isAdminRole } from "@/modules/admin/use-cases";
import { db } from "@/server/infrastructure/db";
import { workspaces } from "@/server/infrastructure/db/schema";
import { authorization } from "@/server/domain/services/authorization";
import { eq } from "drizzle-orm";
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
	systemPrompt: z.string().max(64_000).optional(),
	providerId: z.uuid().optional(),
	modelId: z.uuid().optional(),
	temperature: z.string().optional(),
	topP: z.string().optional(),
	maxOutputTokens: z.number().int().positive().optional(),
	maxToolCalls: z.number().int().min(0).max(20).optional(),
	sharingMode: z
		.enum(["personal", "marketplace", "specific_user"])
		.default("personal"),
	shareTargetEmail: z.email().optional(),
	isGlobal: z.boolean().optional(),
	isRecommended: z.boolean().optional(),
	curationLabel: z
		.enum(["none", "recommended", "organization_created"])
		.optional(),
	toolBindings: z
		.array(
			z.object({
				toolSource: z.literal("builtin").default("builtin"),
				toolId: z.uuid(),
				requireApproval: z.boolean().optional(),
			}),
		)
		.optional(),
	knowledgeBindings: z.array(z.uuid()).optional(),
	skillBindings: z.array(z.uuid()).optional(),
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

		const { workspaceId, ...input } = parsed.data;

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

		const result = await createAgent({
			workspaceId,
			userId: session.user.id,
			canAdminCurate: isAdminRole(session.user.role),
			...input,
		});

		return NextResponse.json(result, { status: 201 });
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			return NextResponse.json(
				{ error: "Agent slug already exists in this workspace" },
				{ status: 409 },
			);
		}
		if (
			error instanceof Error &&
			[
				"Provider not found",
				"Model not found",
				"Model requires a provider",
				"Tool not found",
				"Share target user not found",
				"Share target user is required",
			].includes(error.message)
		) {
			return NextResponse.json({ error: error.message }, { status: 400 });
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

		const canAdminCurate = isAdminRole(session.user.role);
		const createPermission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"agents.create",
			"workspace",
			workspaceId,
		);
		const list = await listAgents(workspaceId, session.user.id, canAdminCurate);
		const agentsWithAccess = list.map((agent) => ({
			...agent,
			canEdit: canEditAgent(agent, session.user.id, canAdminCurate),
			canClone: createPermission.granted,
		}));

		return NextResponse.json({
			agents: agentsWithAccess,
			canAdminCurate,
		});
	} catch (error) {
		logger.error("Failed to list agents", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
