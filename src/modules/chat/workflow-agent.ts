import { WorkflowAgent } from "@ai-sdk/workflow";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import type { StopCondition, ToolSet } from "ai";

export type AiHubWorkflowRuntimeContext = {
	workspaceId: string;
	userId: string;
	agentId: string;
	agentVersionId: string;
	conversationId?: string;
};

export type CreateAiHubWorkflowAgentInput = {
	id?: string;
	model: LanguageModelV4;
	instructions: string;
	tools?: ToolSet;
	maxOutputTokens?: number;
	temperature?: number;
	topP?: number;
	stopWhen?:
		| StopCondition<ToolSet, AiHubWorkflowRuntimeContext>
		| Array<StopCondition<ToolSet, AiHubWorkflowRuntimeContext>>;
	runtimeContext: AiHubWorkflowRuntimeContext;
};

/**
 * Durable-agent factory for long-running AI Hub flows. Use this for future
 * scheduled tasks, approvals that can outlive an HTTP request, and workflow
 * style agent runs where each tool step should be resumable/observable.
 */
export function createAiHubWorkflowAgent(input: CreateAiHubWorkflowAgentInput) {
	return new WorkflowAgent<ToolSet, AiHubWorkflowRuntimeContext>({
		id: input.id,
		model: input.model,
		instructions: input.instructions,
		tools: input.tools,
		maxOutputTokens: input.maxOutputTokens,
		temperature: input.temperature,
		topP: input.topP,
		stopWhen: input.stopWhen,
		runtimeContext: input.runtimeContext,
		telemetry: {
			functionId: "ai-hub.workflow-agent",
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
	});
}
