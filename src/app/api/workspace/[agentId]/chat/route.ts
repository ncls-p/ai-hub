import { and, desc, eq, gt, inArray, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { after, NextRequest, NextResponse } from "next/server";
import { fallbackSystemPrompt } from "@/lib/copy-defaults";
import { z } from "zod";
import { decryptValue, encryptValue } from "@/lib/crypto";
import { logHandledError, logHandledWarning } from "@/lib/logger";
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
import {
	completeChatStream,
	createChatStreamResponse,
	createChatUIMessageStreamResponse,
	publishChatStreamEvent,
	registerChatStreamAbortController,
} from "@/modules/chat/stream-bus";
import {
	getChatAttachment,
	getChatAttachmentExtractedText,
	getChatImageAttachmentBytes,
	isChatFileAttachment,
	isChatImageAttachment,
	maxChatAttachments,
	publicChatAttachment,
	type ChatAttachment,
} from "@/modules/chat/attachments";
import { generateChatAutomationArtifacts } from "@/modules/chat/automation";
import { consumeSkipNextChatSuggestions } from "@/modules/chat/suggestion-skip";
import {
	codeWorkspaceArtifact,
	createCodeWorkspaceFromFiles,
	getCodeWorkspace,
} from "@/modules/code-workspace/storage";
import { searchBoundKnowledgeBases } from "@/modules/knowledge/use-cases";
import {
	buildSkillsRegistryPrompt,
	loadBoundSkillContent,
} from "@/modules/skills/use-cases";
import { executeCustomToolWorkflow } from "@/modules/custom-tools/use-cases";
import { executeMcpTool } from "@/modules/mcp/executor";
import { assertWorkspaceWithinTokenQuota } from "@/modules/usage/quota";
import {
	getBuiltInTool,
	getBuiltInToolByName,
	requiresApproval,
} from "@/modules/tool/builtin-tools";
import {
	canExecuteRestrictedTool,
	getCustomBindingContext,
	getMcpBindingContext,
	getToolBindingsForVersion,
	logToolInvocation,
} from "@/modules/tool/use-cases";
import {
	decideToolApproval,
	type AiHubToolApprovalPolicy,
} from "@/modules/tool/approval-policy";
import { waitForApproval } from "@/modules/tool/invocation-state";
import { evaluateOpaToolApprovalPolicy } from "@/modules/tool/opa-approval-policy";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
	agents,
	conversations,
	messageParts,
	messages,
	toolInvocations,
} from "@/server/infrastructure/db/schema";
import { registerAiSdkDevTools } from "@/server/infrastructure/ai-sdk/devtools";
import { getAdapter } from "@/server/infrastructure/providers";
import {
	extractReasoningMiddleware,
	jsonSchema,
	ToolLoopAgent,
	wrapLanguageModel,
	type ModelMessage,
	type ToolApprovalConfiguration,
	type ToolSet,
} from "ai";

registerAiSdkDevTools();

const chatRequestSchema = z.object({
	content: z.string().trim().min(1).max(32_000),
	conversationId: z.uuid().nullable().optional(),
	resendFromMessageId: z.uuid().nullable().optional(),
	codeWorkspaceId: z.uuid().optional(),
	attachmentIds: z.array(z.uuid()).max(maxChatAttachments).optional(),
	imageAttachmentIds: z.array(z.uuid()).max(maxChatAttachments).optional(),
});

const defaultMaxToolCalls = 6;
const defaultMaxOutputTokens = 30_000;
const previousToolTextContextChars = 4_000;

type ToolApprovalRequiredEvent = {
	invocationId: string;
	toolName: string;
	input: unknown;
};

type BoundToolApprovalMetadata = {
	toolSource: "builtin" | "custom" | "mcp";
	toolName: string;
	riskLevel?: string | null;
	bindingRequiresApproval?: boolean;
	serverRequiresApproval?: boolean;
	toolRequiresApproval?: boolean;
};

const githubPublishToolNames = [
	"github_get_publish_status",
	"github_publish_code_workspace",
];

const codeWorkspaceEditToolNames = [
	"code_workspace_list_files",
	"code_workspace_read_file",
	"code_workspace_write_file",
	"code_workspace_replace_text",
	"code_workspace_delete_file",
	...githubPublishToolNames,
];

const codeWorkspaceCreateToolNames = [
	"code_workspace_create_project",
	...codeWorkspaceEditToolNames,
];

function streamToolCallId(part: unknown) {
	const record = part as Record<string, unknown>;
	return typeof record.toolCallId === "string"
		? record.toolCallId
		: typeof record.id === "string"
			? record.id
			: "";
}

function streamToolInputDelta(part: unknown) {
	const record = part as Record<string, unknown>;
	return typeof record.delta === "string"
		? record.delta
		: typeof record.inputTextDelta === "string"
			? record.inputTextDelta
			: "";
}

function shouldEnableCodeWorkspaceCreation(content: string) {
	const normalized = content.toLowerCase();
	const wantsBuild =
		/(cr[eé]e|g[eé]n[eè]re|fabrique|construis|build|create|make|code|develop|d[eé]veloppe|impl[eé]mente)/i.test(
			normalized,
		);
	const targetIsStaticWeb =
		/(html|css|javascript|\bjs\b|site web|website|landing page|page web|web app|app web|interface|frontend|maquette|demo|démo|preview|portfolio)/i.test(
			normalized,
		);
	return wantsBuild && targetIsStaticWeb;
}

function parseCodeWorkspaceFileFences(content: string) {
	const files: { path: string; content: string }[] = [];
	const fencePattern =
		/```[^\n`]*(?:path|file|filename)=(?:"([^"]+)"|'([^']+)'|([^\s`]+))[^\n`]*\n([\s\S]*?)```/g;
	for (const match of content.matchAll(fencePattern)) {
		const filePath = match[1] ?? match[2] ?? match[3];
		const fileContent = match[4] ?? "";
		if (!filePath) continue;
		files.push({
			path: filePath.trim(),
			content: fileContent.replace(/\n$/, ""),
		});
	}
	if (!files.some((file) => /\.html?$/i.test(file.path))) return null;
	return files;
}

async function buildBoundTools(input: {
	agentVersionId: string;
	workspaceId: string;
	conversationId: string;
	messageId: string;
	userId: string;
	maxToolCalls: number;
	autoCodeWorkspaceToolNames?: string[];
	approvalPolicy?: AiHubToolApprovalPolicy | null;
	hasSkills?: boolean;
	emitEvent?: (event: Record<string, unknown>) => void;
	onApprovalRequired?: (event: ToolApprovalRequiredEvent) => void;
}) {
	const bindings = await getToolBindingsForVersion(input.agentVersionId);
	const autoCodeWorkspaceToolNames = input.autoCodeWorkspaceToolNames ?? [];
	const boundBuiltinToolIds = new Set(
		bindings
			.filter((binding) => binding.toolSource === "builtin")
			.map((binding) => binding.toolId),
	);
	for (const toolName of autoCodeWorkspaceToolNames) {
		const definition = getBuiltInToolByName(toolName);
		if (!definition || boundBuiltinToolIds.has(definition.id)) continue;
		boundBuiltinToolIds.add(definition.id);
		bindings.push({
			id: definition.id,
			agentVersionId: input.agentVersionId,
			toolSource: "builtin",
			toolId: definition.id,
			requireApproval: requiresApproval(definition.riskLevel),
			riskLevel: definition.riskLevel,
			createdAt: new Date(),
		});
	}
	const tools: ToolSet = {};
	const toolApprovalMetadata = new Map<string, BoundToolApprovalMetadata>();
	let executedToolCallCount = 0;

	function registerToolApprovalMetadata(
		toolKey: string,
		metadata: BoundToolApprovalMetadata,
	) {
		toolApprovalMetadata.set(toolKey, metadata);
	}

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

	async function gateToolExecution(inputArgs: {
		startedAt: number;
		toolSource: "builtin" | "custom" | "mcp";
		toolId: string;
		toolName: string;
		riskLevel?: string | null;
		toolInput: unknown;
		bindingRequiresApproval?: boolean;
		serverRequiresApproval?: boolean;
		toolRequiresApproval?: boolean;
	}): Promise<{ status: "continue" } | { status: "return"; output: unknown }> {
		const decision =
			(await evaluateOpaToolApprovalPolicy({
				toolName: inputArgs.toolName,
				toolSource: inputArgs.toolSource,
				riskLevel: inputArgs.riskLevel,
				toolInput: inputArgs.toolInput,
				workspaceId: input.workspaceId,
				conversationId: input.conversationId,
				messageId: input.messageId,
				userId: input.userId,
				agentVersionId: input.agentVersionId,
			})) ??
			decideToolApproval({
				policy: input.approvalPolicy,
				toolName: inputArgs.toolName,
				toolSource: inputArgs.toolSource,
				riskLevel: inputArgs.riskLevel,
				bindingRequiresApproval: inputArgs.bindingRequiresApproval,
				serverRequiresApproval: inputArgs.serverRequiresApproval,
				toolRequiresApproval: inputArgs.toolRequiresApproval,
			});

		if (decision.status === "allow") return { status: "continue" };

		if (decision.status === "deny") {
			await logToolInvocation({
				workspaceId: input.workspaceId,
				conversationId: input.conversationId,
				messageId: input.messageId,
				toolSource: inputArgs.toolSource,
				toolId: inputArgs.toolId,
				toolName: inputArgs.toolName,
				riskLevel: inputArgs.riskLevel,
				input: inputArgs.toolInput,
				status: "denied",
				latencyMs: Date.now() - inputArgs.startedAt,
				errorMessage: decision.reason ?? "Tool denied by approval policy",
			});
			return {
				status: "return",
				output: {
					denied: true,
					message: decision.reason ?? "Tool denied by approval policy.",
				},
			};
		}

		const invocation = await logToolInvocation({
			workspaceId: input.workspaceId,
			conversationId: input.conversationId,
			messageId: input.messageId,
			toolSource: inputArgs.toolSource,
			toolId: inputArgs.toolId,
			toolName: inputArgs.toolName,
			riskLevel: inputArgs.riskLevel,
			input: inputArgs.toolInput,
			status: "awaiting_approval",
			latencyMs: Date.now() - inputArgs.startedAt,
		});

		input.onApprovalRequired?.({
			invocationId: invocation.id,
			toolName: inputArgs.toolName,
			input: inputArgs.toolInput,
		});

		const approvalResult = await waitForApproval(invocation.id);
		if (approvalResult.status === "success") {
			return { status: "return", output: approvalResult.output };
		}

		return {
			status: "return",
			output: {
				denied: true,
				invocationId: invocation.id,
				message: approvalResult.error ?? "Tool invocation was not approved.",
			},
		};
	}

	if (input.hasSkills) {
		registerToolApprovalMetadata("load_skill", {
			toolSource: "builtin",
			toolName: "load_skill",
			riskLevel: "low",
		});
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
			registerToolApprovalMetadata(toolKey, {
				toolSource: "custom",
				toolName: customTool.name,
				riskLevel: binding.riskLevel,
				bindingRequiresApproval: binding.requireApproval,
			});

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
					const gate = await gateToolExecution({
						startedAt,
						toolSource: "custom",
						toolId: customTool.id,
						toolName: customTool.name,
						riskLevel: binding.riskLevel,
						toolInput,
						bindingRequiresApproval: binding.requireApproval,
					});
					if (gate.status === "return") return gate.output;

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
			registerToolApprovalMetadata(toolKey, {
				toolSource: "mcp",
				toolName: mcpTool.name,
				riskLevel: binding.riskLevel,
				bindingRequiresApproval: binding.requireApproval,
				serverRequiresApproval: mcpContext.server.requireApproval,
				toolRequiresApproval: mcpTool.requireApproval,
			});

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
					const gate = await gateToolExecution({
						startedAt,
						toolSource: "mcp",
						toolId: mcpTool.id,
						toolName: mcpTool.name,
						riskLevel: binding.riskLevel,
						toolInput,
						bindingRequiresApproval: binding.requireApproval,
						serverRequiresApproval: mcpContext.server.requireApproval,
						toolRequiresApproval: mcpTool.requireApproval,
					});
					if (gate.status === "return") return gate.output;

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
		registerToolApprovalMetadata(definition.name, {
			toolSource: "builtin",
			toolName: definition.name,
			riskLevel: definition.riskLevel,
			bindingRequiresApproval: binding.requireApproval,
		});

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
					const canExecute =
						definition.name === "github_publish_code_workspace"
							? (
									await authorization.requirePermission(
										{ principalType: "user", principalId: input.userId },
										"agents.chat",
										"workspace",
										input.workspaceId,
									)
								).granted
							: await canExecuteRestrictedTool(input.userId, input.workspaceId);
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

				const gate = await gateToolExecution({
					startedAt,
					toolSource: "builtin",
					toolId: definition.id,
					toolName: definition.name,
					riskLevel: definition.riskLevel,
					toolInput,
					bindingRequiresApproval: binding.requireApproval,
				});
				if (gate.status === "return") return gate.output;

				try {
					const output = await definition.execute(toolInput as never, {
						workspaceId: input.workspaceId,
						userId: input.userId,
						conversationId: input.conversationId,
						messageId: input.messageId,
						emitEvent: input.emitEvent,
					});
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

	const toolApproval: ToolApprovalConfiguration<
		ToolSet,
		Record<string, unknown>
	> = async ({ toolCall }) => {
		const metadata = toolApprovalMetadata.get(toolCall.toolName);
		if (!metadata) return undefined;
		const decision =
			(await evaluateOpaToolApprovalPolicy({
				toolName: metadata.toolName,
				toolSource: metadata.toolSource,
				riskLevel: metadata.riskLevel,
				toolInput: toolCall.input,
				workspaceId: input.workspaceId,
				conversationId: input.conversationId,
				messageId: input.messageId,
				userId: input.userId,
				agentVersionId: input.agentVersionId,
			})) ??
			decideToolApproval({
				policy: input.approvalPolicy,
				...metadata,
			});
		// Keep human approvals in AI Hub's existing DB-audited, streaming approval
		// flow. Native AI SDK approval is used here for hard policy denials so the
		// model receives a standard denied tool output before execution can start.
		return decision.status === "deny" ? decision.aiSdkStatus : undefined;
	};

	return { tools, toolApproval };
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
	return (
		htmlArtifactCodeFromValue(record.input) ??
		htmlArtifactCodeFromValue(record.output)
	);
}

function sandboxAttachmentPathHint(fileName: string) {
	const baseName =
		fileName
			.replace(/\\/g, "/")
			.split("/")
			.pop()
			?.replace(/[^a-zA-Z0-9._ -]/g, "_")
			.replace(/^\.+/, "")
			.trim()
			.slice(0, 120) || "attachment.bin";
	return `attachments/${baseName}`;
}

function truncatePreviousToolContext(value: string) {
	const normalized = value.trim();
	if (normalized.length <= previousToolTextContextChars) return normalized;
	return `${normalized.slice(0, previousToolTextContextChars)}\n… truncated`;
}

function sandboxAttachmentContext(attachment: unknown) {
	if (!isChatFileAttachment(attachment) && !isChatImageAttachment(attachment)) {
		return null;
	}
	return [
		`Attachment ID: ${attachment.id}`,
		`file name: ${attachment.fileName}`,
		`sandbox path hint: ${sandboxAttachmentPathHint(attachment.fileName)}`,
	].join("; ");
}

function sandboxTextContext(label: string, value: unknown) {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed ? `${label}:\n${truncatePreviousToolContext(trimmed)}` : null;
}

function codeSandboxFileContextLine(file: unknown) {
	if (typeof file !== "object" || file === null) return null;
	const fileRecord = file as Record<string, unknown>;
	if (typeof fileRecord.path !== "string") return null;
	const details = [
		typeof fileRecord.mimeType === "string" ? fileRecord.mimeType : null,
		typeof fileRecord.size === "number" ? `${fileRecord.size} bytes` : null,
	]
		.filter(Boolean)
		.join(", ");
	const attachmentContext = sandboxAttachmentContext(fileRecord.attachment);
	return `- ${fileRecord.path}${details ? ` (${details})` : ""}${attachmentContext ? ` — ${attachmentContext}` : ""}`;
}

function codeSandboxFilesContext(files: unknown) {
	if (!Array.isArray(files) || files.length === 0) return [];
	const lines = files.slice(0, 12).flatMap((file) => {
		const line = codeSandboxFileContextLine(file);
		return line ? [line] : [];
	});
	if (files.length > 12) lines.push(`- … ${files.length - 12} more file(s)`);
	return lines.length > 0 ? ["Generated files:", ...lines] : [];
}

function codeSandboxContextFromValue(value: unknown) {
	if (typeof value !== "object" || value === null) return null;
	const record = value as Record<string, unknown>;
	if (record.kind !== "code_sandbox_result") return null;

	const lines = [
		`Previous code sandbox result (${typeof record.language === "string" ? record.language : "unknown"}, ${record.ok === false ? "failed" : "ok"}).`,
		"If the user asks to inspect or modify one of these generated files, call run_code_sandbox with its Attachment ID in the attachments array; do not ask the user to re-upload it.",
		sandboxTextContext("stdout", record.stdout),
		sandboxTextContext("stderr", record.stderr),
		...codeSandboxFilesContext(record.files),
	].filter(Boolean);

	return lines.join("\n");
}

function codeSandboxContextFromToolMetadata(metadata: unknown) {
	if (typeof metadata !== "object" || metadata === null) return null;
	const record = metadata as Record<string, unknown>;
	return (
		codeSandboxContextFromValue(record.output) ??
		codeSandboxContextFromValue(record)
	);
}

function codeWorkspaceContextFromValue(value: unknown) {
	if (typeof value !== "object" || value === null) return null;
	const record = value as Record<string, unknown>;
	if (record.kind !== "code_workspace_artifact") return null;
	if (typeof record.projectId !== "string") return null;
	const files = Array.isArray(record.files)
		? record.files
				.map((file) => {
					if (typeof file !== "object" || file === null) return null;
					const fileRecord = file as Record<string, unknown>;
					return typeof fileRecord.path === "string"
						? `- ${fileRecord.path}${fileRecord.binary ? " (asset)" : ""}`
						: null;
				})
				.filter(Boolean)
				.join("\n")
		: "";
	return [
		`Code workspace ID: ${record.projectId}`,
		`Title: ${typeof record.title === "string" ? record.title : "Code workspace"}`,
		`Preview entry: ${typeof record.rootFile === "string" ? record.rootFile : "none"}`,
		files ? `Files:\n${files}` : null,
	]
		.filter(Boolean)
		.join("\n");
}

function codeWorkspaceContextFromToolMetadata(metadata: unknown) {
	if (typeof metadata !== "object" || metadata === null) return null;
	const record = metadata as Record<string, unknown>;
	return (
		codeWorkspaceContextFromValue(record) ??
		codeWorkspaceContextFromValue(record.input) ??
		codeWorkspaceContextFromValue(record.output)
	);
}

async function loadConversationHistory(
	conversationId: string,
	context: { workspaceId: string; userId: string },
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
		const imageParts: Array<{
			type: "file";
			data: Uint8Array;
			mediaType: string;
			filename: string;
		}> = [];
		const artifactCodeBlocks = new Set<string>();
		for (const part of partsByMessageId.get(message.id) ?? []) {
			if (part.type === "file") {
				const imageAttachment = isChatImageAttachment(part.metadataJson)
					? part.metadataJson
					: null;
				const fileAttachment = isChatFileAttachment(part.metadataJson)
					? part.metadataJson
					: null;
				if (message.role === "user" && imageAttachment) {
					try {
						const attachment = await getChatImageAttachmentBytes({
							attachmentId: imageAttachment.id,
							workspaceId: context.workspaceId,
							userId: context.userId,
						});
						textParts.push(
							[
								`Attached image for visual analysis: ${attachment.metadata.fileName}`,
								`Attachment ID: ${imageAttachment.id}`,
								`MIME type: ${attachment.metadata.mimeType}`,
								`Sandbox path hint: ${sandboxAttachmentPathHint(imageAttachment.fileName)}`,
							].join("\n"),
						);
						imageParts.push({
							type: "file",
							data: attachment.bytes,
							mediaType: attachment.metadata.mimeType,
							filename: attachment.metadata.fileName,
						});
					} catch (error) {
						logHandledWarning("Skipping unavailable chat image attachment", {
							messageId: message.id,
							attachmentId: imageAttachment.id,
							error: error instanceof Error ? error.message : String(error),
						});
					}
				} else if (message.role === "user" && fileAttachment) {
					try {
						const { text } = await getChatAttachmentExtractedText({
							attachmentId: fileAttachment.id,
							workspaceId: context.workspaceId,
							userId: context.userId,
						});
						if (text.trim()) {
							textParts.push(
								[
									`Attached file: ${fileAttachment.fileName} (${fileAttachment.mimeType}, ${fileAttachment.size} bytes).`,
									`Attachment ID: ${fileAttachment.id}`,
									`Sandbox path hint: ${sandboxAttachmentPathHint(fileAttachment.fileName)}`,
									fileAttachment.extractionStatus === "truncated"
										? "The extracted text was truncated for safety."
										: null,
									"Extracted file text:",
									text,
								]
									.filter(Boolean)
									.join("\n"),
							);
						} else {
							textParts.push(
								[
									`Attached file: ${fileAttachment.fileName} (${fileAttachment.mimeType}, ${fileAttachment.size} bytes).`,
									`Attachment ID: ${fileAttachment.id}`,
									`Sandbox path hint: ${sandboxAttachmentPathHint(fileAttachment.fileName)}`,
									fileAttachment.extractionMessage ??
										"No readable text was extracted.",
								].join("\n"),
							);
						}
					} catch (error) {
						logHandledWarning("Skipping unavailable chat file attachment", {
							messageId: message.id,
							attachmentId: fileAttachment.id,
							error: error instanceof Error ? error.message : String(error),
						});
					}
				}

				const codeWorkspaceContext = codeWorkspaceContextFromToolMetadata(
					part.metadataJson,
				);
				if (codeWorkspaceContext) {
					textParts.push(
						`Uploaded code workspace available in chat:\n${codeWorkspaceContext}`,
					);
				}
			}

			if (part.type === "text" && part.contentEncrypted) {
				try {
					textParts.push(await decryptValue(part.contentEncrypted));
				} catch (error) {
					logHandledWarning("Skipping undecryptable message part", {
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
				const codeWorkspaceContext = codeWorkspaceContextFromToolMetadata(
					part.metadataJson,
				);
				if (codeWorkspaceContext) {
					artifactCodeBlocks.add(
						`Previously updated code workspace:\n${codeWorkspaceContext}`,
					);
				}
				const codeSandboxContext = codeSandboxContextFromToolMetadata(
					part.metadataJson,
				);
				if (codeSandboxContext) {
					textParts.push(
						`Previously generated code sandbox output available for follow-up:\n${codeSandboxContext}`,
					);
				}
			}
		}

		for (const artifactCode of artifactCodeBlocks) {
			textParts.push(
				`Previously rendered HTML artifact code (available for follow-up edits or when the user asks for the code):\n${artifactCode}`,
			);
		}

		const content = textParts.join("\n").trim();
		if (message.role === "user" && imageParts.length > 0) {
			modelMessages.push({
				role: "user",
				content: [
					...(content ? [{ type: "text" as const, text: content }] : []),
					...imageParts,
				],
			});
			continue;
		}
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
			codeWorkspaceId,
			attachmentIds = [],
			imageAttachmentIds = [],
		} = parsed.data;
		const streamProtocol =
			req.headers.get("X-AI-Hub-Stream-Protocol") ??
			req.nextUrl.searchParams.get("streamProtocol");
		const useAiSdkUIStream = streamProtocol === "ai-sdk-ui";

		const [agent] = await db
			.select()
			.from(agents)
			.where(eq(agents.id, agentId))
			.limit(1);

		if (!agent) {
			return NextResponse.json({ error: "Agent not found" }, { status: 404 });
		}
		if (!canUseAgent(agent, actorUserId)) {
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

		let codeWorkspaceAttachment: ReturnType<
			typeof codeWorkspaceArtifact
		> | null = null;
		const messageAttachments: ChatAttachment[] = [];
		if (codeWorkspaceId) {
			const metadata = await getCodeWorkspace(codeWorkspaceId);
			if (
				metadata.workspaceId !== agent.workspaceId ||
				metadata.createdByUserId !== actorUserId
			) {
				return NextResponse.json(
					{ error: "Code workspace not found" },
					{ status: 404 },
				);
			}
			codeWorkspaceAttachment = codeWorkspaceArtifact(
				metadata,
				"Uploaded ZIP workspace.",
			);
		}
		const requestedAttachmentIds = Array.from(
			new Set([...attachmentIds, ...imageAttachmentIds]),
		);
		for (const attachmentId of requestedAttachmentIds) {
			const metadata = await getChatAttachment(attachmentId);
			if (
				metadata.workspaceId !== agent.workspaceId ||
				metadata.createdByUserId !== actorUserId
			) {
				return NextResponse.json(
					{ error: "Attachment not found" },
					{ status: 404 },
				);
			}
			messageAttachments.push(publicChatAttachment(metadata));
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
				const userFileParts = [
					...(codeWorkspaceAttachment ? [codeWorkspaceAttachment] : []),
					...messageAttachments,
				];
				for (const [index, metadata] of userFileParts.entries()) {
					await tx.insert(messageParts).values({
						messageId: existingUserMessage.id,
						type: "file",
						metadataJson: metadata,
						sortOrder: index + 1,
					});
				}
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
			const chatAttachments = messageAttachments;
			const userFileParts = [
				...(codeWorkspaceAttachment ? [codeWorkspaceAttachment] : []),
				...chatAttachments,
			];
			for (const [index, metadata] of userFileParts.entries()) {
				await db.insert(messageParts).values({
					messageId: newUserMessage.id,
					type: "file",
					metadataJson: metadata,
					sortOrder: index + 1,
				});
			}
		}
		userMessageId = userMessage.id;
		await db
			.update(conversations)
			.set({ updatedAt: new Date(), sidebarOrder: null })
			.where(eq(conversations.id, conversation.id));
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
			{ workspaceId: agent.workspaceId, userId: actorUserId },
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
		const wantsCodeWorkspaceCreation =
			!codeWorkspaceAttachment && shouldEnableCodeWorkspaceCreation(content);
		const shouldUseToolCalling =
			maxToolCalls > 0 && !wantsCodeWorkspaceCreation;
		const autoCodeWorkspaceToolNames = codeWorkspaceAttachment
			? codeWorkspaceEditToolNames
			: [];
		const skillsPrompt = shouldUseToolCalling
			? await buildSkillsRegistryPrompt(version.id)
			: null;
		const approvalPolicy =
			(version.approvalPolicyJson as AiHubToolApprovalPolicy | null) ?? null;
		const boundToolConfig = shouldUseToolCalling
			? await buildBoundTools({
					agentVersionId: version.id,
					workspaceId: agent.workspaceId,
					conversationId: conversation.id,
					messageId: assistantMessage.id,
					userId: actorUserId,
					maxToolCalls,
					autoCodeWorkspaceToolNames,
					hasSkills: Boolean(skillsPrompt),
					approvalPolicy,
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
			: { tools: {}, toolApproval: undefined };
		const tools: ToolSet = boundToolConfig.tools;
		const availableToolNames = Object.keys(tools);
		const versionToolChoice = version.toolChoice;
		const configuredToolChoice: "auto" | "required" | "none" | undefined =
			availableToolNames.length > 0
				? versionToolChoice === "required" || versionToolChoice === "none"
					? versionToolChoice
					: "auto"
				: undefined;
		const businessArtifactToolNames = [
			"create_business_document",
			"create_spreadsheet",
			"create_meeting_brief",
			"create_action_plan",
			"create_decision_matrix",
			"create_email_pack",
			"create_project_status_report",
			"create_risk_register",
			"create_raci_matrix",
			"create_customer_account_plan",
			"create_competitive_battlecard",
		];
		const codeWorkspaceToolNames = codeWorkspaceCreateToolNames;
		const hasBusinessArtifactTools = businessArtifactToolNames.some((name) =>
			availableToolNames.includes(name),
		);
		const hasCodeWorkspaceTools = codeWorkspaceToolNames.some((name) =>
			availableToolNames.includes(name),
		);
		const toolGuidance =
			availableToolNames.length > 0
				? [
						`Available tools are exactly: ${availableToolNames.join(", ")}.`,
						"Do not call tools that are not in that list. If you decide to call a tool, output only the tool call for that assistant turn: no prose, no markdown, no explanation, and no visible reasoning before or after the tool call.",
						availableToolNames.includes("web_search")
							? "For web or current-events searches, use web_search only."
							: null,
						availableToolNames.includes("create_slide_deck")
							? "When the user asks for slides, a deck, presentation, pitch deck, PDF slides, or follow-up edits to an existing deck, use create_slide_deck. It creates an interactive click-through HTML deck with print-to-PDF styling; explain briefly that PDF export is static because modern PDF viewers do not preserve JavaScript click animations."
							: null,
						hasBusinessArtifactTools
							? "For common business deliverables, prefer the dedicated artifact tools instead of plain prose: create_business_document for briefs/reports/proposals/policies/SOPs, create_spreadsheet for structured tables, create_meeting_brief for agendas/minutes/action items, create_action_plan for phased execution plans, create_decision_matrix for option comparisons, create_email_pack for professional email drafts, create_project_status_report for steering updates, create_risk_register for risk tracking, create_raci_matrix for role clarity, create_customer_account_plan for sales/account strategy, and create_competitive_battlecard for competitive sales enablement."
							: null,
						availableToolNames.includes("render_html_artifact")
							? "When the user asks for a visual design, diagram, UI mockup, chart-like schema, or interactive demo that is not specifically a slide deck, use render_html_artifact with self-contained HTML, CSS, and optional JavaScript so it appears directly in the chat. The user can view and copy the code from the artifact card, so do not duplicate the full code in your final text unless explicitly asked."
							: null,
						availableToolNames.includes("run_code_sandbox")
							? "Use run_code_sandbox when the user asks you to execute Python, Node.js, or Bash; verify a calculation with code; inspect data; interact with uploaded documents; transform text/files; download public web assets; or produce computed results. The sandbox is wiped after each run, has internet access, includes broad data/science/office/media libraries, runs in an isolated container with resource limits, and returns stdout/stderr plus generated file previews. If the user uploaded a document or image and you need programmatic access to the original bytes, pass its Attachment ID in attachments, optionally with the path hint shown in context; readable documents also get a .extracted.txt sidecar in the sandbox. Generated files are persisted as downloadable chat attachments when possible; reference the returned downloadUrl or tell the user to use the generated file card instead of inventing links. Print or write the values you need returned; do not assume files persist between runs. You may write outputs to /workspace or /mnt/data; /mnt/data is mapped to the returned workspace files."
							: null,
						hasCodeWorkspaceTools
							? "For static HTML/CSS/JS apps, keep the whole workflow in chat. If the user asks you to build a small website/app/demo from scratch, first use code_workspace_create_project with only short starter files or just file paths such as index.html, styles.css, and script.js, then fill or revise files one at a time with code_workspace_write_file or code_workspace_replace_text. Avoid one huge create_project call containing all final code. If the user uploaded a ZIP/code workspace, use code_workspace_list_files to inspect it, code_workspace_read_file before editing, code_workspace_replace_text for targeted edits, and code_workspace_write_file only when full-file replacement is safer. These tools return a live code workspace artifact with preview and ZIP download; do not paste full files unless asked. If the user wants to publish to GitHub, use github_get_publish_status to check the current user's connected repositories or get the connect URL. For GitHub publishing, the user must choose the repository, target branch, and mode: pull_request or direct_push. Use github_publish_code_workspace only after the user explicitly confirms those choices; direct_push requires confirmDirectPush=true and can target main only if the user explicitly selected main."
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
		const codeWorkspaceTextProtocolGuidance = wantsCodeWorkspaceCreation
			? 'The user wants a static HTML/CSS/JS code workspace. Do not call tools for this request. Generate the project files as markdown code fences with a path attribute so the app can turn them into a live workspace automatically. Use exactly this shape for each file: ```html path="index.html"\n...\n```, ```css path="styles.css"\n...\n```, and ```js path="script.js"\n...\n```. Include one HTML entry file. Keep prose short.'
			: null;
		const localeCookie = (await cookies()).get("NEXT_LOCALE")?.value ?? "en";
		const systemPrompt = [
			version.systemPrompt?.trim() || fallbackSystemPrompt(localeCookie),
			skillsPrompt,
			responseFormatGuidance,
			guardrailGuidance,
			codeWorkspaceTextProtocolGuidance,
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
			| {
					id: string;
					type: "tool-call" | "tool-result" | "file";
					metadata: unknown;
			  };
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
			type: "tool-call" | "tool-result" | "file",
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

		const postCompletionAutomationRef: {
			current: (() => Promise<void>) | null;
		} = { current: null };
		after(async () => {
			const job = postCompletionAutomationRef.current;
			if (!job) return;
			try {
				await job();
			} catch (error) {
				logHandledWarning("Failed to run chat post-processing", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		});

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
		const runtimeAgent = new ToolLoopAgent({
			id: version.id,
			model,
			instructions: systemPrompt,
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
			toolApproval: boundToolConfig.toolApproval,
			toolOrder: availableToolNames,
			runtimeContext: {
				workspaceId: agent.workspaceId,
				userId: actorUserId,
				agentId,
				agentVersionId: version.id,
				conversationId: conversation.id,
			},
			telemetry: {
				functionId: "ai-hub.chat",
				recordInputs: process.env.AI_SDK_TELEMETRY_RECORD_INPUTS === "true",
				recordOutputs: process.env.AI_SDK_TELEMETRY_RECORD_OUTPUTS === "true",
				includeRuntimeContext: {
					workspaceId: true,
					userId: true,
					agentId: true,
					agentVersionId: true,
					conversationId: true,
				},
			},
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
								instructions: `${systemPrompt}\n\n${toolLimitFinalAnswerPrompt}`,
							};
						}
					: undefined,
		});
		const result = await runtimeAgent.stream({
			abortSignal: streamAbortController.signal,
			messages: history,
		});

		void (async () => {
			try {
				for await (const part of result.stream) {
					if (part.type === "text-delta") {
						await appendStreamedTextPart("text", part.text);
						enqueueEvent({ type: "text", delta: part.text });
					} else if (part.type === "reasoning-delta") {
						await appendStreamedTextPart("reasoning", part.text);
						enqueueEvent({ type: "reasoning", delta: part.text });
					} else if (part.type === "tool-input-start") {
						const toolCallId = streamToolCallId(part);
						if (toolCallId) {
							enqueueEvent({
								type: "tool_input_start",
								toolCallId,
								toolName: part.toolName,
							});
						}
					} else if (part.type === "tool-input-delta") {
						const toolCallId = streamToolCallId(part);
						const delta = streamToolInputDelta(part);
						if (toolCallId && delta) {
							enqueueEvent({
								type: "tool_input_delta",
								toolCallId,
								delta,
							});
						}
					} else if (part.type === "tool-input-end") {
						const toolCallId = streamToolCallId(part);
						if (toolCallId) {
							enqueueEvent({
								type: "tool_input_end",
								toolCallId,
							});
						}
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

				const totalUsage = await result.usage;
				const assistantText = streamedParts
					.flatMap((part) =>
						part.type === "text" && "content" in part ? [part.content] : [],
					)
					.join("\n")
					.trim();
				if (wantsCodeWorkspaceCreation) {
					const generatedFiles = parseCodeWorkspaceFileFences(assistantText);
					if (generatedFiles) {
						const artifact = await createCodeWorkspaceFromFiles({
							workspaceId: agent.workspaceId,
							userId: actorUserId,
							title: conversation.title || "Generated code workspace",
							files: generatedFiles,
						});
						await appendStreamedMetadataPart("file", artifact);
						enqueueEvent({ type: "file", artifact });
					}
				}
				postCompletionAutomationRef.current = async () => {
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
					if (artifacts.suggestions.length > 0) {
						await appendStreamedSuggestionsPart(artifacts.suggestions);
					}
					if (
						shouldRegenerateConversationTitle &&
						generatedTitle.trim() &&
						generatedTitle.trim() !== conversation.title.trim()
					) {
						await db
							.update(conversations)
							.set({ title: generatedTitle, updatedAt: new Date() })
							.where(eq(conversations.id, conversation.id));
					}
				};

				const completedAt = new Date();
				await db
					.update(messages)
					.set({
						status: "completed",
						tokenInput: totalUsage.inputTokens,
						tokenOutput: totalUsage.outputTokens,
						completedAt,
					})
					.where(eq(messages.id, assistantMessage.id));

				await db
					.update(conversations)
					.set({
						agentId,
						agentVersionId: version.id,
						sidebarOrder: null,
						updatedAt: completedAt,
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
					logHandledError("Chat stream failed", {}, error as Error);
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
					enqueueEvent({
						type: "error",
						error: error instanceof Error ? error.message : String(error),
					});
				}
			} finally {
				completeChatStream(assistantMessage.id);
			}
		})();

		const streamHeaders = {
			"X-Conversation-Id": conversation.id,
			"X-Message-Id": assistantMessage.id,
			"X-User-Message-Id": userMessage.id,
		};

		return useAiSdkUIStream
			? createChatUIMessageStreamResponse(assistantMessage.id, streamHeaders)
			: createChatStreamResponse(assistantMessage.id, streamHeaders);
	} catch (error) {
		logHandledError("Chat request failed", {}, error as Error);

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
