import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
	createModel,
	discoverModels,
	getProviderById,
	listModels,
} from "@/modules/provider/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const paramsSchema = z.object({ providerId: z.uuid() });
const workspaceQuerySchema = z.object({ workspaceId: z.uuid() });

const createModelSchema = z.object({
	workspaceId: z.uuid(),
	modelId: z.string().min(1).max(255),
	displayName: z.string().min(1).max(255).optional(),
	capabilitiesJson: z.record(z.string(), z.boolean()).optional(),
	contextWindow: z.number().int().positive().optional(),
	maxOutputTokens: z.number().int().positive().optional(),
	inputTokenCost: z.string().optional(),
	outputTokenCost: z.string().optional(),
});

async function requirePermission(
	userId: string,
	workspaceId: string,
	permissionName: string,
) {
	return authorization.requirePermission(
		{ principalType: "user", principalId: userId },
		permissionName,
		"workspace",
		workspaceId,
	);
}

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ providerId: string }> },
) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const parsedParams = paramsSchema.safeParse(await params);
		const { searchParams } = new URL(req.url);
		const parsedQuery = workspaceQuerySchema.safeParse({
			workspaceId: searchParams.get("workspaceId"),
		});
		if (!parsedParams.success || !parsedQuery.success) {
			return NextResponse.json({ error: "Invalid request" }, { status: 400 });
		}

		const { providerId } = parsedParams.data;
		const { workspaceId } = parsedQuery.data;
		const action = searchParams.get("action");

		const permission = await requirePermission(
			session.user.id,
			workspaceId,
			action === "discover" ? "providerModels.sync" : "models.view",
		);
		if (!permission.granted) {
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		}

		const provider = await getProviderById(providerId, workspaceId);
		if (!provider) {
			return NextResponse.json(
				{ error: "Provider not found" },
				{ status: 404 },
			);
		}

		if (action === "discover") {
			const discovered = await discoverModels(providerId, workspaceId);
			return NextResponse.json(discovered);
		}

		const models = await listModels(providerId);
		return NextResponse.json(models);
	} catch (error) {
		logger.error("Failed to list provider models", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ providerId: string }> },
) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const parsedParams = paramsSchema.safeParse(await params);
		const parsedBody = createModelSchema.safeParse(await req.json());
		if (!parsedParams.success || !parsedBody.success) {
			return NextResponse.json(
				{
					error: "Invalid input",
					details: parsedBody.success ? undefined : parsedBody.error.issues,
				},
				{ status: 400 },
			);
		}

		const { providerId } = parsedParams.data;
		const { workspaceId, ...input } = parsedBody.data;

		const permission = await requirePermission(
			session.user.id,
			workspaceId,
			"models.create",
		);
		if (!permission.granted) {
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		}

		const provider = await getProviderById(providerId, workspaceId);
		if (!provider) {
			return NextResponse.json(
				{ error: "Provider not found" },
				{ status: 404 },
			);
		}

		const model = await createModel(providerId, { providerId, ...input });
		return NextResponse.json(model, { status: 201 });
	} catch (error) {
		logger.error("Failed to create model", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
