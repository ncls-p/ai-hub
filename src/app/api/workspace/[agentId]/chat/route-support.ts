import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { decryptValue } from "@/lib/crypto";
import { maxChatAttachments } from "@/modules/chat/attachments";
import { loadBoundSkillContent } from "@/modules/skills/use-cases";
import { executeCustomToolWorkflow } from "@/modules/custom-tools/use-cases";
import { executeMcpTool } from "@/modules/mcp/executor";
import {
  getBuiltInTool,
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
import { messageParts, messages } from "@/server/infrastructure/db/schema";
import { registerAiSdkDevTools } from "@/server/infrastructure/ai-sdk/devtools";
import { jsonSchema, type ToolApprovalConfiguration, type ToolSet } from "ai";

registerAiSdkDevTools();

export const chatRequestSchema = z.object({
  content: z.string().trim().min(1).max(32_000),
  conversationId: z.uuid().nullable().optional(),
  resendFromMessageId: z.uuid().nullable().optional(),
  codeWorkspaceId: z.uuid().optional(),
  attachmentIds: z.array(z.uuid()).max(maxChatAttachments).optional(),
  imageAttachmentIds: z.array(z.uuid()).max(maxChatAttachments).optional(),
});

export const defaultMaxToolCalls = 6;
export const defaultMaxOutputTokens = 30_000;
const BUILTIN_TOOL_SOURCE = "builtin";
const TOOL_GATE_RETURN = "return" as const;
type ToolGateResult =
  | { status: "continue" }
  | { status: typeof TOOL_GATE_RETURN; output: unknown };

export type ToolApprovalRequiredEvent = {
  invocationId: string;
  toolName: string;
  input: unknown;
};

export type BoundToolApprovalMetadata = {
  toolSource: typeof BUILTIN_TOOL_SOURCE | "custom" | "mcp";
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

export const codeWorkspaceEditToolNames = [
  "code_workspace_list_files",
  "code_workspace_read_file",
  "code_workspace_write_file",
  "code_workspace_replace_text",
  "code_workspace_delete_file",
  ...githubPublishToolNames,
];

export const codeWorkspaceCreateToolNames = [
  "code_workspace_create_project",
  ...codeWorkspaceEditToolNames,
];

export function streamToolCallId(part: unknown) {
  const record = part as Record<string, unknown>;
  return typeof record.toolCallId === "string"
    ? record.toolCallId
    : typeof record.id === "string"
      ? record.id
      : "";
}

export function streamToolInputDelta(part: unknown) {
  const record = part as Record<string, unknown>;
  return typeof record.delta === "string"
    ? record.delta
    : typeof record.inputTextDelta === "string"
      ? record.inputTextDelta
      : "";
}

// --- Execute handlers extracted from loops to avoid function-in-loop ---

function createCustomToolExecute(
  input: {
    workspaceId: string;
    conversationId: string;
    messageId: string;
    userId: string;
    agentVersionId: string;
  },
  customTool: { id: string; name: string },
  binding: { riskLevel: string | null; requireApproval: boolean },
  reserveToolCall: () => boolean,
  toolLimitReachedResult: () => unknown,
  gateToolExecution: (args: {
    startedAt: number;
    toolSource: "custom";
    toolId: string;
    toolName: string;
    riskLevel: string | null;
    toolInput: unknown;
    bindingRequiresApproval: boolean;
  }) => Promise<ToolGateResult>,
): (toolInput: unknown) => Promise<unknown> {
  return async (toolInput: unknown) => {
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
    if (gate.status === TOOL_GATE_RETURN) return gate.output;

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
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}

function createMcpToolExecute(
  input: {
    workspaceId: string;
    userId: string;
    conversationId: string;
    messageId: string;
  },
  mcpTool: { id: string; name: string; mcpServerId: string },
  binding: { riskLevel: string | null; requireApproval: boolean },
  approvalConfig: {
    serverRequiresApproval: boolean;
    toolRequiresApproval: boolean;
  },
  reserveToolCall: () => boolean,
  toolLimitReachedResult: () => unknown,
  gateToolExecution: (args: {
    startedAt: number;
    toolSource: "mcp";
    toolId: string;
    toolName: string;
    riskLevel: string | null;
    toolInput: unknown;
    bindingRequiresApproval: boolean;
    serverRequiresApproval: boolean;
    toolRequiresApproval: boolean;
  }) => Promise<ToolGateResult>,
): (toolInput: unknown) => Promise<unknown> {
  return async (toolInput: unknown) => {
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
      serverRequiresApproval: approvalConfig.serverRequiresApproval,
      toolRequiresApproval: approvalConfig.toolRequiresApproval,
    });
    if (gate.status === TOOL_GATE_RETURN) return gate.output;

    try {
      const output = await executeMcpTool({
        serverId: mcpTool.mcpServerId,
        toolId: mcpTool.id,
        workspaceId: input.workspaceId,
        userId: input.userId,
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
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}

function createBuiltinToolExecute(
  input: {
    workspaceId: string;
    conversationId: string;
    messageId: string;
    userId: string;
    emitEvent?: (event: Record<string, unknown>) => void;
  },
  definition: {
    id: string;
    name: string;
    riskLevel: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: (...args: any[]) => any;
  },
  binding: { riskLevel: string | null; requireApproval: boolean },
  reserveToolCall: () => boolean,
  toolLimitReachedResult: () => unknown,
  gateToolExecution: (args: {
    startedAt: number;
    toolSource: "builtin";
    toolId: string;
    toolName: string;
    riskLevel: string | null;
    toolInput: unknown;
    bindingRequiresApproval: boolean;
  }) => Promise<ToolGateResult>,
  canExecuteRestrictedToolFn: (
    userId: string,
    workspaceId: string,
  ) => Promise<boolean>,
): (toolInput: unknown) => Promise<unknown> {
  return async (toolInput: unknown) => {
    const startedAt = Date.now();
    if (!reserveToolCall()) {
      await logToolInvocation({
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        toolSource: BUILTIN_TOOL_SOURCE,
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
          ? await authorization.hasPermission(
              { principalType: "user", principalId: input.userId },
              "agents.chat",
              "workspace",
              input.workspaceId,
            )
          : await canExecuteRestrictedToolFn(input.userId, input.workspaceId);
      if (!canExecute) {
        await logToolInvocation({
          workspaceId: input.workspaceId,
          conversationId: input.conversationId,
          messageId: input.messageId,
          toolSource: BUILTIN_TOOL_SOURCE,
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
      toolSource: BUILTIN_TOOL_SOURCE,
      toolId: definition.id,
      toolName: definition.name,
      riskLevel: definition.riskLevel,
      toolInput,
      bindingRequiresApproval: binding.requireApproval,
    });
    if (gate.status === TOOL_GATE_RETURN) return gate.output;

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
        toolSource: BUILTIN_TOOL_SOURCE,
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
        toolSource: BUILTIN_TOOL_SOURCE,
        toolId: definition.id,
        toolName: definition.name,
        riskLevel: definition.riskLevel,
        input: toolInput,
        status: "failed",
        latencyMs: Date.now() - startedAt,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}

export async function buildBoundTools(input: {
  agentVersionId: string;
  workspaceId: string;
  conversationId: string;
  messageId: string;
  userId: string;
  maxToolCalls: number;
  approvalPolicy?: AiHubToolApprovalPolicy | null;
  hasSkills?: boolean;
  emitEvent?: (event: Record<string, unknown>) => void;
  onApprovalRequired?: (event: ToolApprovalRequiredEvent) => void;
}) {
  const bindings = await getToolBindingsForVersion(input.agentVersionId);
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
    toolSource: typeof BUILTIN_TOOL_SOURCE | "custom" | "mcp";
    toolId: string;
    toolName: string;
    riskLevel?: string | null;
    toolInput: unknown;
    bindingRequiresApproval?: boolean;
    serverRequiresApproval?: boolean;
    toolRequiresApproval?: boolean;
  }): Promise<ToolGateResult> {
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
        status: TOOL_GATE_RETURN,
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
      return { status: TOOL_GATE_RETURN, output: approvalResult.output };
    }

    return {
      status: TOOL_GATE_RETURN,
      output: {
        denied: true,
        invocationId: invocation.id,
        message: approvalResult.error ?? "Tool invocation was not approved.",
      },
    };
  }

  if (input.hasSkills) {
    registerToolApprovalMetadata("load_skill", {
      toolSource: BUILTIN_TOOL_SOURCE,
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
        execute: createCustomToolExecute(
          input,
          customTool,
          binding,
          reserveToolCall,
          toolLimitReachedResult,
          gateToolExecution,
        ),
      };
      continue;
    }

    if (binding.toolSource === "mcp") {
      const mcpContext = await getMcpBindingContext(
        input.agentVersionId,
        binding.toolId,
        input.userId,
        input.workspaceId,
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
        execute: createMcpToolExecute(
          input,
          mcpTool,
          binding,
          {
            serverRequiresApproval: mcpContext.server.requireApproval,
            toolRequiresApproval: mcpTool.requireApproval,
          },
          reserveToolCall,
          toolLimitReachedResult,
          gateToolExecution,
        ),
      };
      continue;
    }

    if (binding.toolSource !== BUILTIN_TOOL_SOURCE) continue;
    const definition = getBuiltInTool(binding.toolId);
    if (!definition) continue;
    registerToolApprovalMetadata(definition.name, {
      toolSource: BUILTIN_TOOL_SOURCE,
      toolName: definition.name,
      riskLevel: definition.riskLevel,
      bindingRequiresApproval: binding.requireApproval,
    });

    tools[definition.name] = {
      description: `${definition.description} Risk level: ${definition.riskLevel}.`,
      inputSchema: definition.inputSchema,
      execute: createBuiltinToolExecute(
        input,
        definition,
        binding,
        reserveToolCall,
        toolLimitReachedResult,
        gateToolExecution,
        canExecuteRestrictedTool,
      ),
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

export async function findUserMessageForResend(input: {
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

export async function isFirstUserMessageInConversation(
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
