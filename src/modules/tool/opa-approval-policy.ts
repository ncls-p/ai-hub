import { normalizeOpaDecision } from "@ai-sdk/policy-opa";

import { logHandledWarning } from "@/lib/logger";
import {
  allowToolDecision,
  type ToolApprovalDecision,
  type ToolSource,
} from "./approval-policy";

export type OpaToolApprovalInput = {
  toolName: string;
  toolSource: ToolSource;
  riskLevel?: string | null;
  toolInput: unknown;
  workspaceId: string;
  conversationId: string;
  messageId: string;
  userId: string;
  agentVersionId: string;
};

function configuredOpaUrl() {
  return process.env.AI_HUB_TOOL_POLICY_OPA_URL?.replace(/\/+$/, "") || null;
}

function configuredOpaPath() {
  return process.env.AI_HUB_TOOL_POLICY_OPA_PATH || "agent/call/decision";
}

function opaDataUrl(baseUrl: string, path: string) {
  return `${baseUrl}/v1/data/${path.replace(/^\/+/, "")}`;
}

function toToolApprovalDecision(
  decision: ReturnType<typeof normalizeOpaDecision>,
): ToolApprovalDecision | null {
  switch (decision.type) {
    case "approved":
      return allowToolDecision(
        decision.reason ?? "OPA policy approved tool execution",
      );
    case "denied":
      return {
        status: "deny",
        reason: decision.reason ?? "OPA policy denied tool execution",
        aiSdkStatus: {
          type: "denied",
          reason: decision.reason ?? "OPA policy denied tool execution",
        },
      };
    case "user-approval":
      return {
        status: "requires_approval",
        reason: "OPA policy requires human approval",
        aiSdkStatus: "user-approval",
      };
    case "not-applicable":
      return null;
  }
}

/**
 * Optional OPA-backed AI SDK approval policy. When configured, OPA gets first
 * refusal/approval and local AI Hub policy handles `not-applicable` decisions.
 */
export async function evaluateOpaToolApprovalPolicy(
  input: OpaToolApprovalInput,
): Promise<ToolApprovalDecision | null> {
  const baseUrl = configuredOpaUrl();
  if (!baseUrl) return null;

  try {
    const response = await fetch(opaDataUrl(baseUrl, configuredOpaPath()), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: {
          tool: {
            name: input.toolName,
            source: input.toolSource,
            riskLevel: input.riskLevel,
          },
          args: input.toolInput,
          runtimeContext: {
            workspaceId: input.workspaceId,
            conversationId: input.conversationId,
            messageId: input.messageId,
            userId: input.userId,
            agentVersionId: input.agentVersionId,
          },
        },
      }),
      signal: AbortSignal.timeout(2_000),
    });

    if (!response.ok) {
      throw new Error(`OPA HTTP ${response.status}: ${response.statusText}`);
    }

    const payload = (await response.json()) as { result?: unknown };
    return toToolApprovalDecision(normalizeOpaDecision(payload.result));
  } catch (error) {
    logHandledWarning("OPA tool approval policy failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (process.env.AI_HUB_TOOL_POLICY_OPA_FAIL_CLOSED === "true") {
      return {
        status: "deny",
        reason: "OPA approval policy failed closed",
        aiSdkStatus: {
          type: "denied",
          reason: "OPA approval policy failed closed",
        },
      };
    }
    return null;
  }
}
