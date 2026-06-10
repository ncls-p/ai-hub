import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
	listMarketplaceItems,
	publishAgentDraft,
	createMarketplaceDraft,
	createSkillMarketplaceDraft,
	createCustomToolMarketplaceDraft,
	getMyPublishedItems,
	getSharedWithMe,
} from "@/modules/marketplace/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const createSchema = z
	.object({
		workspaceId: z.uuid(),
		agentId: z.uuid().optional(),
		skillId: z.uuid().optional(),
		customToolId: z.uuid().optional(),
		version: z.string().min(1).max(32).default("1.0.0"),
		name: z.string().min(1).max(255).optional(),
		description: z.string().max(2048).optional(),
		visibility: z
			.enum(["public", "private", "unlisted", "organization"])
			.optional(),
		tags: z.array(z.string()).optional(),
		draftOnly: z.boolean().optional(),
	})
	.refine(
		(data) => {
			const resourceIds = [data.agentId, data.skillId, data.customToolId].filter(
				Boolean,
			);
			return resourceIds.length === 1;
		},
		{ message: "Exactly one of agentId, skillId, or customToolId is required" },
	);

export async function GET(req: NextRequest) {
	try {
		const session = await getSession();
		const { searchParams } = new URL(req.url);

		// Special endpoints
		const path = searchParams.get("_path");
		if (path === "my-published" && session) {
			return NextResponse.json(await getMyPublishedItems(session.user.id));
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
		const includeDrafts = searchParams.get("includeDrafts") === "true";

		return NextResponse.json(
			await listMarketplaceItems({
				userId: session?.user.id,
				search,
				type,
				featuredOnly,
				sortBy,
				status,
				includeDrafts,
			}),
		);
	} catch (error) {
		logger.error("Failed to list marketplace items", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function POST(req: NextRequest) {
	try {
		const session = await getSession();
		if (!session)
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		const parsed = createSchema.safeParse(await req.json());
		if (!parsed.success)
			return NextResponse.json(
				{ error: "Invalid input", details: parsed.error.issues },
				{ status: 400 },
			);

		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"marketplaceItems.publish",
			"workspace",
			parsed.data.workspaceId,
		);
		if (!permission.granted)
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);

		const baseInput = {
			workspaceId: parsed.data.workspaceId,
			userId: session.user.id,
			version: parsed.data.version,
			name: parsed.data.name,
			description: parsed.data.description,
			visibility: parsed.data.visibility,
			tags: parsed.data.tags,
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
			const result = await createCustomToolMarketplaceDraft({
				...baseInput,
				customToolId: parsed.data.customToolId!,
			});
			return NextResponse.json(result, { status: 201 });
		}

		if (!parsed.data.agentId) {
			return NextResponse.json(
				{
					error:
						"Only agents can be published directly. Use draftOnly for skills and custom tools.",
				},
				{ status: 400 },
			);
		}

		const result = await publishAgentDraft({
			...baseInput,
			agentId: parsed.data.agentId,
		});
		return NextResponse.json(result, { status: 201 });
	} catch (error) {
		logger.error("Failed to create marketplace item", {}, error as Error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{
				status:
					error instanceof Error && error.message.includes("not found")
						? 404
						: 500,
			},
		);
	}
}
