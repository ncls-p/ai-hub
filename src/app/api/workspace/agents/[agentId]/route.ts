import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getSession } from "@/modules/auth/session";
import { db } from "@/server/infrastructure/db";
import { users } from "@/server/infrastructure/db/schema";
import {
	getVisibleAgentById,
	updateAgent,
	archiveAgent,
} from "@/modules/agent/use-cases";
import { isAdminRole } from "@/modules/admin/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { logger } from "@/lib/logger";
import { toolBindingInputSchema } from "@/modules/tool/use-cases";

const routeParamsSchema = z.object({ agentId: z.uuid() });
const workspaceQuerySchema = z.object({ workspaceId: z.uuid() });

const slugSchema = z
	.string()
	.min(1)
	.max(128)
	.regex(/^[a-z0-9-]+$/);

const updateAgentSchema = z.object({
	workspaceId: z.uuid(),
	name: z.string().min(1).max(255).optional(),
	slug: slugSchema.optional(),
	description: z.string().max(2048).optional().or(z.literal("")),
	systemPrompt: z.string().max(64_000).optional().or(z.literal("")),
	providerId: z.uuid().optional(),
	modelId: z.uuid().optional(),
	temperature: z.string().optional(),
	topP: z.string().optional(),
	maxOutputTokens: z.number().int().positive().optional(),
	maxToolCalls: z.number().int().min(0).max(20).optional(),
	sharingMode: z.enum(["personal", "marketplace", "specific_user"]).optional(),
	shareTargetEmail: z.email().optional().or(z.literal("")),
	isGlobal: z.boolean().optional(),
	isRecommended: z.boolean().optional(),
	curationLabel: z
		.enum(["none", "recommended", "organization_created"])
		.optional(),
	toolBindings: z.array(toolBindingInputSchema).optional(),
	knowledgeBindings: z.array(z.uuid()).optional(),
	toolChoice: z.enum(["auto", "required", "none"]).optional(),
	generationSettings: z
		.object({
			topK: z.number().int().positive().optional(),
			presencePenalty: z.number().min(-1).max(1).optional(),
			frequencyPenalty: z.number().min(-1).max(1).optional(),
			seed: z.number().int().optional(),
			maxRetries: z.number().int().min(0).optional(),
			stopSequences: z.array(z.string()).optional(),
		})
		.optional(),
	responseFormat: z.enum(["text", "json_object"]).optional(),
	memoryPolicy: z
		.object({
			enabled: z.boolean().optional(),
			maxMessages: z.number().int().positive().optional(),
		})
		.optional(),
	guardrails: z
		.object({
			enabled: z.boolean().optional(),
			blockedTopics: z.array(z.string()).optional(),
		})
		.optional(),
	approvalPolicy: z
		.object({
			requireApprovalForAllTools: z.boolean().optional(),
		})
		.optional(),
});

function isUniqueConstraintError(error: unknown) {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "23505"
	);
}

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ agentId: string }> },
) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const parsedParams = routeParamsSchema.safeParse(await params);
		const { searchParams } = new URL(req.url);
		const parsedQuery = workspaceQuerySchema.safeParse({
			workspaceId: searchParams.get("workspaceId"),
		});

		if (!parsedParams.success || !parsedQuery.success) {
			return NextResponse.json({ error: "Invalid request" }, { status: 400 });
		}

		const { agentId } = parsedParams.data;
		const { workspaceId } = parsedQuery.data;

		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"agents.get",
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
		const agent = await getVisibleAgentById(
			agentId,
			workspaceId,
			session.user.id,
			canAdminCurate,
		);
		if (!agent) {
			return NextResponse.json({ error: "Agent not found" }, { status: 404 });
		}

		let shareTargetEmail: string | null = null;
		if (agent.shareTargetUserId) {
			const [target] = await db
				.select({ email: users.email })
				.from(users)
				.where(eq(users.id, agent.shareTargetUserId))
				.limit(1);
			shareTargetEmail = target?.email ?? null;
		}

		return NextResponse.json({ ...agent, canAdminCurate, shareTargetEmail });
	} catch (error) {
		logger.error("Failed to get agent", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function PATCH(
	req: NextRequest,
	{ params }: { params: Promise<{ agentId: string }> },
) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const parsedParams = routeParamsSchema.safeParse(await params);
		const body = await req.json();
		const parsedBody = updateAgentSchema.safeParse(body);

		if (!parsedParams.success || !parsedBody.success) {
			return NextResponse.json(
				{
					error: "Invalid input",
					details: parsedBody.success ? undefined : parsedBody.error.issues,
				},
				{ status: 400 },
			);
		}

		const { agentId } = parsedParams.data;
		const { workspaceId, ...input } = parsedBody.data;
		const canAdminCurate = isAdminRole(session.user.role);

		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"agents.update",
			"workspace",
			workspaceId,
		);

		if (!permission.granted) {
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		}

		const { agent, version } = await updateAgent({
			agentId,
			workspaceId,
			userId: session.user.id,
			canAdminCurate,
			...input,
			shareTargetEmail: input.shareTargetEmail || undefined,
		});

		return NextResponse.json({ agent, version });
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			return NextResponse.json(
				{ error: "Agent slug already exists in this workspace" },
				{ status: 409 },
			);
		}
		if ((error as Error).message === "Agent not found") {
			return NextResponse.json({ error: "Agent not found" }, { status: 404 });
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
				"Only the creator or an admin can update this agent",
			].includes(error.message)
		) {
			return NextResponse.json({ error: error.message }, { status: 400 });
		}

		logger.error("Failed to update agent", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function DELETE(
	req: NextRequest,
	{ params }: { params: Promise<{ agentId: string }> },
) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const parsedParams = routeParamsSchema.safeParse(await params);
		const { searchParams } = new URL(req.url);
		const parsedQuery = workspaceQuerySchema.safeParse({
			workspaceId: searchParams.get("workspaceId"),
		});

		if (!parsedParams.success || !parsedQuery.success) {
			return NextResponse.json({ error: "Invalid request" }, { status: 400 });
		}

		const { agentId } = parsedParams.data;
		const { workspaceId } = parsedQuery.data;

		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"agents.delete",
			"workspace",
			workspaceId,
		);

		if (!permission.granted) {
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		}

		await archiveAgent(
			agentId,
			workspaceId,
			session.user.id,
			isAdminRole(session.user.role),
		);
		return NextResponse.json({ ok: true });
	} catch (error) {
		if ((error as Error).message === "Agent not found") {
			return NextResponse.json({ error: "Agent not found" }, { status: 404 });
		}
		if (
			(error as Error).message ===
			"Only the creator or an admin can delete this agent"
		) {
			return NextResponse.json(
				{ error: (error as Error).message },
				{ status: 403 },
			);
		}

		logger.error("Failed to archive agent", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
