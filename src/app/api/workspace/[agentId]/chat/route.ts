import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { decryptValue, encryptValue } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
	getActiveVersion,
	getAgentVersionById,
	recordUsageEvent,
	resolveProviderForVersion,
} from "@/modules/agent/use-cases";
import { getBuiltInTool, requiresApproval } from "@/modules/tool/builtin-tools";
import {
	canExecuteRestrictedTool,
	getToolBindingsForVersion,
	logToolInvocation,
} from "@/modules/tool/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
	agents,
	conversations,
	messageParts,
	messages,
} from "@/server/infrastructure/db/schema";
import { getAdapter } from "@/server/infrastructure/providers";
import { stepCountIs, streamText, type ModelMessage, type ToolSet } from "ai";

const chatRequestSchema = z.object({
	content: z.string().trim().min(1).max(32_000),
	conversationId: z.uuid().optional(),
});

async function buildBoundTools(input: {
	agentVersionId: string;
	workspaceId: string;
	conversationId: string;
	messageId: string;
	userId: string;
}) {
	const bindings = await getToolBindingsForVersion(input.agentVersionId);
	const tools: ToolSet = {};

	for (const binding of bindings) {
		if (binding.toolSource !== "builtin") continue;
		const definition = getBuiltInTool(binding.toolId);
		if (!definition) continue;

		tools[definition.name] = {
			description: `${definition.description} Risk level: ${definition.riskLevel}.`,
			inputSchema: definition.inputSchema,
			execute: async (toolInput: unknown) => {
				const startedAt = Date.now();
				const restricted = requiresApproval(definition.riskLevel);

				if (restricted) {
					const canExecute = await canExecuteRestrictedTool(
						input.userId,
						input.workspaceId,
					);
					if (!canExecute) {
						await logToolInvocation({
							workspaceId: input.workspaceId,
							conversationId: input.conversationId,
							messageId: input.messageId,
							toolSource: "builtin",
							toolId: definition.id,
							toolName: definition.name,
							riskLevel: definition.riskLevel,
							input: toolInput,
							status: "denied",
							latencyMs: Date.now() - startedAt,
							errorMessage: "Missing permission: tools.executeRestricted",
						});
						return {
							denied: true,
							message:
								"You do not have permission to execute this restricted tool.",
						};
					}
				}

				if (binding.requireApproval) {
					const invocation = await logToolInvocation({
						workspaceId: input.workspaceId,
						conversationId: input.conversationId,
						messageId: input.messageId,
						toolSource: "builtin",
						toolId: definition.id,
						toolName: definition.name,
						riskLevel: definition.riskLevel,
						input: toolInput,
						status: "awaiting_approval",
						latencyMs: Date.now() - startedAt,
					});
					return {
						approvalRequired: true,
						invocationId: invocation.id,
						message: "This tool is awaiting human approval before execution.",
					};
				}

				try {
					const output = await definition.execute(toolInput as never);
					await logToolInvocation({
						workspaceId: input.workspaceId,
						conversationId: input.conversationId,
						messageId: input.messageId,
						toolSource: "builtin",
						toolId: definition.id,
						toolName: definition.name,
						riskLevel: definition.riskLevel,
						input: toolInput,
						output,
						status: "success",
						latencyMs: Date.now() - startedAt,
					});
					return output;
				} catch (error) {
					await logToolInvocation({
						workspaceId: input.workspaceId,
						conversationId: input.conversationId,
						messageId: input.messageId,
						toolSource: "builtin",
						toolId: definition.id,
						toolName: definition.name,
						riskLevel: definition.riskLevel,
						input: toolInput,
						status: "failed",
						latencyMs: Date.now() - startedAt,
						errorMessage:
							error instanceof Error ? error.message : String(error),
					});
					throw error;
				}
			},
		};
	}

	return tools;
}

async function loadConversationHistory(
	conversationId: string,
): Promise<ModelMessage[]> {
	const messageRows = await db
		.select({
			id: messages.id,
			role: messages.role,
			createdAt: messages.createdAt,
		})
		.from(messages)
		.where(eq(messages.conversationId, conversationId))
		.orderBy(messages.createdAt);

	const modelMessages: ModelMessage[] = [];

	for (const message of messageRows) {
		if (message.role !== "user" && message.role !== "assistant") {
			continue;
		}

		const parts = await db
			.select({
				type: messageParts.type,
				contentEncrypted: messageParts.contentEncrypted,
				sortOrder: messageParts.sortOrder,
			})
			.from(messageParts)
			.where(eq(messageParts.messageId, message.id))
			.orderBy(messageParts.sortOrder);

		const textParts: string[] = [];
		for (const part of parts) {
			if (part.type !== "text" || !part.contentEncrypted) continue;
			try {
				textParts.push(await decryptValue(part.contentEncrypted));
			} catch (error) {
				logger.warn("Skipping undecryptable message part", {
					messageId: message.id,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		const content = textParts.join("\n").trim();
		if (content) {
			modelMessages.push({ role: message.role, content });
		}
	}

	return modelMessages;
}

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ agentId: string }> },
) {
	let userMessageId: string | undefined;
	let assistantMessageId: string | undefined;

	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { agentId } = await params;
		const parsed = chatRequestSchema.safeParse(await req.json());
		if (!parsed.success) {
			return NextResponse.json(
				{ error: "Invalid input", details: parsed.error.issues },
				{ status: 400 },
			);
		}

		const { content, conversationId: existingConversationId } = parsed.data;

		const [agent] = await db
			.select()
			.from(agents)
			.where(eq(agents.id, agentId))
			.limit(1);

		if (!agent) {
			return NextResponse.json({ error: "Agent not found" }, { status: 404 });
		}

		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"agents.chat",
			"workspace",
			agent.workspaceId,
		);

		if (!permission.granted) {
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		}

		let conversation: typeof conversations.$inferSelect | null = null;
		if (existingConversationId) {
			const [existing] = await db
				.select()
				.from(conversations)
				.where(
					and(
						eq(conversations.id, existingConversationId),
						eq(conversations.agentId, agentId),
						eq(conversations.workspaceId, agent.workspaceId),
						eq(conversations.userId, session.user.id),
						eq(conversations.status, "active"),
					),
				)
				.limit(1);
			conversation = existing ?? null;
		}

		const version = conversation?.agentVersionId
			? await getAgentVersionById(conversation.agentVersionId)
			: await getActiveVersion(agentId);

		if (!version) {
			return NextResponse.json(
				{ error: "No active agent version configured" },
				{ status: 400 },
			);
		}

		const providerConfig = await resolveProviderForVersion(version);
		if (!providerConfig || !providerConfig.modelId) {
			return NextResponse.json(
				{ error: "No provider model configured for this agent version" },
				{ status: 400 },
			);
		}

		if (!conversation) {
			const [newConversation] = await db
				.insert(conversations)
				.values({
					workspaceId: agent.workspaceId,
					agentId,
					agentVersionId: version.id,
					userId: session.user.id,
					title: content.slice(0, 100),
					status: "active",
				})
				.returning();
			conversation = newConversation;
		}

		// Existing conversations can reference archived/deleted versions; fail safely.
		if (version.agentId !== agentId) {
			return NextResponse.json(
				{ error: "Invalid conversation version" },
				{ status: 400 },
			);
		}

		const encryptedContent = await encryptValue(content);
		const [userMessage] = await db
			.insert(messages)
			.values({
				conversationId: conversation.id,
				role: "user",
				status: "completed",
				completedAt: new Date(),
			})
			.returning();
		userMessageId = userMessage.id;

		await db.insert(messageParts).values({
			messageId: userMessage.id,
			type: "text",
			contentEncrypted: encryptedContent,
			sortOrder: 0,
		});

		const [assistantMessage] = await db
			.insert(messages)
			.values({
				conversationId: conversation.id,
				role: "assistant",
				status: "streaming",
				modelId: providerConfig.modelId,
				providerId: providerConfig.providerId,
			})
			.returning();
		assistantMessageId = assistantMessage.id;

		const adapter = getAdapter(providerConfig.providerKind);
		const model = adapter.createChatModel(
			providerConfig.runtimeConfig,
			providerConfig.modelId,
		);
		const history = await loadConversationHistory(conversation.id);
		const tools = await buildBoundTools({
			agentVersionId: version.id,
			workspaceId: agent.workspaceId,
			conversationId: conversation.id,
			messageId: assistantMessage.id,
			userId: session.user.id,
		});
		const startedAt = Date.now();
		let assistantText = "";

		const result = streamText({
			model,
			system: version.systemPrompt || "You are a helpful assistant.",
			messages: history,
			temperature: version.temperature
				? Number.parseFloat(version.temperature)
				: undefined,
			topP: version.topP ? Number.parseFloat(version.topP) : undefined,
			maxOutputTokens: version.maxOutputTokens ?? undefined,
			tools,
			stopWhen: Object.keys(tools).length > 0 ? stepCountIs(3) : undefined,
			onChunk({ chunk }) {
				if (chunk.type === "text-delta") {
					assistantText += chunk.text;
				}
			},
			async onStepFinish({ toolCalls, toolResults }) {
				const partsToInsert = [
					...toolCalls.map((toolCall, index) => ({
						messageId: assistantMessage.id,
						type: "tool-call" as const,
						contentEncrypted: null,
						metadataJson: toolCall,
						sortOrder: 100 + index,
					})),
					...toolResults.map((toolResult, index) => ({
						messageId: assistantMessage.id,
						type: "tool-result" as const,
						contentEncrypted: null,
						metadataJson: toolResult,
						sortOrder: 200 + index,
					})),
				];
				if (partsToInsert.length > 0) {
					await db.insert(messageParts).values(partsToInsert);
				}
			},
			async onFinish({ totalUsage }) {
				const encryptedAssistantContent = await encryptValue(assistantText);
				await db.insert(messageParts).values({
					messageId: assistantMessage.id,
					type: "text",
					contentEncrypted: encryptedAssistantContent,
					sortOrder: 0,
				});

				await db
					.update(messages)
					.set({
						status: "completed",
						tokenInput: totalUsage.inputTokens,
						tokenOutput: totalUsage.outputTokens,
						completedAt: new Date(),
					})
					.where(eq(messages.id, assistantMessage.id));

				await db
					.update(conversations)
					.set({ updatedAt: new Date() })
					.where(eq(conversations.id, conversation.id));

				await recordUsageEvent({
					workspaceId: agent.workspaceId,
					userId: session.user.id,
					providerId: providerConfig.providerId,
					modelId: providerConfig.modelRecordId,
					agentId,
					conversationId: conversation.id,
					operation: "chat",
					inputTokens: totalUsage.inputTokens,
					outputTokens: totalUsage.outputTokens,
					latencyMs: Date.now() - startedAt,
					status: "success",
				});
			},
			async onError({ error }) {
				logger.error("Chat stream failed", {}, error as Error);
				await db
					.update(messages)
					.set({ status: "failed", completedAt: new Date() })
					.where(eq(messages.id, assistantMessage.id));

				await recordUsageEvent({
					workspaceId: agent.workspaceId,
					userId: session.user.id,
					providerId: providerConfig.providerId,
					modelId: providerConfig.modelRecordId,
					agentId,
					conversationId: conversation.id,
					operation: "chat",
					latencyMs: Date.now() - startedAt,
					status: "failed",
				});
			},
		});

		return result.toTextStreamResponse({
			headers: {
				"X-Conversation-Id": conversation.id,
				"X-Message-Id": assistantMessage.id,
			},
		});
	} catch (error) {
		logger.error("Chat request failed", {}, error as Error);

		if (assistantMessageId) {
			await db
				.update(messages)
				.set({ status: "failed", completedAt: new Date() })
				.where(eq(messages.id, assistantMessageId));
		}
		if (userMessageId) {
			await db
				.update(messages)
				.set({ status: "failed", completedAt: new Date() })
				.where(eq(messages.id, userMessageId));
		}

		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
