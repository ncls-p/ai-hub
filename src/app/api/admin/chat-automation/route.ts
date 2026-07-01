import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleAdminRoute } from "@/lib/route-handler";
import { requireAdminApiSession } from "@/modules/admin/auth";
import {
	getChatAutomationAdminState,
	setChatAutomationConfig,
	validateChatAutomationConfig,
} from "@/modules/chat/automation";

const updateSchema = z
	.object({
		enabled: z.boolean(),
		providerId: z.uuid().optional(),
		modelId: z.uuid().optional(),
		generateTitles: z.boolean().default(true),
		generateSuggestions: z.boolean().default(true),
	})
	.superRefine((data, ctx) => {
		if (data.enabled && !data.providerId) {
			ctx.addIssue({
				code: "custom",
				message: "providerId is required when automation is enabled",
				path: ["providerId"],
			});
		}
		if (data.enabled && !data.modelId) {
			ctx.addIssue({
				code: "custom",
				message: "modelId is required when automation is enabled",
				path: ["modelId"],
			});
		}
	});

export async function GET() {
	try {
		const auth = await requireAdminApiSession();
		if (!auth.ok) return auth.response;
		return NextResponse.json(await getChatAutomationAdminState());
	} catch {
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function PATCH(req: NextRequest) {
	return handleAdminRoute(
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
			const validation = await validateChatAutomationConfig(parsed.data);
			if (!validation.ok) {
				return NextResponse.json(
					{
						error: validation.issues.map((issue) => issue.message).join(" "),
						issues: validation.issues,
					},
					{ status: 400 },
				);
			}
			const config = await setChatAutomationConfig(
				parsed.data,
				session.user.id,
			);
			return NextResponse.json(config);
		},
		{ logLabel: "Failed to update chat automation config" },
	);
}
