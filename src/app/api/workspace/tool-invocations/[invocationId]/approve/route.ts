import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { decryptValue, encryptValue } from "@/lib/crypto";
import { logger, logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { executeCustomToolWorkflow } from "@/modules/custom-tools/use-cases";
import { executeMcpTool } from "@/modules/mcp/executor";
import { getBuiltInTool } from "@/modules/tool/builtin-tools";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  conversations,
  mcpTools,
  toolInvocations,
} from "@/server/infrastructure/db/schema";

import { invocationParamsSchema } from "../../invocation-shared";

async function executeInvocation(
  invocation: typeof toolInvocations.$inferSelect,
  userId: string,
) {
  const input = invocation.inputJsonEncrypted
    ? JSON.parse(await decryptValue(invocation.inputJsonEncrypted))
    : undefined;

  let output: unknown;
  if (invocation.toolSource === "builtin") {
    const tool = getBuiltInTool(invocation.toolId);
    if (!tool) {
      return NextResponse.json({ error: "Tool not found" }, { status: 404 });
    }
    output = await tool.execute(input as never, {
      workspaceId: invocation.workspaceId,
      userId,
    });
  } else if (invocation.toolSource === "custom") {
    output = await executeCustomToolWorkflow({
      workspaceId: invocation.workspaceId,
      userId,
      customToolId: invocation.toolId,
      toolInput: input,
    });
  } else if (invocation.toolSource === "mcp") {
    const [tool] = await db
      .select({ mcpServerId: mcpTools.mcpServerId })
      .from(mcpTools)
      .where(eq(mcpTools.id, invocation.toolId))
      .limit(1);
    if (!tool) {
      return NextResponse.json(
        { error: "MCP tool not found" },
        { status: 404 },
      );
    }
    output = await executeMcpTool({
      serverId: tool.mcpServerId,
      toolId: invocation.toolId,
      workspaceId: invocation.workspaceId,
      userId,
      toolInput: input,
    });
  } else {
    return NextResponse.json(
      { error: "Unsupported tool source" },
      { status: 400 },
    );
  }
  return output;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ invocationId: string }> },
) {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const startedAt = Date.now();
  try {
    const session = await getSession();
    if (!session) {
      logger.warn("Tool invocation approval rejected", {
        requestId,
        reason: "no_session",
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = invocationParamsSchema.safeParse(await params);
    if (!parsed.success) {
      logger.warn("Tool invocation approval rejected", {
        requestId,
        userId: session.user.id,
        reason: "invalid_request",
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const [row] = await db
      .select({ invocation: toolInvocations, conversation: conversations })
      .from(toolInvocations)
      .innerJoin(
        conversations,
        eq(toolInvocations.conversationId, conversations.id),
      )
      .where(
        and(
          eq(toolInvocations.id, parsed.data.invocationId),
          eq(conversations.userId, session.user.id),
        ),
      )
      .limit(1);
    const invocation = row?.invocation;

    if (!invocation) {
      logger.warn("Tool invocation approval rejected", {
        requestId,
        userId: session.user.id,
        invocationId: parsed.data.invocationId,
        reason: "not_found",
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        { error: "Invocation not found" },
        { status: 404 },
      );
    }

    const approvalPermission =
      invocation.toolSource === "builtin" &&
      getBuiltInTool(invocation.toolId)?.name ===
        "github_publish_code_workspace"
        ? "agents.chat"
        : "tools.executeRestricted";
    const permissionGranted = await authorization.hasPermission(
      { principalType: "user", principalId: session.user.id },
      approvalPermission,
      "workspace",
      invocation.workspaceId,
    );
    if (!permissionGranted) {
      logger.warn("Tool invocation approval rejected", {
        requestId,
        userId: session.user.id,
        invocationId: invocation.id,
        toolName: invocation.toolName,
        reason: "missing_permission",
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (invocation.status !== "awaiting_approval") {
      logger.warn("Tool invocation approval rejected", {
        requestId,
        userId: session.user.id,
        invocationId: invocation.id,
        currentStatus: invocation.status,
        reason: "not_awaiting_approval",
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        { error: "Invocation is not awaiting approval" },
        { status: 409 },
      );
    }

    logger.info("Tool invocation approval started", {
      requestId,
      userId: session.user.id,
      invocationId: invocation.id,
      toolName: invocation.toolName,
      toolSource: invocation.toolSource,
      workspaceId: invocation.workspaceId,
    });

    const execStartedAt = Date.now();
    const result = await executeInvocation(invocation, session.user.id);
    if (result instanceof NextResponse) return result;

    await db
      .update(toolInvocations)
      .set({
        outputJsonEncrypted: await encryptValue(JSON.stringify(result)),
        status: "success",
        latencyMs: Date.now() - execStartedAt,
        approvedByUserId: session.user.id,
        completedAt: new Date(),
      })
      .where(eq(toolInvocations.id, invocation.id));

    await audit.emit({
      workspaceId: invocation.workspaceId,
      actorPrincipalType: "user",
      actorPrincipalId: session.user.id,
      action: "toolInvocation.approved",
      resourceType: "tool_invocation",
      resourceId: invocation.id,
      outcome: "success",
      metadata: {
        toolName: invocation.toolName,
        toolSource: invocation.toolSource,
        riskLevel: invocation.riskLevel,
      },
    });

    logger.info("Tool invocation approval completed", {
      requestId,
      userId: session.user.id,
      invocationId: invocation.id,
      toolName: invocation.toolName,
      toolSource: invocation.toolSource,
      workspaceId: invocation.workspaceId,
      latencyMs: Date.now() - execStartedAt,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({ ok: true, output: result });
  } catch (error) {
    logHandledError(
      "Tool invocation approval failed",
      { requestId, durationMs: Date.now() - startedAt },
      error as Error,
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
