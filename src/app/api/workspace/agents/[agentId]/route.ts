import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/modules/auth/session";
import {
	getAgentById,
	updateAgent,
	archiveAgent,
} from "@/modules/agent/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { logger } from "@/lib/logger";

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
	toolBindings: z
		.array(
			z.object({
				toolSource: z.literal("builtin").default("builtin"),
				toolId: z.uuid(),
				requireApproval: z.boolean().optional(),
			}),
		)
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

		const agent = await getAgentById(agentId, workspaceId);
		if (!agent) {
			return NextResponse.json({ error: "Agent not found" }, { status: 404 });
		}

		return NextResponse.json(agent);
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
			...input,
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

		await archiveAgent(agentId, workspaceId, session.user.id);
		return NextResponse.json({ ok: true });
	} catch (error) {
		if ((error as Error).message === "Agent not found") {
			return NextResponse.json({ error: "Agent not found" }, { status: 404 });
		}

		logger.error("Failed to archive agent", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
