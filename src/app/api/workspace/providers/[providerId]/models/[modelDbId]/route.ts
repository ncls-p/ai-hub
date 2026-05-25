import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
	deleteModel,
	getModelById,
	getProviderById,
	updateModel,
} from "@/modules/provider/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const paramsSchema = z.object({
	providerId: z.uuid(),
	modelDbId: z.uuid(),
});

const workspaceQuerySchema = z.object({ workspaceId: z.uuid() });

const updateModelSchema = z.object({
	workspaceId: z.uuid(),
	displayName: z.string().min(1).max(255).optional(),
	capabilitiesJson: z.record(z.string(), z.boolean()).optional(),
	contextWindow: z.number().int().positive().optional(),
	maxOutputTokens: z.number().int().positive().optional(),
	inputTokenCost: z.string().optional(),
	outputTokenCost: z.string().optional(),
	enabled: z.boolean().optional(),
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

async function assertModelBelongsToProvider(
	modelDbId: string,
	providerId: string,
) {
	const model = await getModelById(modelDbId);
	return model?.providerId === providerId ? model : null;
}

export async function PATCH(
	req: NextRequest,
	{ params }: { params: Promise<{ providerId: string; modelDbId: string }> },
) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const parsedParams = paramsSchema.safeParse(await params);
		const parsedBody = updateModelSchema.safeParse(await req.json());
		if (!parsedParams.success || !parsedBody.success) {
			return NextResponse.json(
				{
					error: "Invalid input",
					details: parsedBody.success ? undefined : parsedBody.error.issues,
				},
				{ status: 400 },
			);
		}

		const { providerId, modelDbId } = parsedParams.data;
		const { workspaceId, ...input } = parsedBody.data;

		const permission = await requirePermission(
			session.user.id,
			workspaceId,
			"models.update",
		);
		if (!permission.granted) {
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		}

		const provider = await getProviderById(providerId, workspaceId);
		const model = await assertModelBelongsToProvider(modelDbId, providerId);
		if (!provider || !model) {
			return NextResponse.json({ error: "Model not found" }, { status: 404 });
		}

		await updateModel(modelDbId, input);
		return NextResponse.json(await getModelById(modelDbId));
	} catch (error) {
		logger.error("Failed to update model", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function DELETE(
	req: NextRequest,
	{ params }: { params: Promise<{ providerId: string; modelDbId: string }> },
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

		const { providerId, modelDbId } = parsedParams.data;
		const { workspaceId } = parsedQuery.data;

		const permission = await requirePermission(
			session.user.id,
			workspaceId,
			"models.delete",
		);
		if (!permission.granted) {
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		}

		const provider = await getProviderById(providerId, workspaceId);
		const model = await assertModelBelongsToProvider(modelDbId, providerId);
		if (!provider || !model) {
			return NextResponse.json({ error: "Model not found" }, { status: 404 });
		}

		await deleteModel(modelDbId);
		return NextResponse.json({ ok: true });
	} catch (error) {
		logger.error("Failed to delete model", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
