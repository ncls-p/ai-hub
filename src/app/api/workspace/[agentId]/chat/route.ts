import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { decryptValue, encryptValue } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { getActorUserId, resolveAuthContext } from "@/modules/auth/resolve-auth";
import {
	canUseAgent,
	getActiveVersion,
	getAgentVersionById,
	recordUsageEvent,
	resolveProviderForVersion,
} from "@/modules/agent/use-cases";
import { isAdminRole } from "@/modules/admin/use-cases";
import { searchBoundKnowledgeBases } from "@/modules/knowledge/use-cases";
import { executeMcpTool } from "@/modules/mcp/executor";
import { assertWorkspaceWithinTokenQuota } from "@/modules/usage/quota";
import { getBuiltInTool, requiresApproval } from "@/modules/tool/builtin-tools";
import {
	canExecuteRestrictedTool,
	getMcpBindingContext,
	getToolBindingsForVersion,
	logToolInvocation,
} from "@/modules/tool/use-cases";
import { waitForApproval } from "@/modules/tool/invocation-state";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
	agents,
	conversations,
	messageParts,
	messages,
} from "@/server/infrastructure/db/schema";
import { getAdapter } from "@/server/infrastructure/providers";
import {
	extractReasoningMiddleware,
	jsonSchema,
	stepCountIs,
	streamText,
	wrapLanguageModel,
	type ModelMessage,
	type ToolSet,
} from "ai";

const chatRequestSchema = z.object({
	content: z.string().trim().min(1).max(32_000),
	conversationId: z.uuid().optional(),
});

type ToolApprovalRequiredEvent = {
	invocationId: string;
	toolName: string;
	input: unknown;
};

async function buildBoundTools(input: {
	agentVersionId: string;
	workspaceId: string;
	conversationId: string;
	messageId: string;
	userId: string;
	emitEvent?: (event: Record<string, unknown>) => void;
	onApprovalRequired?: (event: ToolApprovalRequiredEvent) => void;
}) {
	const bindings = await getToolBindingsForVersion(input.agentVersionId);
	const tools: ToolSet = {};

	for (const binding of bindings) {
		if (binding.toolSource === "mcp") {
			const mcpContext = await getMcpBindingContext(
				input.agentVersionId,
				binding.toolId,
			);
			if (!mcpContext) continue;
			const mcpTool = mcpContext.tool;

			const toolKey = `mcp_${mcpTool.name.replace(/[^a-zA-Z0-9_]/g, "_")}`;
			const schema =
				(mcpTool.inputSchemaJson as Record<string, unknown> | null) ?? {
					type: "object",
					properties: {},
				};

			tools[toolKey] = {
				description:
					mcpTool.description ??
					`MCP tool ${mcpTool.name} from connected server.`,
				inputSchema: jsonSchema(schema),
				execute: async (toolInput: unknown) => {
					const startedAt = Date.now();
					if (binding.requireApproval) {
						const invocation = await logToolInvocation({
							workspaceId: input.workspaceId,
							conversationId: input.conversationId,
							messageId: input.messageId,
							toolSource: "mcp",
							toolId: mcpTool.id,
							toolName: mcpTool.name,
							riskLevel: binding.riskLevel,
							input: toolInput,
							status: "awaiting_approval",
							latencyMs: Date.now() - startedAt,
						});

						input.onApprovalRequired?.({
							invocationId: invocation.id,
							toolName: mcpTool.name,
							input: toolInput,
						});

						const approvalResult = await waitForApproval(invocation.id);
						if (approvalResult.status !== "success") {
							return {
								denied: true,
								message:
									approvalResult.error ?? "Tool invocation was not approved.",
							};
						}
						return approvalResult.output;
					}

					try {
						const output = await executeMcpTool({
							serverId: mcpTool.mcpServerId,
							toolId: mcpTool.id,
							workspaceId: input.workspaceId,
							toolInput,
						});
						await logToolInvocation({
							workspaceId: input.workspaceId,
							conversationId: input.conversationId,
							messageId: input.messageId,
							toolSource: "mcp",
							toolId: mcpTool.id,
							toolName: mcpTool.name,
							riskLevel: binding.riskLevel,
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
							toolSource: "mcp",
							toolId: mcpTool.id,
							toolName: mcpTool.name,
							riskLevel: binding.riskLevel,
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
			continue;
		}

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

					input.onApprovalRequired?.({
						invocationId: invocation.id,
						toolName: definition.name,
						input: toolInput,
					});

					// Block until approval is granted or denied
					const approvalResult = await waitForApproval(invocation.id);

					if (approvalResult.status === "success") {
						return approvalResult.output;
					}

					// Rejected or failed
					return {
						denied: true,
						invocationId: invocation.id,
						message:
							approvalResult.error ?? "Tool invocation was not approved.",
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
		const auth = await resolveAuthContext();
		if (!auth) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		const actorUserId = getActorUserId(auth);

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
		if (
			!isAdminRole(auth.type === "user" ? auth.role : null) &&
			!canUseAgent(agent, actorUserId)
		) {
			return NextResponse.json({ error: "Agent not found" }, { status: 404 });
		}
		if (auth.type === "api_key" && auth.workspaceId !== agent.workspaceId) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}

		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: actorUserId },
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

		const quota = await assertWorkspaceWithinTokenQuota(agent.workspaceId);
		if (!quota.allowed) {
			return NextResponse.json(
				{ error: quota.message, code: "quota_exceeded", used: quota.used, limit: quota.limit },
				{ status: 429 },
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
						eq(conversations.userId, actorUserId),
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
					userId: actorUserId,
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
		const model = wrapLanguageModel({
			model: adapter.createChatModel(
				providerConfig.runtimeConfig,
				providerConfig.modelId,
			),
			middleware: extractReasoningMiddleware({ tagName: "think" }),
		});
		const history = await loadConversationHistory(conversation.id);

		const encoder = new TextEncoder();
		let streamController: ReadableStreamDefaultController<Uint8Array> | null =
			null;
		const eventBuffer: Array<Record<string, unknown>> = [];

		const emitSse = (event: Record<string, unknown>) => {
			const chunk = encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
			if (streamController) {
				try {
					streamController.enqueue(chunk);
					return;
				} catch {
					// fall through to buffering on closed/erroring streams
				}
			}
			eventBuffer.push(event);
		};
		const enqueueEvent = (event: Record<string, unknown>) => emitSse(event);

		const ragHits = await searchBoundKnowledgeBases({
			agentVersionId: version.id,
			workspaceId: agent.workspaceId,
			query: content,
			limit: 5,
		});

		const citations = ragHits.map((hit) => ({
			chunkId: hit.chunkId,
			documentId: hit.documentId,
			documentTitle: hit.documentTitle,
			content: hit.content.slice(0, 500),
			score: hit.score,
			knowledgeBaseId: hit.knowledgeBaseId,
			knowledgeBaseName: hit.knowledgeBaseName,
		}));

		if (citations.length > 0) {
			enqueueEvent({ type: "citations", citations });
		}

		const ragContext = ragHits
			.map(
				(hit, index) =>
					`[${index + 1}] ${hit.documentTitle} (${hit.knowledgeBaseName}): ${hit.content}`,
			)
			.join("\n\n");

		const systemPrompt = [
			version.systemPrompt || "You are a helpful assistant.",
			ragContext
				? `Use the following knowledge base excerpts when relevant:\n\n${ragContext}`
				: null,
		]
			.filter(Boolean)
			.join("\n\n");

		const tools = await buildBoundTools({
			agentVersionId: version.id,
			workspaceId: agent.workspaceId,
			conversationId: conversation.id,
			messageId: assistantMessage.id,
			userId: actorUserId,
			emitEvent: enqueueEvent,
			onApprovalRequired: (event) => {
				enqueueEvent({
					type: "tool_approval_required",
					invocationId: event.invocationId,
					toolName: event.toolName,
					input: event.input,
				});
			},
		});
		const startedAt = Date.now();
		let assistantText = "";
		let reasoningText = "";

		const result = streamText({
			model,
			system: systemPrompt,
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
				if (chunk.type === "reasoning-delta") {
					reasoningText += chunk.text;
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
				const partsToInsert = [];
				if (reasoningText.trim()) {
					partsToInsert.push({
						messageId: assistantMessage.id,
						type: "reasoning" as const,
						contentEncrypted: await encryptValue(reasoningText),
						sortOrder: -10,
					});
				}
				partsToInsert.push({
					messageId: assistantMessage.id,
					type: "text" as const,
					contentEncrypted: await encryptValue(assistantText),
					sortOrder: 0,
				});
				await db.insert(messageParts).values(partsToInsert);

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
					userId: actorUserId,
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
					userId: actorUserId,
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

		const stream = new ReadableStream<Uint8Array>({
			async start(controller) {
				streamController = controller;
				for (const buffered of eventBuffer.splice(0)) emitSse(buffered);

				try {
					for await (const part of result.fullStream) {
						if (part.type === "text-delta") {
							emitSse({ type: "text", delta: part.text });
						} else if (part.type === "reasoning-delta") {
							emitSse({ type: "reasoning", delta: part.text });
						} else if (part.type === "tool-call") {
							emitSse({
								type: "tool_call",
								toolCallId: part.toolCallId,
								toolName: part.toolName,
								input: part.input,
							});
						} else if (part.type === "tool-result") {
							emitSse({
								type: "tool_result",
								toolCallId: part.toolCallId,
								toolName: part.toolName,
								output: part.output,
							});
						} else if (part.type === "error") {
							emitSse({
								type: "error",
								error:
									part.error instanceof Error
										? part.error.message
										: String(part.error),
							});
						}
					}
				} catch (error) {
					emitSse({
						type: "error",
						error: error instanceof Error ? error.message : String(error),
					});
				} finally {
					streamController = null;
					controller.close();
				}
			},
		});

		return new Response(stream, {
			headers: {
				"Content-Type": "text/event-stream; charset=utf-8",
				"Cache-Control": "no-cache, no-transform",
				Connection: "keep-alive",
				"X-Accel-Buffering": "no",
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
