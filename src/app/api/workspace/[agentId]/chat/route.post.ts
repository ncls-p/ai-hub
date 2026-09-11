import {
  hasResourcePermissionForRequest,
  isWorkspaceMemberForRequest,
} from "@/modules/auth/workspace-access";
import { applyUsageLimits } from "@/modules/usage/limited-language-model";
import { logger, logHandledError } from "@/lib/logger";
import {
  requireResourcePermissionAsync,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { canUseAgent } from "@/modules/agent/use-cases";
import { runWithRequestAuth } from "@/modules/auth/request-auth-context";
import {
  getActorUserId,
  resolveAuthContext,
} from "@/modules/auth/resolve-auth";
import {
  getChatAttachment,
  publicChatAttachment,
  type ChatAttachment,
} from "@/modules/chat/attachments";
import { publishChatStreamEvent } from "@/modules/chat/stream-bus";
import { getConversationAccess } from "@/modules/chat/conversation-sharing";
import {
  codeWorkspaceArtifact,
  getCodeWorkspace,
} from "@/modules/code-workspace/storage";
import { assertWorkspaceWithinTokenQuota } from "@/modules/usage/quota";
import { db } from "@/server/infrastructure/db";
import { authorization } from "@/server/domain/services/authorization";
import { agents, messages } from "@/server/infrastructure/db/schema";
import { getAdapter } from "@/server/infrastructure/providers";
import { extractReasoningMiddleware, wrapLanguageModel } from "ai";
import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { loadConversationHistory } from "./route-history";
import { chatRequestSchema } from "./route-support";
import { runOrchestratorChat } from "./route.orchestrator";
import { loadAuthorizedConversationAttachments } from "./route.orchestrator-attachments";
import { prepareChatConversation } from "./route.prepare-conversation";
import { runStandardChat } from "./route.standard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestStartedAt = Date.now();
  const jsonResponse = (body: unknown, status: number) =>
    NextResponse.json(body, { status, headers: { "x-request-id": requestId } });
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
  let assistantStreamGenerationId: string | undefined;
  let createdUserMessage = false;

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
      ephemeral = false,
      ephemeralTtlMinutes,
      resendFromMessageId,
      regenerateAssistantMessageId,
      continueFromMessageId,
      codeWorkspaceId,
      attachmentIds = [],
      imageAttachmentIds = [],
      capabilityOverrides,
      reasoningEffort,
    } = parsed.data;
    const streamProtocol =
      req.headers.get("X-AI-Hub-Stream-Protocol") ??
      req.nextUrl.searchParams.get("streamProtocol");
    const useAiSdkUIStream = streamProtocol === "ai-sdk-ui";
    if (resendFromMessageId && continueFromMessageId) {
      return rejectChatRequest(
        400,
        "conflicting_message_actions",
        { error: "Cannot regenerate and continue a response together" },
        { agentId, userId: actorUserId },
      );
    }
    if (regenerateAssistantMessageId && !resendFromMessageId) {
      return rejectChatRequest(
        400,
        "regeneration_without_prompt",
        { error: "Regeneration requires its user prompt" },
        { agentId, userId: actorUserId },
      );
    }
    if (
      continueFromMessageId &&
      (codeWorkspaceId ||
        attachmentIds.length > 0 ||
        imageAttachmentIds.length > 0)
    ) {
      return rejectChatRequest(
        400,
        "continuation_with_attachments",
        { error: "Response continuation does not accept new attachments" },
        { agentId, userId: actorUserId, continueFromMessageId },
      );
    }

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
    const conversationAccess = existingConversationId
      ? await getConversationAccess(existingConversationId, actorUserId)
      : null;
    const billingWorkspaceId =
      conversationAccess?.conversation.billingWorkspaceId ??
      parsed.data.workspaceId ??
      agent.workspaceId;
    if (
      !(await runWithRequestAuth(
        auth,
        async () =>
          (await isWorkspaceMemberForRequest(
            actorUserId,
            billingWorkspaceId,
          )) &&
          (billingWorkspaceId === agent.workspaceId ||
            (await hasResourcePermissionForRequest(
              actorUserId,
              billingWorkspaceId,
              "agents.chat",
              "agent",
              agent.id,
            ))),
      ))
    ) {
      return rejectChatRequest(
        403,
        "billing_workspace_forbidden",
        { error: "Forbidden" },
        { agentId, userId: actorUserId },
      );
    }
    const canContinueSharedConversation = Boolean(
      conversationAccess?.role === "recipient" &&
      conversationAccess.canContinue &&
      conversationAccess.conversation.agentId === agentId,
    );
    const directlyShared = await authorization.hasDirectPermission(
      { principalType: "user", principalId: actorUserId },
      "agents.get",
      "agent",
      agent.id,
    );
    if (
      !canUseAgent(agent, actorUserId) &&
      !directlyShared &&
      !canContinueSharedConversation
    ) {
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

    const forbidden = await runWithRequestAuth(auth, () =>
      canContinueSharedConversation
        ? requireWorkspacePermissionAsync(
            actorUserId,
            agent.workspaceId,
            "agents.chat",
          )
        : requireResourcePermissionAsync(
            actorUserId,
            agent.workspaceId,
            "agents.chat",
            "agent",
            agentId,
          ),
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

    const preparedConversation = await prepareChatConversation({
      billingWorkspaceId,
      agent,
      actorUserId,
      agentId,
      content,
      existingConversationId,
      ephemeral,
      ephemeralTtlMinutes,
      resendFromMessageId,
      regenerateAssistantMessageId,
      continueFromMessageId,
      codeWorkspaceAttachment,
      messageAttachments,
      reasoningEffort,
      rejectChatRequest,
    });
    if (preparedConversation instanceof Response) return preparedConversation;
    const {
      conversation,
      createdConversation,
      version,
      providerConfig,
      continuationClaim,
      userMessage,
      assistantMessage,
      shouldRegenerateConversationTitle,
    } = preparedConversation;
    userMessageId = preparedConversation.userMessageId;
    assistantMessageId = preparedConversation.assistantMessageId;
    assistantStreamGenerationId =
      preparedConversation.assistantMessage.streamGenerationId ?? undefined;
    createdUserMessage = preparedConversation.createdUserMessage;

    const adapter = getAdapter(providerConfig.providerKind);
    const model = wrapLanguageModel({
      model: await applyUsageLimits(
        adapter.createChatModel(
          providerConfig.runtimeConfig,
          providerConfig.modelId,
        ),
        {
          userId: actorUserId,
          workspaceId: billingWorkspaceId,
          providerId: providerConfig.providerId,
          modelId: providerConfig.modelRecordId ?? null,
        },
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
      {
        summaryEnabled: memoryPolicy?.enabled ?? false,
        maxMessages: memoryPolicy?.maxMessages,
        activeAssistantMessageId: continueFromMessageId
          ? assistantMessage.id
          : undefined,
      },
    );
    const generationHistory = continueFromMessageId
      ? [...history, { role: "user" as const, content }]
      : history;
    const availableAttachments = await loadAuthorizedConversationAttachments({
      conversationId: conversation.id,
      workspaceId: agent.workspaceId,
      userId: actorUserId,
      current: messageAttachments,
    });

    const enqueueEvent = (event: Record<string, unknown>) =>
      publishChatStreamEvent(
        assistantMessage.id,
        event,
        assistantMessage.streamGenerationId ?? undefined,
      );

    const executionContext = {
      requestId,
      agentId,
      actorUserId,
      agent,
      version,
      providerConfig,
      conversation,
      userMessage,
      assistantMessage,
      continuationClaim,
      content,
      history,
      generationHistory,
      availableAttachments,
      useAiSdkUIStream,
      shouldRegenerateConversationTitle,
      capabilityOverrides,
      reasoningEffort,
    };
    if (agent.kind === "orchestrator")
      return runOrchestratorChat(executionContext);

    return runStandardChat({
      context: executionContext,
      model,
      messageAttachments,
      createdConversation,
      codeWorkspaceAttachment,
      requestStartedAt,
      enqueueEvent,
    });
  } catch (error) {
    // Chat request failed — messages marked failed below

    if (assistantMessageId) {
      await db
        .update(messages)
        .set({
          status: "failed",
          completedAt: new Date(),
          streamLeaseExpiresAt: null,
        })
        .where(
          and(
            eq(messages.id, assistantMessageId),
            inArray(messages.status, ["pending", "streaming"]),
            assistantStreamGenerationId
              ? eq(messages.streamGenerationId, assistantStreamGenerationId)
              : undefined,
          ),
        );
    }
    if (userMessageId && createdUserMessage) {
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
