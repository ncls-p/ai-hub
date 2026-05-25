import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { encryptValue } from "@/lib/crypto";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
	agentToolBindings,
	agentVersions,
	toolInvocations,
} from "@/server/infrastructure/db/schema";
import {
	getBuiltInTool,
	listBuiltInTools,
	requiresApproval,
} from "./builtin-tools";

export const toolBindingInputSchema = z.object({
	toolSource: z.literal("builtin").default("builtin"),
	toolId: z.uuid(),
	requireApproval: z.boolean().optional(),
});

export type ToolBindingInput = z.infer<typeof toolBindingInputSchema>;

export function listAvailableBuiltInTools() {
	return listBuiltInTools();
}

export async function getToolBindingsForVersion(agentVersionId: string) {
	return db
		.select()
		.from(agentToolBindings)
		.where(eq(agentToolBindings.agentVersionId, agentVersionId));
}

export async function replaceToolBindingsForVersion(
	agentVersionId: string,
	bindings: ToolBindingInput[],
) {
	await db
		.delete(agentToolBindings)
		.where(eq(agentToolBindings.agentVersionId, agentVersionId));
	await insertToolBindingsForVersion(agentVersionId, bindings);
}

export async function insertToolBindingsForVersion(
	agentVersionId: string,
	bindings: ToolBindingInput[],
) {
	if (bindings.length === 0) return;

	const values = bindings.map((binding) => {
		const tool = getBuiltInTool(binding.toolId);
		if (!tool) throw new Error("Tool not found");

		return {
			agentVersionId,
			toolSource: "builtin",
			toolId: binding.toolId,
			requireApproval:
				binding.requireApproval ?? requiresApproval(tool.riskLevel),
			riskLevel: tool.riskLevel,
		};
	});

	await db.insert(agentToolBindings).values(values).onConflictDoNothing();
}

export async function cloneToolBindings(
	fromAgentVersionId: string | null,
	toAgentVersionId: string,
) {
	if (!fromAgentVersionId) return;
	const existing = await getToolBindingsForVersion(fromAgentVersionId);
	await insertToolBindingsForVersion(
		toAgentVersionId,
		existing.map((binding) => ({
			toolSource: "builtin" as const,
			toolId: binding.toolId,
			requireApproval: binding.requireApproval,
		})),
	);
}

export async function logToolInvocation(input: {
	workspaceId: string;
	conversationId?: string;
	messageId?: string;
	toolSource: string;
	toolId: string;
	toolName: string;
	riskLevel?: string | null;
	input: unknown;
	output?: unknown;
	status: string;
	latencyMs?: number;
	errorMessage?: string;
	approvedByUserId?: string;
}) {
	const [invocation] = await db
		.insert(toolInvocations)
		.values({
			workspaceId: input.workspaceId,
			conversationId: input.conversationId ?? null,
			messageId: input.messageId ?? null,
			toolSource: input.toolSource,
			toolId: input.toolId,
			toolName: input.toolName,
			riskLevel: input.riskLevel ?? null,
			inputJsonEncrypted: await encryptValue(
				JSON.stringify(input.input ?? null),
			),
			outputJsonEncrypted:
				input.output === undefined
					? null
					: await encryptValue(JSON.stringify(input.output)),
			status: input.status,
			latencyMs: input.latencyMs ?? null,
			errorMessage: input.errorMessage ?? null,
			approvedByUserId: input.approvedByUserId ?? null,
			completedAt:
				input.status === "success" || input.status === "failed"
					? new Date()
					: null,
		})
		.returning();

	return invocation;
}

export async function canExecuteRestrictedTool(
	userId: string,
	workspaceId: string,
) {
	const permission = await authorization.requirePermission(
		{ principalType: "user", principalId: userId },
		"tools.executeRestricted",
		"workspace",
		workspaceId,
	);
	return permission.granted;
}

export async function getAgentVersionToolContext(agentVersionId: string) {
	const [version] = await db
		.select({ agentId: agentVersions.agentId })
		.from(agentVersions)
		.where(eq(agentVersions.id, agentVersionId))
		.limit(1);

	if (!version) throw new Error("Agent version not found");

	const bindings = await db
		.select()
		.from(agentToolBindings)
		.where(
			and(
				eq(agentToolBindings.agentVersionId, agentVersionId),
				eq(agentToolBindings.toolSource, "builtin"),
			),
		);

	return { version, bindings };
}
