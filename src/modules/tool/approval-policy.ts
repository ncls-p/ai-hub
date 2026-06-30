import type { ToolApprovalStatus } from "ai";

import type { ToolRiskLevel } from "./builtin-tools";

export type ToolSource = "builtin" | "custom" | "mcp";

type AiHubToolApprovalMode = "allow" | "deny" | "require_approval";

export type AiHubToolApprovalPolicy = {
  /** Existing simple switch in the agent editor. */
  requireApprovalForAllTools?: boolean;
  /** Fail-closed mode for sensitive agents or workspaces. */
  defaultDecision?: AiHubToolApprovalMode;
  /** Risk levels that must always go through human approval. */
  requireApprovalRiskLevels?: ToolRiskLevel[];
  /** Tool names that must always go through human approval. */
  requireApprovalToolNames?: string[];
  /** Tool names that should be denied before execution. */
  denyToolNames?: string[];
  /** MCP/custom tools are user-provided surfaces; this can force HITL by source. */
  requireApprovalSources?: ToolSource[];
};

export type ToolApprovalDecision = {
  status: "allow" | "requires_approval" | "deny";
  reason?: string;
  aiSdkStatus: ToolApprovalStatus;
};

type ToolApprovalInput = {
  policy?: AiHubToolApprovalPolicy | null;
  toolName: string;
  toolSource: ToolSource;
  riskLevel?: ToolRiskLevel | string | null;
  bindingRequiresApproval?: boolean;
  serverRequiresApproval?: boolean;
  toolRequiresApproval?: boolean;
};

const defaultApprovalRiskLevels = new Set<ToolRiskLevel>(["high", "critical"]);

function normalizeToolName(name: string) {
  return name.trim().toLowerCase();
}

function includesToolName(values: string[] | undefined, toolName: string) {
  const normalizedToolName = normalizeToolName(toolName);
  return (
    values?.some((value) => normalizeToolName(value) === normalizedToolName) ??
    false
  );
}

function riskLevelRequiresApproval(
  riskLevel: ToolApprovalInput["riskLevel"],
  policy: AiHubToolApprovalPolicy | null | undefined,
) {
  if (!riskLevel) return false;
  const configured = policy?.requireApprovalRiskLevels?.length
    ? new Set(policy.requireApprovalRiskLevels)
    : defaultApprovalRiskLevels;
  return configured.has(riskLevel as ToolRiskLevel);
}

function approvalDecision(reason: string): ToolApprovalDecision {
  return {
    status: "requires_approval",
    reason,
    aiSdkStatus: "user-approval",
  };
}

function denyDecision(reason: string): ToolApprovalDecision {
  return {
    status: "deny",
    reason,
    aiSdkStatus: { type: "denied", reason },
  };
}

export function allowToolDecision(
  reason = "Policy allowed tool execution",
): ToolApprovalDecision {
  return {
    status: "allow",
    reason,
    aiSdkStatus: "not-applicable",
  };
}

/**
 * Central AI Hub approval policy. It mirrors AI SDK 7 approval statuses while
 * remaining compatible with the existing DB-audited approval endpoints.
 */
export function decideToolApproval(
  input: ToolApprovalInput,
): ToolApprovalDecision {
  const policy = input.policy ?? null;

  if (includesToolName(policy?.denyToolNames, input.toolName)) {
    return denyDecision(`Tool ${input.toolName} is denied by policy`);
  }

  if (policy?.defaultDecision === "deny") {
    return denyDecision("Agent approval policy denies tools by default");
  }

  if (policy?.requireApprovalForAllTools) {
    return approvalDecision("Agent policy requires approval for every tool");
  }

  if (input.bindingRequiresApproval) {
    return approvalDecision(
      "This agent binding requires approval for the tool",
    );
  }

  if (input.serverRequiresApproval) {
    return approvalDecision("The connected MCP server requires approval");
  }

  if (input.toolRequiresApproval) {
    return approvalDecision("The connected tool requires approval");
  }

  if (includesToolName(policy?.requireApprovalToolNames, input.toolName)) {
    return approvalDecision(
      `Tool ${input.toolName} is configured for approval`,
    );
  }

  if (policy?.requireApprovalSources?.includes(input.toolSource)) {
    return approvalDecision(
      `${input.toolSource} tools require approval by policy`,
    );
  }

  if (riskLevelRequiresApproval(input.riskLevel, policy)) {
    return approvalDecision(`Risk level ${input.riskLevel} requires approval`);
  }

  if (policy?.defaultDecision === "require_approval") {
    return approvalDecision(
      "Agent approval policy requires approval by default",
    );
  }

  return allowToolDecision();
}
