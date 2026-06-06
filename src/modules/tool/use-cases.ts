import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { encryptValue } from "@/lib/crypto";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
	agentToolBindings,
	agentVersions,
	customTools,
	mcpServers,
	mcpTools,
	toolInvocations,
} from "@/server/infrastructure/db/schema";
import { getBuiltInTool, requiresApproval } from "./builtin-tools";

export const toolBindingInputSchema = z.discriminatedUnion("toolSource", [
	z.object({
		toolSource: z.literal("builtin"),
		toolId: z.uuid(),
		requireApproval: z.boolean().optional(),
	}),
	z.object({
		toolSource: z.literal("mcp"),
		toolId: z.uuid(),
		mcpServerId: z.uuid(),
		requireApproval: z.boolean().optional(),
	}),
	z.object({
		toolSource: z.literal("custom"),
		toolId: z.uuid(),
		requireApproval: z.boolean().optional(),
	}),
]);

export type ToolBindingInput = z.infer<typeof toolBindingInputSchema>;

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

	const values = await Promise.all(
		bindings.map(async (binding) => {
			if (binding.toolSource === "custom") {
				const [customTool] = await db
					.select()
					.from(customTools)
					.where(eq(customTools.id, binding.toolId))
					.limit(1);
				if (!customTool) throw new Error("Custom tool not found");

				return {
					agentVersionId,
					toolSource: "custom" as const,
					toolId: binding.toolId,
					requireApproval: binding.requireApproval ?? true,
					riskLevel: "medium",
				};
			}

			if (binding.toolSource === "mcp") {
				const [tool] = await db
					.select()
					.from(mcpTools)
					.where(
						and(
							eq(mcpTools.id, binding.toolId),
							eq(mcpTools.mcpServerId, binding.mcpServerId),
						),
					)
					.limit(1);
				if (!tool) throw new Error("MCP tool not found");

				return {
					agentVersionId,
					toolSource: "mcp" as const,
					toolId: binding.toolId,
					requireApproval: binding.requireApproval ?? tool.requireApproval,
					riskLevel: "medium",
				};
			}

			const tool = getBuiltInTool(binding.toolId);
			if (!tool) throw new Error("Tool not found");

			return {
				agentVersionId,
				toolSource: "builtin" as const,
				toolId: binding.toolId,
				requireApproval:
					binding.requireApproval ?? requiresApproval(tool.riskLevel),
				riskLevel: tool.riskLevel,
			};
		}),
	);

	await db.insert(agentToolBindings).values(values).onConflictDoNothing();
}

export async function cloneToolBindings(
	fromAgentVersionId: string | null,
	toAgentVersionId: string,
) {
	if (!fromAgentVersionId) return;
	const existing = await getToolBindingsForVersion(fromAgentVersionId);
	const inputs: ToolBindingInput[] = [];

	for (const binding of existing) {
		if (binding.toolSource === "custom") {
			inputs.push({
				toolSource: "custom",
				toolId: binding.toolId,
				requireApproval: binding.requireApproval,
			});
			continue;
		}

		if (binding.toolSource === "mcp") {
			const [tool] = await db
				.select({ mcpServerId: mcpTools.mcpServerId })
				.from(mcpTools)
				.where(eq(mcpTools.id, binding.toolId))
				.limit(1);
			if (!tool) continue;
			inputs.push({
				toolSource: "mcp",
				toolId: binding.toolId,
				mcpServerId: tool.mcpServerId,
				requireApproval: binding.requireApproval,
			});
			continue;
		}

		inputs.push({
			toolSource: "builtin",
			toolId: binding.toolId,
			requireApproval: binding.requireApproval,
		});
	}

	await insertToolBindingsForVersion(toAgentVersionId, inputs);
}

export async function getCustomBindingContext(
	agentVersionId: string,
	toolId: string,
	userId: string,
	workspaceId: string,
) {
	const [binding] = await db
		.select()
		.from(agentToolBindings)
		.where(
			and(
				eq(agentToolBindings.agentVersionId, agentVersionId),
				eq(agentToolBindings.toolId, toolId),
				eq(agentToolBindings.toolSource, "custom"),
			),
		)
		.limit(1);

	if (!binding) return null;

	const [tool] = await db
		.select()
		.from(customTools)
		.where(
			and(
				eq(customTools.id, toolId),
				eq(customTools.workspaceId, workspaceId),
				eq(customTools.createdById, userId),
			),
		)
		.limit(1);

	return tool ? { binding, tool } : null;
}

export async function getMcpBindingContext(
	agentVersionId: string,
	toolId: string,
) {
	const [binding] = await db
		.select()
		.from(agentToolBindings)
		.where(
			and(
				eq(agentToolBindings.agentVersionId, agentVersionId),
				eq(agentToolBindings.toolId, toolId),
				eq(agentToolBindings.toolSource, "mcp"),
			),
		)
		.limit(1);

	if (!binding) return null;

	const [tool] = await db
		.select()
		.from(mcpTools)
		.where(eq(mcpTools.id, toolId))
		.limit(1);

	if (!tool) return null;

	const [server] = await db
		.select()
		.from(mcpServers)
		.where(eq(mcpServers.id, tool.mcpServerId))
		.limit(1);

	return server ? { binding, tool, server } : null;
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
