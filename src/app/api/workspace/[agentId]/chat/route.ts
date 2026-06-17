import { and, desc, eq, gt, inArray, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { fallbackSystemPrompt } from "@/lib/copy-defaults";
import { z } from "zod";
import { decryptValue, encryptValue } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import {
	getActorUserId,
	resolveAuthContext,
} from "@/modules/auth/resolve-auth";
import {
	canUseAgent,
	getActiveVersion,
	recordUsageEvent,
	resolveProviderForVersion,
} from "@/modules/agent/use-cases";
import { isAdminRole } from "@/modules/admin/use-cases";
import {
	completeChatStream,
	createChatStreamResponse,
	publishChatStreamEvent,
	registerChatStreamAbortController,
} from "@/modules/chat/stream-bus";
import { generateChatAutomationArtifacts } from "@/modules/chat/automation";
import { consumeSkipNextChatSuggestions } from "@/modules/chat/suggestion-skip";
import { searchBoundKnowledgeBases } from "@/modules/knowledge/use-cases";
import {
	buildSkillsRegistryPrompt,
	loadBoundSkillContent,
} from "@/modules/skills/use-cases";
import { executeCustomToolWorkflow } from "@/modules/custom-tools/use-cases";
import { executeMcpTool } from "@/modules/mcp/executor";
import { assertWorkspaceWithinTokenQuota } from "@/modules/usage/quota";
import { getBuiltInTool, requiresApproval } from "@/modules/tool/builtin-tools";
import {
	canExecuteRestrictedTool,
	getCustomBindingContext,
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
	toolInvocations,
} from "@/server/infrastructure/db/schema";
import { getAdapter } from "@/server/infrastructure/providers";
import {
	extractReasoningMiddleware,
	jsonSchema,
	streamText,
	wrapLanguageModel,
	type ModelMessage,
	type ToolSet,
} from "ai";

const chatRequestSchema = z.object({
	content: z.string().trim().min(1).max(32_000),
	conversationId: z.uuid().nullable().optional(),
	resendFromMessageId: z.uuid().nullable().optional(),
});

const defaultMaxToolCalls = 6;
const defaultMaxOutputTokens = 30_000;

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
	maxToolCalls: number;
	requireApprovalForAllTools?: boolean;
	hasSkills?: boolean;
	emitEvent?: (event: Record<string, unknown>) => void;
	onApprovalRequired?: (event: ToolApprovalRequiredEvent) => void;
}) {
	const bindings = await getToolBindingsForVersion(input.agentVersionId);
	const tools: ToolSet = {};
	let executedToolCallCount = 0;

	function reserveToolCall() {
		if (executedToolCallCount >= input.maxToolCalls) return false;
		executedToolCallCount += 1;
		return true;
	}

	function toolLimitReachedResult() {
		return {
			denied: true,
			message:
				"Tool call limit reached. Answer the user now using the information already gathered.",
		};
	}

	if (input.hasSkills) {
		tools.load_skill = {
			description:
				"Load the full Markdown instructions for an enabled agent skill by exact skill name. Use this when a listed skill is relevant before applying its workflow.",
			inputSchema: jsonSchema({
				type: "object",
				properties: {
					skillName: {
						type: "string",
						description: "Exact skill name from the available skills registry.",
					},
				},
				required: ["skillName"],
				additionalProperties: false,
			}),
			execute: async (toolInput: unknown) => {
				if (!reserveToolCall()) return toolLimitReachedResult();
				const parsed = z
					.object({ skillName: z.string().trim().min(1) })
					.safeParse(toolInput);
				if (!parsed.success) {
					return { found: false, message: "skillName is required." };
				}
				return loadBoundSkillContent({
					agentVersionId: input.agentVersionId,
					skillName: parsed.data.skillName,
				});
			},
		};
	}

	for (const binding of bindings) {
		if (binding.toolSource === "custom") {
			const customContext = await getCustomBindingContext(
				input.agentVersionId,
				binding.toolId,
				input.userId,
				input.workspaceId,
			);
			if (!customContext) continue;
			const customTool = customContext.tool;
			const sanitizedName = customTool.name
				.replace(/[^a-zA-Z0-9_]/g, "_")
				.replace(/^_+|_+$/g, "");
			const toolKey = `custom_${customTool.id.replace(/-/g, "_")}_${sanitizedName || "tool"}`;
			const schema = (customTool.inputSchemaJson as Record<
				string,
				unknown
			> | null) ?? { type: "object", properties: {} };

			tools[toolKey] = {
				description:
					customTool.description ??
					`Custom tool ${customTool.name} created by the current user.`,
				inputSchema: jsonSchema(schema),
				execute: async (toolInput: unknown) => {
					const startedAt = Date.now();
					if (!reserveToolCall()) {
						await logToolInvocation({
							workspaceId: input.workspaceId,
							conversationId: input.conversationId,
							messageId: input.messageId,
							toolSource: "custom",
							toolId: customTool.id,
							toolName: customTool.name,
							riskLevel: binding.riskLevel,
							input: toolInput,
							status: "denied",
							latencyMs: Date.now() - startedAt,
							errorMessage: "Tool call limit reached",
						});
						return toolLimitReachedResult();
					}
					try {
						const output = await executeCustomToolWorkflow({
							workspaceId: input.workspaceId,
							userId: input.userId,
							customToolId: customTool.id,
							toolInput,
						});
						await logToolInvocation({
							workspaceId: input.workspaceId,
							conversationId: input.conversationId,
							messageId: input.messageId,
							toolSource: "custom",
							toolId: customTool.id,
							toolName: customTool.name,
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
							toolSource: "custom",
							toolId: customTool.id,
							toolName: customTool.name,
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

		if (binding.toolSource === "mcp") {
			const mcpContext = await getMcpBindingContext(
				input.agentVersionId,
				binding.toolId,
			);
			if (!mcpContext) continue;
			const mcpTool = mcpContext.tool;
			const requiresMcpApproval =
				input.requireApprovalForAllTools ||
				mcpContext.server.requireApproval ||
				mcpTool.requireApproval ||
				binding.requireApproval;

			const sanitizedName = mcpTool.name
				.replace(/[^a-zA-Z0-9_]/g, "_")
				.replace(/^_+|_+$/g, "");
			const toolKey = `mcp_${mcpTool.id.replace(/-/g, "_")}_${sanitizedName || "tool"}`;
			const schema = (mcpTool.inputSchemaJson as Record<
				string,
				unknown
			> | null) ?? {
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
					if (!reserveToolCall()) {
						await logToolInvocation({
							workspaceId: input.workspaceId,
							conversationId: input.conversationId,
							messageId: input.messageId,
							toolSource: "mcp",
							toolId: mcpTool.id,
							toolName: mcpTool.name,
							riskLevel: binding.riskLevel,
							input: toolInput,
							status: "denied",
							latencyMs: Date.now() - startedAt,
							errorMessage: "Tool call limit reached",
						});
						return toolLimitReachedResult();
					}
					if (requiresMcpApproval) {
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
				if (!reserveToolCall()) {
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
						errorMessage: "Tool call limit reached",
					});
					return toolLimitReachedResult();
				}
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

				if (input.requireApprovalForAllTools || binding.requireApproval) {
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

async function findUserMessageForResend(input: {
	conversationId: string;
	messageId: string;
	content: string;
}) {
	const [exactMatch] = await db
		.select()
		.from(messages)
		.where(
			and(
				eq(messages.id, input.messageId),
				eq(messages.conversationId, input.conversationId),
				eq(messages.role, "user"),
			),
		)
		.limit(1);

	if (exactMatch) return exactMatch;

	// Backward compatibility for messages created before the client synced
	// server-side user message IDs. Those client-side UUIDs are valid UUIDs
	// but do not exist in the database, so find the intended user message by
	// exact text content within this conversation.
	const userMessages = await db
		.select()
		.from(messages)
		.where(
			and(
				eq(messages.conversationId, input.conversationId),
				eq(messages.role, "user"),
			),
		)
		.orderBy(desc(messages.createdAt));

	for (const message of userMessages) {
		const parts = await db
			.select({
				type: messageParts.type,
				contentEncrypted: messageParts.contentEncrypted,
			})
			.from(messageParts)
			.where(eq(messageParts.messageId, message.id));
		const textParts: string[] = [];
		for (const part of parts) {
			if (part.type !== "text" || !part.contentEncrypted) continue;
			try {
				textParts.push(await decryptValue(part.contentEncrypted));
			} catch {
				// skip undecryptable legacy parts
			}
		}
		if (textParts.join("\n").trim() === input.content.trim()) {
			return message;
		}
	}

	return null;
}

async function isFirstUserMessageInConversation(
	conversationId: string,
	userMessageId: string,
) {
	const [firstUserMessage] = await db
		.select({ id: messages.id })
		.from(messages)
		.where(
			and(
				eq(messages.conversationId, conversationId),
				eq(messages.role, "user"),
			),
		)
		.orderBy(messages.createdAt)
		.limit(1);

	return firstUserMessage?.id === userMessageId;
}

function htmlArtifactCodeFromValue(value: unknown) {
	if (typeof value !== "object" || value === null) return null;
	const record = value as Record<string, unknown>;
	if (record.kind !== "html_artifact" && record.kind !== undefined) return null;
	const html = record.html;
	if (typeof html !== "string") return null;
	const source = {
		title: record.title,
		html,
		css: record.css,
		js: record.js,
		deck: record.deck,
	};

	const sections = [
		`Title: ${typeof source.title === "string" ? source.title : "Interactive preview"}`,
	];
	if (source.deck && typeof source.deck === "object") {
		sections.push("Deck JSON:", JSON.stringify(source.deck, null, 2));
	}
	sections.push(
		"HTML:",
		source.html,
		"CSS:",
		typeof source.css === "string" ? source.css : "",
		"JavaScript:",
		typeof source.js === "string" ? source.js : "",
	);
	return sections.join("\n");
}

function htmlArtifactCodeFromToolMetadata(metadata: unknown) {
	if (typeof metadata !== "object" || metadata === null) return null;
	const record = metadata as Record<string, unknown>;
	if (
		record.toolName !== "render_html_artifact" &&
		record.toolName !== "create_slide_deck"
	) {
		return null;
	}
	return (
		htmlArtifactCodeFromValue(record.input) ??
		htmlArtifactCodeFromValue(record.output)
	);
}

async function loadConversationHistory(
	conversationId: string,
	maxMessages?: number,
): Promise<ModelMessage[]> {
	const historyLimit =
		typeof maxMessages === "number" && maxMessages > 0
			? Math.floor(maxMessages)
			: null;
	const messageRows = historyLimit
		? (
				await db
					.select({
						id: messages.id,
						role: messages.role,
						createdAt: messages.createdAt,
					})
					.from(messages)
					.where(eq(messages.conversationId, conversationId))
					.orderBy(desc(messages.createdAt))
					.limit(historyLimit)
			).reverse()
		: await db
				.select({
					id: messages.id,
					role: messages.role,
					createdAt: messages.createdAt,
				})
				.from(messages)
				.where(eq(messages.conversationId, conversationId))
				.orderBy(messages.createdAt);

	const modelMessages: ModelMessage[] = [];
	const modelMessageRows = messageRows.filter(
		(message) => message.role === "user" || message.role === "assistant",
	);
	if (modelMessageRows.length === 0) return modelMessages;

	const partsByMessageId = new Map<
		string,
		Array<{
			messageId: string;
			type: string;
			contentEncrypted: string | null;
			metadataJson: unknown;
			sortOrder: number;
		}>
	>();
	const partRows = await db
		.select({
			messageId: messageParts.messageId,
			type: messageParts.type,
			contentEncrypted: messageParts.contentEncrypted,
			metadataJson: messageParts.metadataJson,
			sortOrder: messageParts.sortOrder,
		})
		.from(messageParts)
		.where(
			inArray(
				messageParts.messageId,
				modelMessageRows.map((message) => message.id),
			),
		)
		.orderBy(messageParts.messageId, messageParts.sortOrder);

	for (const part of partRows) {
		const existing = partsByMessageId.get(part.messageId);
		if (existing) {
			existing.push(part);
		} else {
			partsByMessageId.set(part.messageId, [part]);
		}
	}

	for (const message of modelMessageRows) {
		const textParts: string[] = [];
		const artifactCodeBlocks = new Set<string>();
		for (const part of partsByMessageId.get(message.id) ?? []) {
			if (part.type === "text" && part.contentEncrypted) {
				try {
					textParts.push(await decryptValue(part.contentEncrypted));
				} catch (error) {
					logger.warn("Skipping undecryptable message part", {
						messageId: message.id,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}

			if (message.role === "assistant") {
				const artifactCode = htmlArtifactCodeFromToolMetadata(
					part.metadataJson,
				);
				if (artifactCode) artifactCodeBlocks.add(artifactCode);
			}
		}

		for (const artifactCode of artifactCodeBlocks) {
			textParts.push(
				`Previously rendered HTML artifact code (available for follow-up edits or when the user asks for the code):\n${artifactCode}`,
			);
		}

		const content = textParts.join("\n").trim();
		if (content) {
			const role = message.role === "assistant" ? "assistant" : "user";
			modelMessages.push({ role, content });
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

		const {
			content,
			conversationId: existingConversationId,
			resendFromMessageId,
		} = parsed.data;

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
				{
					error: quota.message,
					code: "quota_exceeded",
					used: quota.used,
					limit: quota.limit,
				},
				{ status: 429 },
			);
		}

		let conversation: typeof conversations.$inferSelect | null = null;
		let createdConversation = false;
		if (existingConversationId) {
			const [existing] = await db
				.select()
				.from(conversations)
				.where(
					and(
						eq(conversations.id, existingConversationId),
						eq(conversations.workspaceId, agent.workspaceId),
						eq(conversations.userId, actorUserId),
						eq(conversations.status, "active"),
					),
				)
				.limit(1);
			conversation = existing ?? null;

			if (!conversation && resendFromMessageId) {
				return NextResponse.json(
					{ error: "Conversation not found" },
					{ status: 404 },
				);
			}
		}

		if (!conversation && resendFromMessageId) {
			return NextResponse.json(
				{ error: "Cannot resend without an existing conversation" },
				{ status: 400 },
			);
		}

		const version = await getActiveVersion(agentId);

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
			createdConversation = true;
		}

		// Existing conversations can reference archived/deleted versions; fail safely.
		if (version.agentId !== agentId) {
			return NextResponse.json(
				{ error: "Invalid conversation version" },
				{ status: 400 },
			);
		}

		let userMessage: typeof messages.$inferSelect;
		if (resendFromMessageId) {
			const existingUserMessage = await findUserMessageForResend({
				conversationId: conversation.id,
				messageId: resendFromMessageId,
				content,
			});

			if (!existingUserMessage) {
				return NextResponse.json(
					{ error: "Message not found" },
					{ status: 404 },
				);
			}

			const encryptedContent = await encryptValue(content);
			await db.transaction(async (tx) => {
				const messagesToReplace = await tx
					.select({ id: messages.id })
					.from(messages)
					.where(
						and(
							eq(messages.conversationId, conversation.id),
							ne(messages.id, existingUserMessage.id),
							gt(messages.createdAt, existingUserMessage.createdAt),
						),
					);
				const messageIdsToReplace = messagesToReplace.map(
					(message) => message.id,
				);
				if (messageIdsToReplace.length > 0) {
					await tx
						.delete(toolInvocations)
						.where(inArray(toolInvocations.messageId, messageIdsToReplace));
					await tx
						.delete(messages)
						.where(inArray(messages.id, messageIdsToReplace));
				}
				await tx
					.delete(messageParts)
					.where(eq(messageParts.messageId, existingUserMessage.id));
				await tx.insert(messageParts).values({
					messageId: existingUserMessage.id,
					type: "text",
					contentEncrypted: encryptedContent,
					sortOrder: 0,
				});
			});
			userMessage = existingUserMessage;
		} else {
			const encryptedContent = await encryptValue(content);
			const [newUserMessage] = await db
				.insert(messages)
				.values({
					conversationId: conversation.id,
					role: "user",
					status: "completed",
					completedAt: new Date(),
				})
				.returning();
			userMessage = newUserMessage;

			await db.insert(messageParts).values({
				messageId: newUserMessage.id,
				type: "text",
				contentEncrypted: encryptedContent,
				sortOrder: 0,
			});
		}
		userMessageId = userMessage.id;
		const shouldRegenerateConversationTitle =
			createdConversation ||
			(resendFromMessageId
				? await isFirstUserMessageInConversation(
						conversation.id,
						userMessage.id,
					)
				: false);

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
		const memoryPolicy = version.memoryPolicyJson as {
			enabled?: boolean;
			maxMessages?: number;
		} | null;
		const history = await loadConversationHistory(
			conversation.id,
			memoryPolicy?.enabled ? memoryPolicy.maxMessages : undefined,
		);

		const enqueueEvent = (event: Record<string, unknown>) =>
			publishChatStreamEvent(assistantMessage.id, event);

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

		const maxToolCalls = Math.max(
			0,
			Math.min(20, version.maxToolCalls ?? defaultMaxToolCalls),
		);
		const skillsPrompt =
			maxToolCalls > 0 ? await buildSkillsRegistryPrompt(version.id) : null;
		const approvalPolicy = version.approvalPolicyJson as {
			requireApprovalForAllTools?: boolean;
		} | null;
		const tools =
			maxToolCalls > 0
				? await buildBoundTools({
						agentVersionId: version.id,
						workspaceId: agent.workspaceId,
						conversationId: conversation.id,
						messageId: assistantMessage.id,
						userId: actorUserId,
						maxToolCalls,
						hasSkills: Boolean(skillsPrompt),
						requireApprovalForAllTools: Boolean(
							approvalPolicy?.requireApprovalForAllTools,
						),
						emitEvent: enqueueEvent,
						onApprovalRequired: (event) => {
							enqueueEvent({
								type: "tool_approval_required",
								invocationId: event.invocationId,
								toolName: event.toolName,
								input: event.input,
							});
						},
					})
				: {};
		const availableToolNames = Object.keys(tools);
		const versionToolChoice = version.toolChoice;
		const configuredToolChoice: "auto" | "required" | "none" | undefined =
			availableToolNames.length > 0
				? versionToolChoice === "required" || versionToolChoice === "none"
					? versionToolChoice
					: "auto"
				: undefined;
		const toolGuidance =
			availableToolNames.length > 0
				? [
						`Available tools are exactly: ${availableToolNames.join(", ")}.`,
						"Do not call tools that are not in that list.",
						availableToolNames.includes("web_search")
							? "For web or current-events searches, use web_search only."
							: null,
						availableToolNames.includes("create_slide_deck")
							? "When the user asks for slides, a deck, presentation, pitch deck, PDF slides, or follow-up edits to an existing deck, use create_slide_deck. It creates an interactive click-through HTML deck with print-to-PDF styling; explain briefly that PDF export is static because modern PDF viewers do not preserve JavaScript click animations."
							: null,
						availableToolNames.includes("render_html_artifact")
							? "When the user asks for a visual design, diagram, UI mockup, chart-like schema, or interactive demo that is not specifically a slide deck, use render_html_artifact with self-contained HTML, CSS, and optional JavaScript so it appears directly in the chat. The user can view and copy the code from the artifact card, so do not duplicate the full code in your final text unless explicitly asked."
							: null,
						`Use at most ${maxToolCalls} tool calls.`,
						"When that limit is reached, do not call another tool; answer the user from the tool results and context already available. If the information is incomplete, say what is known and what remains uncertain.",
					]
						.filter(Boolean)
						.join(" ")
				: null;

		const responseFormat = version.responseFormatJson as {
			type?: "text" | "json_object";
		} | null;
		const guardrails = version.guardrailsJson as {
			enabled?: boolean;
			blockedTopics?: string[];
		} | null;
		const responseFormatGuidance =
			responseFormat?.type === "json_object"
				? "Respond with a valid JSON object only. Do not include markdown fences or explanatory prose outside the JSON object."
				: null;
		const guardrailGuidance =
			guardrails?.enabled && guardrails.blockedTopics?.length
				? `Avoid and refuse requests about these blocked topics: ${guardrails.blockedTopics.join(", ")}.`
				: null;
		const localeCookie = (await cookies()).get("NEXT_LOCALE")?.value ?? "en";
		const systemPrompt = [
			version.systemPrompt?.trim() || fallbackSystemPrompt(localeCookie),
			skillsPrompt,
			responseFormatGuidance,
			guardrailGuidance,
			toolGuidance,
			ragContext
				? `Use the following knowledge base excerpts when relevant:\n\n${ragContext}`
				: null,
		]
			.filter(Boolean)
			.join("\n\n");
		const toolLimitFinalAnswerPrompt =
			"Tool call limit reached. Do not call another tool. Answer the user now using the available conversation context, knowledge excerpts, and tool results. If the available information is incomplete, clearly say what is known and what is uncertain.";
		const startedAt = Date.now();
		type StreamedAssistantPart =
			| {
					id: string;
					type: "text" | "reasoning" | "suggestions";
					content: string;
			  }
			| { id: string; type: "tool-call" | "tool-result"; metadata: unknown };
		const streamedParts: StreamedAssistantPart[] = [];
		let nextSortOrder = 0;

		async function appendStreamedTextPart(
			type: "text" | "reasoning",
			content: string,
		) {
			const lastPart = streamedParts.at(-1);
			if (lastPart?.type === type) {
				lastPart.content += content;
				await db
					.update(messageParts)
					.set({ contentEncrypted: await encryptValue(lastPart.content) })
					.where(eq(messageParts.id, lastPart.id));
				return;
			}
			const [inserted] = await db
				.insert(messageParts)
				.values({
					messageId: assistantMessage.id,
					type,
					contentEncrypted: await encryptValue(content),
					metadataJson: null,
					sortOrder: nextSortOrder,
				})
				.returning({ id: messageParts.id });
			nextSortOrder += 1;
			streamedParts.push({ id: inserted.id, type, content });
		}

		async function appendStreamedSuggestionsPart(suggestions: string[]) {
			const content = JSON.stringify(suggestions);
			const [inserted] = await db
				.insert(messageParts)
				.values({
					messageId: assistantMessage.id,
					type: "suggestions",
					contentEncrypted: await encryptValue(content),
					metadataJson: null,
					sortOrder: nextSortOrder,
				})
				.returning({ id: messageParts.id });
			nextSortOrder += 1;
			streamedParts.push({ id: inserted.id, type: "suggestions", content });
		}

		async function appendStreamedMetadataPart(
			type: "tool-call" | "tool-result",
			metadata: unknown,
		) {
			const [inserted] = await db
				.insert(messageParts)
				.values({
					messageId: assistantMessage.id,
					type,
					contentEncrypted: null,
					metadataJson: metadata,
					sortOrder: nextSortOrder,
				})
				.returning({ id: messageParts.id });
			nextSortOrder += 1;
			streamedParts.push({ id: inserted.id, type, metadata });
		}

		const streamAbortController = new AbortController();
		registerChatStreamAbortController(
			assistantMessage.id,
			streamAbortController,
		);

		const generationSettings = version.generationSettingsJson as {
			topK?: number;
			presencePenalty?: number;
			frequencyPenalty?: number;
			seed?: number;
			maxRetries?: number;
			stopSequences?: string[];
		} | null;
		const result = streamText({
			model,
			system: systemPrompt,
			abortSignal: streamAbortController.signal,
			messages: history,
			temperature: version.temperature
				? Number.parseFloat(version.temperature)
				: undefined,
			topP: version.topP ? Number.parseFloat(version.topP) : undefined,
			topK: generationSettings?.topK,
			presencePenalty: generationSettings?.presencePenalty,
			frequencyPenalty: generationSettings?.frequencyPenalty,
			seed: generationSettings?.seed,
			maxRetries: generationSettings?.maxRetries,
			stopSequences: generationSettings?.stopSequences?.length
				? generationSettings.stopSequences
				: undefined,
			maxOutputTokens: version.maxOutputTokens ?? defaultMaxOutputTokens,
			tools,
			toolChoice: configuredToolChoice,
			stopWhen: availableToolNames.length > 0 ? () => false : undefined,
			prepareStep:
				availableToolNames.length > 0
					? ({ steps }) => {
							const usedToolCalls = steps.reduce(
								(total, step) => total + step.toolCalls.length,
								0,
							);

							if (usedToolCalls < maxToolCalls) return undefined;

							return {
								activeTools: [],
								toolChoice: "none",
								system: `${systemPrompt}\n\n${toolLimitFinalAnswerPrompt}`,
							};
						}
					: undefined,
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

		void (async () => {
			try {
				for await (const part of result.fullStream) {
					if (part.type === "text-delta") {
						await appendStreamedTextPart("text", part.text);
						enqueueEvent({ type: "text", delta: part.text });
					} else if (part.type === "reasoning-delta") {
						await appendStreamedTextPart("reasoning", part.text);
						enqueueEvent({ type: "reasoning", delta: part.text });
					} else if (part.type === "tool-input-start") {
						enqueueEvent({
							type: "tool_input_start",
							toolCallId: part.id,
							toolName: part.toolName,
						});
					} else if (part.type === "tool-input-delta") {
						enqueueEvent({
							type: "tool_input_delta",
							toolCallId: part.id,
							delta: part.delta,
						});
					} else if (part.type === "tool-input-end") {
						enqueueEvent({
							type: "tool_input_end",
							toolCallId: part.id,
						});
					} else if (part.type === "tool-call") {
						await appendStreamedMetadataPart("tool-call", part);
						enqueueEvent({
							type: "tool_call",
							toolCallId: part.toolCallId,
							toolName: part.toolName,
							input: part.input,
						});
					} else if (part.type === "tool-result") {
						await appendStreamedMetadataPart("tool-result", part);
						enqueueEvent({
							type: "tool_result",
							toolCallId: part.toolCallId,
							toolName: part.toolName,
							output: part.output,
						});
					} else if (part.type === "error") {
						const error =
							part.error instanceof Error
								? part.error
								: new Error(String(part.error));
						enqueueEvent({
							type: "error",
							error: error.message,
						});
						throw error;
					}
				}

				const totalUsage = await result.totalUsage;
				const assistantText = streamedParts
					.flatMap((part) =>
						part.type === "text" && "content" in part ? [part.content] : [],
					)
					.join("\n")
					.trim();
				const shouldSkipSuggestions = consumeSkipNextChatSuggestions(
					conversation.id,
				);
				const artifacts = assistantText
					? await generateChatAutomationArtifacts({
							userMessage: content,
							assistantText,
							fallbackTitle: conversation.title,
							generateSuggestions: !shouldSkipSuggestions,
						})
					: { title: conversation.title, suggestions: [] };
				const generatedTitle = shouldRegenerateConversationTitle
					? artifacts.title
					: conversation.title;
				if (
					shouldRegenerateConversationTitle &&
					generatedTitle.trim() &&
					generatedTitle.trim() !== conversation.title.trim()
				) {
					enqueueEvent({ type: "conversation_title", title: generatedTitle });
				}
				if (artifacts.suggestions.length > 0) {
					await appendStreamedSuggestionsPart(artifacts.suggestions);
					enqueueEvent({
						type: "suggestions",
						suggestions: artifacts.suggestions,
					});
				}

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
					.set({
						agentId,
						agentVersionId: version.id,
						title: generatedTitle,
						updatedAt: new Date(),
					})
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
				enqueueEvent({ type: "done" });
			} catch (error) {
				if (streamAbortController.signal.aborted) {
					await db
						.update(messages)
						.set({ status: "completed", completedAt: new Date() })
						.where(eq(messages.id, assistantMessage.id));
					enqueueEvent({ type: "done", stopped: true });
				} else {
					await db
						.update(messages)
						.set({ status: "failed", completedAt: new Date() })
						.where(eq(messages.id, assistantMessage.id));
					enqueueEvent({
						type: "error",
						error: error instanceof Error ? error.message : String(error),
					});
				}
			} finally {
				completeChatStream(assistantMessage.id);
			}
		})();

		return createChatStreamResponse(assistantMessage.id, {
			"X-Conversation-Id": conversation.id,
			"X-Message-Id": assistantMessage.id,
			"X-User-Message-Id": userMessage.id,
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
			{
				error: "Internal server error",
				...(process.env.NODE_ENV !== "production" && error instanceof Error
					? { detail: error.message }
					: {}),
			},
			{ status: 500 },
		);
	}
}
