import { and, eq, gt, inArray, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { after, NextRequest, NextResponse } from "next/server";
import { fallbackSystemPrompt } from "@/lib/copy-defaults";
import { encryptValue } from "@/lib/crypto";
import { logger, logHandledError, logHandledWarning } from "@/lib/logger";
import { requireWorkspacePermissionAsync } from "@/lib/route-handler";
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
	publicChatAttachment,
	type ChatAttachment,
} from "@/modules/chat/attachments";
import { generateChatAutomationArtifacts } from "@/modules/chat/automation";
import { consumeSkipNextChatSuggestions } from "@/modules/chat/suggestion-skip";
import {
	codeWorkspaceArtifact,
	getCodeWorkspace,
} from "@/modules/code-workspace/storage";
import { searchBoundKnowledgeBases } from "@/modules/knowledge/use-cases";
import { buildSkillsRegistryPrompt } from "@/modules/skills/use-cases";
import { assertWorkspaceWithinTokenQuota } from "@/modules/usage/quota";
import type { AiHubToolApprovalPolicy } from "@/modules/tool/approval-policy";
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
	ToolLoopAgent,
	wrapLanguageModel,
	type ToolSet,
} from "ai";

registerAiSdkDevTools();
import {
	buildBoundTools,
	chatRequestSchema,
	codeWorkspaceCreateToolNames,
	defaultMaxOutputTokens,
	defaultMaxToolCalls,
	findUserMessageForResend,
	isFirstUserMessageInConversation,
	streamToolCallId,
	streamToolInputDelta,
} from "./route-support";
import { loadConversationHistory } from "./route-history";

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ agentId: string }> },
) {
	const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
	const requestStartedAt = Date.now();
	const jsonResponse = (body: unknown, status: number) =>
		NextResponse.json(body, {
			status,
			headers: { "x-request-id": requestId },
		});
	const rejectChatRequest = (
		status: number,
		reason: string,
		body: unknown,
		context: Record<string, unknown> = {},
	) => {
		logger.warn("Chat request rejected", {
			requestId,
			status,
			reason,
			durationMs: Date.now() - requestStartedAt,
			...context,
		});
		return jsonResponse(body, status);
	};
	let userMessageId: string | undefined;
	let assistantMessageId: string | undefined;

	try {
		const auth = await resolveAuthContext();
		if (!auth) {
			return rejectChatRequest(401, "no_session", { error: "Unauthorized" });
		}
		const actorUserId = getActorUserId(auth);

		const { agentId } = await params;
		const parsed = chatRequestSchema.safeParse(await req.json());
		if (!parsed.success) {
			return rejectChatRequest(
				400,
				"invalid_input",
				{ error: "Invalid input", details: parsed.error.issues },
				{ agentId, userId: actorUserId, issues: parsed.error.issues.length },
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
			return rejectChatRequest(
				404,
				"agent_not_found",
				{ error: "Agent not found" },
				{ agentId, userId: actorUserId },
			);
		}
		if (!canUseAgent(agent, actorUserId)) {
			return rejectChatRequest(
				404,
				"agent_not_available_for_user",
				{ error: "Agent not found" },
				{ agentId, userId: actorUserId, workspaceId: agent.workspaceId },
			);
		}
		if (auth.type === "api_key" && auth.workspaceId !== agent.workspaceId) {
			return rejectChatRequest(
				403,
				"api_key_workspace_mismatch",
				{ error: "Forbidden" },
				{ agentId, userId: actorUserId, workspaceId: agent.workspaceId },
			);
		}

		const forbidden = await requireWorkspacePermissionAsync(
			actorUserId,
			agent.workspaceId,
			"agents.chat",
		);
		if (forbidden) {
			logger.warn("Chat request rejected", {
				requestId,
				status: forbidden.status,
				reason: "missing_workspace_permission",
				agentId,
				workspaceId: agent.workspaceId,
				userId: actorUserId,
				durationMs: Date.now() - requestStartedAt,
			});
			forbidden.headers.set("x-request-id", requestId);
			return forbidden;
		}

		const quota = await assertWorkspaceWithinTokenQuota(agent.workspaceId);
		if (!quota.allowed) {
			return rejectChatRequest(
				429,
				"quota_exceeded",
				{
					error: quota.message,
					code: "quota_exceeded",
					used: quota.used,
					limit: quota.limit,
				},
				{ agentId, workspaceId: agent.workspaceId, userId: actorUserId },
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
				return rejectChatRequest(
					404,
					"code_workspace_not_found",
					{ error: "Code workspace not found" },
					{
						agentId,
						workspaceId: agent.workspaceId,
						userId: actorUserId,
						codeWorkspaceId,
					},
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
				return rejectChatRequest(
					404,
					"attachment_not_found",
					{ error: "Attachment not found" },
					{
						agentId,
						workspaceId: agent.workspaceId,
						userId: actorUserId,
						attachmentId,
					},
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
				return rejectChatRequest(
					404,
					"conversation_not_found",
					{ error: "Conversation not found" },
					{
						agentId,
						workspaceId: agent.workspaceId,
						userId: actorUserId,
						conversationId: existingConversationId,
						resendFromMessageId,
					},
				);
			}
		}

		if (!conversation && resendFromMessageId) {
			return rejectChatRequest(
				400,
				"resend_without_conversation",
				{ error: "Cannot resend without an existing conversation" },
				{
					agentId,
					workspaceId: agent.workspaceId,
					userId: actorUserId,
					resendFromMessageId,
				},
			);
		}

		const version = await getActiveVersion(agentId);

		if (!version) {
			return rejectChatRequest(
				400,
				"no_active_agent_version",
				{ error: "No active agent version configured" },
				{ agentId, workspaceId: agent.workspaceId, userId: actorUserId },
			);
		}

		const providerConfig = await resolveProviderForVersion(version);
		if (!providerConfig || !providerConfig.modelId) {
			return rejectChatRequest(
				400,
				"no_provider_model",
				{ error: "No provider model configured for this agent version" },
				{
					agentId,
					workspaceId: agent.workspaceId,
					userId: actorUserId,
					agentVersionId: version.id,
				},
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
			return rejectChatRequest(
				400,
				"invalid_conversation_version",
				{ error: "Invalid conversation version" },
				{
					agentId,
					workspaceId: agent.workspaceId,
					userId: actorUserId,
					agentVersionId: version.id,
					conversationId: conversation.id,
				},
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
				return rejectChatRequest(
					404,
					"message_not_found_for_resend",
					{ error: "Message not found" },
					{
						agentId,
						workspaceId: agent.workspaceId,
						userId: actorUserId,
						conversationId: conversation.id,
						resendFromMessageId,
					},
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
			userId: actorUserId,
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
		const shouldUseToolCalling = maxToolCalls > 0;
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
		logger.info("Chat request accepted", {
			requestId,
			agentId,
			agentVersionId: version.id,
			workspaceId: agent.workspaceId,
			userId: actorUserId,
			conversationId: conversation.id,
			assistantMessageId: assistantMessage.id,
			userMessageId: userMessage.id,
			createdConversation,
			streamProtocol: useAiSdkUIStream ? "ai-sdk-ui" : "data-stream",
			attachmentCount: messageAttachments.length,
			hasCodeWorkspaceAttachment: Boolean(codeWorkspaceAttachment),
			knowledgeHitCount: citations.length,
			toolCount: availableToolNames.length,
			maxToolCalls,
			durationMs: Date.now() - requestStartedAt,
		});
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
							? "Use run_code_sandbox when the user asks you to execute Python, Node.js, or Bash; verify a calculation with code; inspect data; interact with uploaded documents; transform text/files; or produce computed results. The sandbox is wiped after each run, has no internet access, includes broad data/science/document libraries, runs in an isolated container with resource limits, and returns stdout/stderr plus generated file previews. If the user uploaded a document or image and you need programmatic access to the original bytes, pass its Attachment ID in attachments, optionally with the path hint shown in context; readable documents also get a .extracted.txt sidecar in the sandbox. Generated files are persisted as downloadable chat attachments when possible; reference the returned downloadUrl or tell the user to use the generated file card instead of inventing links. Print or write the values you need returned; do not assume files persist between runs. Write outputs as relative paths in the current working directory so they can be collected."
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
				logger.info("Chat stream completed", {
					requestId,
					agentId,
					agentVersionId: version.id,
					workspaceId: agent.workspaceId,
					userId: actorUserId,
					conversationId: conversation.id,
					assistantMessageId: assistantMessage.id,
					inputTokens: totalUsage.inputTokens,
					outputTokens: totalUsage.outputTokens,
					latencyMs: Date.now() - startedAt,
				});
				enqueueEvent({ type: "done" });
			} catch (error) {
				if (streamAbortController.signal.aborted) {
					await db
						.update(messages)
						.set({ status: "completed", completedAt: new Date() })
						.where(eq(messages.id, assistantMessage.id));
					logger.info("Chat stream aborted by client", {
						requestId,
						agentId,
						agentVersionId: version.id,
						workspaceId: agent.workspaceId,
						userId: actorUserId,
						conversationId: conversation.id,
						assistantMessageId: assistantMessage.id,
						latencyMs: Date.now() - startedAt,
					});
					enqueueEvent({ type: "done", stopped: true });
				} else {
					// Chat stream failed — message already marked failed below
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
					logHandledError(
						"Chat stream failed",
						{
							requestId,
							agentId,
							agentVersionId: version.id,
							workspaceId: agent.workspaceId,
							userId: actorUserId,
							conversationId: conversation.id,
							assistantMessageId: assistantMessage.id,
							latencyMs: Date.now() - startedAt,
						},
						error as Error,
					);
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
			"X-Request-Id": requestId,
		};

		return useAiSdkUIStream
			? createChatUIMessageStreamResponse(assistantMessage.id, streamHeaders)
			: createChatStreamResponse(assistantMessage.id, streamHeaders);
	} catch (error) {
		// Chat request failed — messages marked failed below

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

		logHandledError(
			"Chat request failed",
			{
				requestId,
				status: 500,
				userMessageId,
				assistantMessageId,
				durationMs: Date.now() - requestStartedAt,
			},
			error as Error,
		);

		return jsonResponse(
			{
				error: "Internal server error",
				...(process.env.NODE_ENV !== "production" && error instanceof Error
					? { detail: error.message }
					: {}),
			},
			500,
		);
	}
}
