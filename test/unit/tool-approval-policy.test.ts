import { afterEach, describe, expect, it, vi } from "vitest";

import { decideToolApproval } from "@/modules/tool/approval-policy";
import { evaluateOpaToolApprovalPolicy } from "@/modules/tool/opa-approval-policy";

describe("tool approval policy", () => {
	it("requires approval for high-risk tools by default", () => {
		expect(
			decideToolApproval({
				toolName: "github_publish_code_workspace",
				toolSource: "builtin",
				riskLevel: "high",
			}).status,
		).toBe("requires_approval");
	});

	it("allows low-risk tools when no policy rule matches", () => {
		expect(
			decideToolApproval({
				toolName: "current_time",
				toolSource: "builtin",
				riskLevel: "low",
			}).status,
		).toBe("allow");
	});

	it("denies explicitly denied tools before approval", () => {
		const decision = decideToolApproval({
			policy: { denyToolNames: ["dangerous_tool"] },
			toolName: "dangerous_tool",
			toolSource: "custom",
			riskLevel: "medium",
		});

		expect(decision.status).toBe("deny");
		expect(decision.aiSdkStatus).toEqual({
			type: "denied",
			reason: "Tool dangerous_tool is denied by policy",
		});
	});

	it("can force approval by source", () => {
		expect(
			decideToolApproval({
				policy: { requireApprovalSources: ["mcp"] },
				toolName: "remote_lookup",
				toolSource: "mcp",
				riskLevel: "low",
			}).status,
		).toBe("requires_approval");
	});
});

describe("OPA tool approval policy", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.AI_HUB_TOOL_POLICY_OPA_URL;
		delete process.env.AI_HUB_TOOL_POLICY_OPA_PATH;
		delete process.env.AI_HUB_TOOL_POLICY_OPA_FAIL_CLOSED;
	});

	it("maps OPA deny decisions to AI SDK denied status", async () => {
		process.env.AI_HUB_TOOL_POLICY_OPA_URL = "http://opa.test";
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				Response.json({
					result: { decision: "deny", reason: "requires review" },
				}),
			),
		);

		const decision = await evaluateOpaToolApprovalPolicy({
			toolName: "deploy",
			toolSource: "custom",
			riskLevel: "high",
			toolInput: { target: "prod" },
			workspaceId: "workspace-id",
			conversationId: "conversation-id",
			messageId: "message-id",
			userId: "user-id",
			agentVersionId: "version-id",
		});

		expect(decision?.status).toBe("deny");
		expect(decision?.aiSdkStatus).toEqual({
			type: "denied",
			reason: "requires review",
		});
	});
});
