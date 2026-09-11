import { fallbackSystemPrompt } from "@/lib/copy-defaults";
import { logger } from "@/lib/logger";
import { resolveAgentRuntimeLimits } from "@/modules/agent/runtime-policy";
import type { ChatAttachment } from "@/modules/chat/attachments";
import { isChatFileAttachment } from "@/modules/chat/attachments";
import { buildConversationAttachmentContext } from "@/modules/chat/conversation-attachment-context";
import {
  buildSkillsRegistryPrompt,
  listAgentSkills,
} from "@/modules/skills/use-cases";
import type { AiHubToolApprovalPolicy } from "@/modules/tool/approval-policy";
import type { ToolSet } from "ai";
import { cookies } from "next/headers";

import {
  buildBoundTools,
  codeWorkspaceCreateToolNames,
  defaultMaxToolCalls,
  KNOWLEDGE_CONTEXT_TOOL_NAME,
  KNOWLEDGE_SEARCH_TOOL_NAME,
} from "./route-support";
import type { ChatExecutionContext } from "./route.execution-context";

export async function prepareStandardChatConfig(input: {
  context: ChatExecutionContext;
  messageAttachments: ChatAttachment[];
  createdConversation: boolean;
  hasCodeWorkspaceAttachment: boolean;
  requestStartedAt: number;
  enqueueEvent: (event: Record<string, unknown>) => void;
}) {
  const { context } = input;
  const {
    version,
    capabilityOverrides,
    agent,
    conversation,
    assistantMessage,
    actorUserId,
    requestId,
    agentId,
    userMessage,
    history,
    availableAttachments,
    useAiSdkUIStream,
  } = context;
  const { maxToolCalls, maxOutputTokens, maxSteps } = resolveAgentRuntimeLimits(
    {
      maxToolCalls: version.maxToolCalls ?? defaultMaxToolCalls,
      maxOutputTokens: version.maxOutputTokens,
      providerMaxOutputTokens: context.providerConfig.maxOutputTokens,
      providerContextWindow: context.providerConfig.contextWindow,
    },
  );
  const shouldUseToolCalling = maxToolCalls > 0;
  const disabledToolKeys = new Set(
    capabilityOverrides?.disabledTools.map(
      (tool) => `${tool.source}:${tool.id}`,
    ) ?? [],
  );
  const disabledSkillIds = new Set(capabilityOverrides?.disabledSkillIds ?? []);
  const requestedSkillIds = new Set(capabilityOverrides?.enabledSkillIds ?? []);
  const enabledSkills =
    requestedSkillIds.size > 0
      ? (await listAgentSkills(agent.workspaceId, actorUserId)).filter(
          (skill) => requestedSkillIds.has(skill.id),
        )
      : [];
  const skillsPrompt = shouldUseToolCalling
    ? await buildSkillsRegistryPrompt(
        version.id,
        disabledSkillIds,
        enabledSkills,
      )
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
        disabledToolKeys,
        disabledSkillIds,
        enabledTools: capabilityOverrides?.enabledTools,
        enabledSkillIds: new Set(enabledSkills.map((skill) => skill.id)),
        enabledKnowledgeIds: capabilityOverrides?.enabledKnowledgeIds,
        enableDocumentExplorer:
          availableAttachments.some(
            (attachment) =>
              isChatFileAttachment(attachment) &&
              attachment.extractedTextChars > 0,
          ) ||
          history.some((message) =>
            JSON.stringify(message).includes(
              "Embedding-free document explorer:",
            ),
          ),
        approvalPolicy,
        emitEvent: input.enqueueEvent,
        onApprovalRequired: (event) =>
          input.enqueueEvent({
            type: "tool_approval_required",
            invocationId: event.invocationId,
            toolName: event.toolName,
            input: event.input,
          }),
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
    userMessageId: userMessage?.id ?? null,
    createdConversation: input.createdConversation,
    streamProtocol: useAiSdkUIStream ? "ai-sdk-ui" : "data-stream",
    attachmentCount: input.messageAttachments.length,
    hasCodeWorkspaceAttachment: input.hasCodeWorkspaceAttachment,
    knowledgeToolsEnabled: availableToolNames.includes(
      KNOWLEDGE_SEARCH_TOOL_NAME,
    ),
    toolCount: availableToolNames.length,
    maxToolCalls,
    durationMs: Date.now() - input.requestStartedAt,
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
  const hasBusinessArtifactTools = businessArtifactToolNames.some((name) =>
    availableToolNames.includes(name),
  );
  const hasCodeWorkspaceTools = codeWorkspaceCreateToolNames.some((name) =>
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
          availableToolNames.includes(KNOWLEDGE_SEARCH_TOOL_NAME)
            ? `Connected data sources are available through ${KNOWLEDGE_SEARCH_TOOL_NAME}. Call it only when the request may depend on those sources; do not query data sources automatically for every message. Choose one or more knowledgeBaseIds explicitly from the source names and descriptions exposed by the tool, using multiple sources only when useful. Search results include chunk IDs. When surrounding context is necessary, call ${KNOWLEDGE_CONTEXT_TOOL_NAME} with one of those IDs and a bounded number of chunks before or after.`
            : null,
          availableToolNames.includes("update_todo_list")
            ? "For tasks with multiple meaningful steps, call update_todo_list early, keep the same item IDs, mark exactly one current item in_progress when possible, and call it again as items are completed. Do not create a checklist for a simple one-step answer."
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
            ? "Use run_code_sandbox when the user asks you to execute Python, Node.js, or Bash; verify a calculation with code; inspect data; interact with uploaded documents; transform text/files; or produce computed results. The sandbox is wiped after each run, has web access, includes broad data/science/document libraries, runs in an isolated container with resource limits, and returns stdout/stderr plus generated file previews. If the user uploaded a document or image, pass its Attachment ID in attachments. Readable documents get an embedding-free .document directory: start with README.md and manifest.json, search chunks with rg, and open only relevant page/section ranges with sed or Python; follow adjacent chunks for context. Inspect the manifest, search, and read all relevant chunks in one sandbox call whenever practical so the temporary files stay available and the user is not asked to approve several exploratory calls. The original file is included when sandbox limits allow. Generated files are persisted as downloadable chat attachments when possible; reference the returned downloadUrl or tell the user to use the generated file card instead of inventing links. Print or write the values you need returned; do not assume files persist between runs. Write outputs as relative paths in the current working directory so they can be collected."
            : null,
          hasCodeWorkspaceTools
            ? "For static HTML/CSS/JS apps, keep the whole workflow in chat. If the user asks you to build a small website/app/demo from scratch, first use code_workspace_create_project with only short starter files or just file paths such as index.html, styles.css, and script.js, then fill or revise files one at a time with code_workspace_write_file or code_workspace_replace_text. Avoid one huge create_project call containing all final code. To include an uploaded image, font, media file, or other supported asset, call code_workspace_write_file with its Attachment ID in attachmentId and the desired workspace path; this copies the original bytes, so never recreate binary content as text. If the user uploaded a ZIP/code workspace, use code_workspace_list_files to inspect it, code_workspace_read_file before editing, code_workspace_replace_text for targeted edits, and code_workspace_write_file only when full-file replacement is safer. Use code_workspace_delete_file with the exact workspace-relative path to remove obsolete files; list the workspace first when the path is uncertain. These tools return a live code workspace artifact with preview and ZIP download; do not paste full files unless asked. If the user wants to publish to GitHub, use github_get_publish_status to check the current user's connected repositories or get the connect URL. For GitHub publishing, the user must choose the repository, target branch, and mode: pull_request or direct_push. Use github_publish_code_workspace only after the user explicitly confirms those choices; direct_push requires confirmDirectPush=true and can target main only if the user explicitly selected main."
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
  const attachmentContext =
    buildConversationAttachmentContext(availableAttachments);
  const localeCookie = (await cookies()).get("NEXT_LOCALE")?.value ?? "en";
  const systemPrompt = [
    version.systemPrompt?.trim() || fallbackSystemPrompt(localeCookie),
    skillsPrompt,
    responseFormatGuidance,
    guardrailGuidance,
    attachmentContext,
    toolGuidance,
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    maxToolCalls,
    maxOutputTokens,
    maxSteps,
    boundToolConfig,
    tools,
    availableToolNames,
    configuredToolChoice,
    systemPrompt,
  };
}
