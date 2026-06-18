import type { Agent, AgentForm } from "./types";
import { defaultGenParams } from "./types";

export type AgentVersionPayload = {
	isActive?: boolean;
	systemPrompt: string | null;
	providerId: string | null;
	modelId: string | null;
	temperature: string | number | null;
	topP: string | number | null;
	maxOutputTokens: number | null;
	maxToolCalls: number | null;
	toolChoice: "auto" | "required" | "none" | null;
	generationSettingsJson: {
		topK?: number;
		presencePenalty?: number;
		frequencyPenalty?: number;
		seed?: number;
		maxRetries?: number;
		stopSequences?: string[];
	} | null;
	responseFormatJson: { type?: "text" | "json_object" } | null;
	memoryPolicyJson: { enabled?: boolean; maxMessages?: number } | null;
	guardrailsJson: { enabled?: boolean; blockedTopics?: string[] } | null;
	approvalPolicyJson: { requireApprovalForAllTools?: boolean } | null;
};

function coerceNumericField(
	value: string | number | null | undefined,
	fallback: string,
): string {
	if (value === null || value === undefined || value === "") return fallback;
	return String(value);
}

function optionalNumericField(value: number | null | undefined): string {
	if (value === null || value === undefined) return "";
	return String(value);
}

export function buildAgentFormFromVersion(
	agent: Agent,
	activeVersion: AgentVersionPayload | null,
	shareTargetEmail?: string | null,
): AgentForm {
	const gen = activeVersion?.generationSettingsJson;
	const responseType = activeVersion?.responseFormatJson?.type;

	return {
		name: agent.name,
		slug: agent.slug,
		description: agent.description ?? "",
		systemPrompt: activeVersion?.systemPrompt ?? "",
		promptSuggestions: agent.promptSuggestions?.join("\n") ?? "",
		providerId: activeVersion?.providerId ?? "",
		modelId: activeVersion?.modelId ?? "",
		temperature: coerceNumericField(
			activeVersion?.temperature,
			defaultGenParams.temperature,
		),
		topP: coerceNumericField(activeVersion?.topP, defaultGenParams.topP),
		maxOutputTokens: coerceNumericField(
			activeVersion?.maxOutputTokens,
			defaultGenParams.maxOutputTokens,
		),
		maxToolCalls: coerceNumericField(
			activeVersion?.maxToolCalls,
			defaultGenParams.maxToolCalls,
		),
		toolChoice: activeVersion?.toolChoice ?? "auto",
		generationSettings: {
			topK: optionalNumericField(gen?.topK),
			presencePenalty: optionalNumericField(gen?.presencePenalty),
			frequencyPenalty: optionalNumericField(gen?.frequencyPenalty),
			seed: optionalNumericField(gen?.seed),
			maxRetries: optionalNumericField(gen?.maxRetries),
			stopSequences: gen?.stopSequences?.join("\n") ?? "",
		},
		responseFormat: responseType === "json_object" ? "json_object" : "text",
		memoryPolicy: {
			enabled: activeVersion?.memoryPolicyJson?.enabled ?? false,
			maxMessages: activeVersion?.memoryPolicyJson?.maxMessages ?? 50,
		},
		guardrails: {
			enabled: activeVersion?.guardrailsJson?.enabled ?? false,
			blockedTopics: activeVersion?.guardrailsJson?.blockedTopics ?? [],
		},
		approvalPolicy: {
			requireApprovalForAllTools:
				activeVersion?.approvalPolicyJson?.requireApprovalForAllTools ?? false,
		},
		sharingMode: agent.sharingMode,
		shareTargetEmail: shareTargetEmail ?? "",
		originalSharingMode: agent.sharingMode,
		isGlobal: agent.isGlobal,
		isRecommended: agent.isRecommended,
		curationLabel: agent.curationLabel ?? "none",
	};
}
