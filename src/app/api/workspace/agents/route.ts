import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/modules/auth/session";
import {
	canEditAgent,
	createAgent,
	getAgentDefaultPreferences,
	listAgents,
	normalizePromptSuggestions,
} from "@/modules/agent/use-cases";
import { isAdminRole } from "@/modules/admin/use-cases";
import { db } from "@/server/infrastructure/db";
import {
	agentVersions,
	aiModels,
	workspaces,
} from "@/server/infrastructure/db/schema";
import { authorization } from "@/server/domain/services/authorization";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { logger } from "@/lib/logger";

const slugSchema = z
	.string()
	.min(1)
	.max(128)
	.regex(/^[a-z0-9-]+$/);
const agentLogoUrlSchema = z
	.string()
	.max(350_000)
	.regex(
		/^data:image\/(?!svg\+xml)[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/,
	)
	.nullable();

const promptSuggestionsSchema = z
	.array(z.string().trim().min(1).max(240))
	.max(12);

const createAgentSchema = z.object({
	name: z.string().min(1).max(255),
	slug: slugSchema,
	description: z.string().max(2048).optional(),
	logoUrl: agentLogoUrlSchema.optional(),
	workspaceId: z.uuid(),
	systemPrompt: z.string().max(64_000).optional(),
	promptSuggestions: promptSuggestionsSchema.optional(),
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
	includeModelMeta: z.boolean().optional(),
});

function isUniqueConstraintError(error: unknown) {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "23505"
	);
}

async function getModelMetaByVersionId(
	versionIds: Array<string | null | undefined>,
) {
	const ids = Array.from(
		new Set(versionIds.filter((id): id is string => Boolean(id))),
	);
	const meta = new Map<
		string,
		{ displayName: string | null; logoUrl: string | null }
	>();
	if (ids.length === 0) return meta;

	const versions = await db
		.select({ id: agentVersions.id, modelId: agentVersions.modelId })
		.from(agentVersions)
		.where(inArray(agentVersions.id, ids));
	const modelIds = Array.from(
		new Set(
			versions
				.map((version) => version.modelId)
				.filter((id): id is string => Boolean(id)),
		),
	);
	const modelRows = modelIds.length
		? await db
				.select({
					id: aiModels.id,
					modelId: aiModels.modelId,
					displayName: aiModels.displayName,
					logoUrl: aiModels.logoUrl,
				})
				.from(aiModels)
				.where(inArray(aiModels.id, modelIds))
		: [];
	const modelsById = new Map(modelRows.map((model) => [model.id, model]));

	for (const version of versions) {
		const model = version.modelId ? modelsById.get(version.modelId) : null;
		meta.set(version.id, {
			displayName: model?.displayName || model?.modelId || null,
			logoUrl: model?.logoUrl ?? null,
		});
	}

	return meta;
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
				"Custom tool not found",
				"MCP tool not found",
				"Knowledge base not found",
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
			includeModelMeta: searchParams.get("includeModelMeta") === "true",
		});

		if (!parsed.success) {
			return NextResponse.json(
				{ error: "workspaceId must be a valid UUID" },
				{ status: 400 },
			);
		}

		const { workspaceId, includeModelMeta } = parsed.data;

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
		const permissionContext = {
			principalType: "user" as const,
			principalId: session.user.id,
		};
		const [
			canCreateAgent,
			canUpdateAgents,
			canManageProviderSettings,
			canManageModels,
		] = await Promise.all([
			authorization.hasPermission(
				permissionContext,
				"agents.create",
				"workspace",
				workspaceId,
			),
			authorization.hasPermission(
				permissionContext,
				"agents.update",
				"workspace",
				workspaceId,
			),
			authorization.hasPermission(
				permissionContext,
				"providers.update",
				"workspace",
				workspaceId,
			),
			authorization.hasPermission(
				permissionContext,
				"models.manage",
				"workspace",
				workspaceId,
			),
		]);
		const canManageProviders = canManageProviderSettings && canManageModels;
		const list = await listAgents(workspaceId, session.user.id, canAdminCurate);
		const defaultPreferences = await getAgentDefaultPreferences(
			workspaceId,
			session.user.id,
			new Set(list.map((agent) => agent.id)),
		);
		const modelMetaByVersionId = includeModelMeta
			? await getModelMetaByVersionId(
					list.map((agent) => agent.activeVersionId).filter(Boolean),
				)
			: new Map<
					string,
					{ displayName: string | null; logoUrl: string | null }
				>();
		const agentsWithAccess = list.map((agent) => ({
			...agent,
			promptSuggestions: normalizePromptSuggestions(
				agent.promptSuggestionsJson,
			),
			...(agent.activeVersionId
				? {
						modelDisplayName: modelMetaByVersionId.get(agent.activeVersionId)
							?.displayName,
						modelLogoUrl: modelMetaByVersionId.get(agent.activeVersionId)
							?.logoUrl,
					}
				: {}),
			canEdit:
				canUpdateAgents && canEditAgent(agent, session.user.id, canAdminCurate),
			canClone: canCreateAgent,
		}));

		return NextResponse.json({
			agents: agentsWithAccess,
			canAdminCurate,
			canCreateAgent,
			canManageProviders,
			...defaultPreferences,
		});
	} catch (error) {
		logger.error("Failed to list agents", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
