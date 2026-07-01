import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute } from "@/lib/route-handler";
import { requireAdminApiSession } from "@/modules/admin/auth";
import {
	getCustomToolBuilderAdminState,
	setCustomToolBuilderConfig,
} from "@/modules/custom-tools/use-cases";

const updateSchema = z.object({
	enabled: z.boolean(),
	workspaceId: z.uuid().optional(),
	providerId: z.uuid().optional(),
	modelId: z.uuid().optional(),
	n8nMcpServerId: z.uuid().optional(),
	createWorkflowToolName: z
		.string()
		.trim()
		.min(1)
		.max(255)
		.default("n8n_create_workflow"),
	validateWorkflowToolName: z
		.string()
		.trim()
		.min(1)
		.max(255)
		.default("n8n_validate_workflow"),
	activateWorkflowToolName: z
		.string()
		.trim()
		.min(1)
		.max(255)
		.default("n8n_update_partial_workflow"),
	credentialToolName: z
		.string()
		.trim()
		.min(1)
		.max(255)
		.default("n8n_manage_credentials"),
	allowWorkflowActivation: z.boolean().default(false),
});

export async function GET() {
	try {
		const auth = await requireAdminApiSession();
		if (!auth.ok) return auth.response;
		return NextResponse.json(await getCustomToolBuilderAdminState());
	} catch {
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function PATCH(req: NextRequest) {
	return handleRoute(
		req,
		async ({ session }) => {
			const auth = await requireAdminApiSession();
			if (!auth.ok) return auth.response;
			const parsed = updateSchema.safeParse(await req.json());
			if (!parsed.success) {
				return NextResponse.json(
					{ error: "Invalid input", details: parsed.error.issues },
					{ status: 400 },
				);
			}
			const config = await setCustomToolBuilderConfig(
				parsed.data,
				session.user.id,
			);
			return NextResponse.json(config);
		},
		{ logLabel: "Failed to update custom tool builder config" },
	);
}
