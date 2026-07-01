import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
	handleRoute,
	requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { isPlatformAdminSession } from "@/modules/admin/auth";
import { getSession } from "@/modules/auth/session";
import {
	listMarketplaceItems,
	publishAgentDraft,
	createMarketplaceDraft,
	createSkillMarketplaceDraft,
	createCustomToolMarketplaceDraft,
	createMcpServerMarketplaceDraft,
	createMcpToolMarketplaceDraft,
	getMyMarketplaceItems,
	getSharedWithMe,
} from "@/modules/marketplace/use-cases";

const createSchema = z
	.object({
		workspaceId: z.uuid(),
		agentId: z.uuid().optional(),
		skillId: z.uuid().optional(),
		customToolId: z.uuid().optional(),
		mcpServerId: z.uuid().optional(),
		mcpToolId: z.uuid().optional(),
		version: z.string().min(1).max(32).default("1.0.0"),
		name: z.string().min(1).max(255).optional(),
		description: z.string().max(2048).optional(),
		visibility: z.enum(["public", "private"]).optional(),
		tags: z.array(z.string()).optional(),
		changelog: z.string().max(2048).optional(),
		includeSecrets: z.boolean().optional(),
		draftOnly: z.boolean().optional(),
	})
	.refine(
		(data) => {
			const resourceIds = [
				data.agentId,
				data.skillId,
				data.customToolId,
				data.mcpServerId,
				data.mcpToolId,
			].filter(Boolean);
			return resourceIds.length === 1;
		},
		{
			message:
				"Exactly one of agentId, skillId, customToolId, mcpServerId, or mcpToolId is required",
		},
	);

export async function GET(req: NextRequest) {
	try {
		const session = await getSession();
		const { searchParams } = new URL(req.url);
		const path = searchParams.get("_path");
		if (path === "my-items" && session) {
			return NextResponse.json(await getMyMarketplaceItems(session.user.id));
		}
		if (path === "shared-with-me" && session) {
			return NextResponse.json(await getSharedWithMe(session.user.id));
		}
		const search = searchParams.get("search") || undefined;
		const type = searchParams.get("type")
			? searchParams.get("type")!.split(",")
			: undefined;
		const featuredOnly =
			searchParams.get("featuredOnly") === "true" || undefined;
		const sortBy = searchParams.get("sortBy") as
			| "featured"
			| "newest"
			| "downloads"
			| "rating"
			| undefined;
		const status = searchParams.get("status") || undefined;
		if (status && !(await isPlatformAdminSession(session))) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}
		return NextResponse.json(
			await listMarketplaceItems({
				userId: session?.user.id,
				search,
				type,
				featuredOnly,
				sortBy,
				status,
			}),
		);
	} catch {
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function POST(req: NextRequest) {
	return handleRoute(
		req,
		async ({ session }) => {
			const parsed = createSchema.safeParse(await req.json());
			if (!parsed.success)
				return NextResponse.json(
					{ error: "Invalid input", details: parsed.error.issues },
					{ status: 400 },
				);
			const forbidden = await requireWorkspacePermissionAsync(
				session.user.id,
				parsed.data.workspaceId,
				"marketplaceItems.publish",
			);
			if (forbidden) return forbidden;
			const baseInput = {
				workspaceId: parsed.data.workspaceId,
				userId: session.user.id,
				version: parsed.data.version,
				name: parsed.data.name,
				description: parsed.data.description,
				visibility: parsed.data.visibility,
				tags: parsed.data.tags,
				changelog: parsed.data.changelog,
				includeSecrets: parsed.data.includeSecrets,
			};
			if (parsed.data.draftOnly) {
				if (parsed.data.agentId) {
					const result = await createMarketplaceDraft({
						...baseInput,
						agentId: parsed.data.agentId,
					});
					return NextResponse.json(result, { status: 201 });
				}
				if (parsed.data.skillId) {
					const result = await createSkillMarketplaceDraft({
						...baseInput,
						skillId: parsed.data.skillId,
					});
					return NextResponse.json(result, { status: 201 });
				}
				if (parsed.data.customToolId) {
					const result = await createCustomToolMarketplaceDraft({
						...baseInput,
						customToolId: parsed.data.customToolId,
					});
					return NextResponse.json(result, { status: 201 });
				}
				if (parsed.data.mcpServerId) {
					const result = await createMcpServerMarketplaceDraft({
						...baseInput,
						mcpServerId: parsed.data.mcpServerId,
					});
					return NextResponse.json(result, { status: 201 });
				}
				const result = await createMcpToolMarketplaceDraft({
					...baseInput,
					mcpToolId: parsed.data.mcpToolId!,
				});
				return NextResponse.json(result, { status: 201 });
			}
			if (!parsed.data.agentId) {
				return NextResponse.json(
					{
						error:
							"Only agents can be published directly. Use draftOnly for skills, custom tools, and MCP presets.",
					},
					{ status: 400 },
				);
			}
			const result = await publishAgentDraft({
				...baseInput,
				agentId: parsed.data.agentId,
			});
			return NextResponse.json(result, { status: 201 });
		},
		{
			logLabel: "Failed to create marketplace item",
			expectedError: (error) => {
				const message =
					error instanceof Error ? error.message : "Internal server error";
				return NextResponse.json(
					{ error: message },
					{
						status:
							error instanceof Error && error.message.includes("not found")
								? 404
								: 500,
					},
				);
			},
		},
	);
}
