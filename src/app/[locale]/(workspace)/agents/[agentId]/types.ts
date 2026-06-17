/* ─── Types ─────────────────────────────────────────────────────────── */

export type Agent = {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	activeVersionId?: string | null;
	sharingMode: "personal" | "marketplace" | "specific_user";
	shareTargetEmail?: string | null;
	isGlobal: boolean;
	isRecommended: boolean;
	curationLabel: string | null;
	canAdminCurate: boolean;
	canEdit?: boolean;
	canClone?: boolean;
};

export type Provider = { id: string; name: string; kind: string };
export type Model = {
	id: string;
	providerId: string;
	modelId: string;
	displayName: string | null;
	logoUrl?: string | null;
};
export type BuiltinTool = {
	id: string;
	name: string;
	displayName: string;
	description: string;
	riskLevel: string;
	category?: string;
};
export type McpServer = { id: string; name: string; requireApproval: boolean };
export type McpTool = {
	id: string;
	name: string;
	description: string | null;
	mcpServerId: string;
	enabled: boolean;
	requireApproval: boolean;
};
export type CustomTool = {
	id: string;
	name: string;
	description: string | null;
	status: string;
};
export type KnowledgeBase = { id: string; name: string };
export type AgentSkill = {
	id: string;
	name: string;
	description: string | null;
};
export type ToolBinding = {
	toolSource: string;
	toolId: string;
	requireApproval: boolean;
};
export type KnowledgeBinding = {
	knowledgeBaseId: string;
	name: string;
};
export type SkillBinding = {
	skillId: string;
	name: string;
	description: string | null;
};

export type ToolFilter = "all" | "enabled" | "disabled";

export type AgentToolChoice = "auto" | "required" | "none";
export type AgentResponseFormat = "text" | "json_object";

export interface AgentGenerationSettings {
	topK: string;
	presencePenalty: string;
	frequencyPenalty: string;
	seed: string;
	maxRetries: string;
	stopSequences: string;
}

export interface AgentMemoryPolicy {
	enabled: boolean;
	maxMessages: number;
}

export interface AgentGuardrails {
	enabled: boolean;
	blockedTopics: string[];
}

export interface AgentApprovalPolicy {
	requireApprovalForAllTools: boolean;
}

export type AgentForm = {
	name: string;
	slug: string;
	description: string;
	systemPrompt: string;
	providerId: string;
	modelId: string;
	temperature: string;
	topP: string;
	maxOutputTokens: string;
	maxToolCalls: string;
	toolChoice: AgentToolChoice;
	generationSettings: AgentGenerationSettings;
	responseFormat: AgentResponseFormat;
	memoryPolicy: AgentMemoryPolicy;
	guardrails: AgentGuardrails;
	approvalPolicy: AgentApprovalPolicy;
	sharingMode: Agent["sharingMode"];
	shareTargetEmail: string;
	originalSharingMode: Agent["sharingMode"];
	isGlobal: boolean;
	isRecommended: boolean;
	curationLabel: string;
};

export type ToolBindingState = Record<
	string,
	{ enabled: boolean; requireApproval: boolean }
>;

/* ─── Constants ─────────────────────────────────────────────────────── */

export const defaultGenParams = {
	temperature: "0.7",
	topP: "1",
	maxOutputTokens: "30000",
	maxToolCalls: "6",
};

export function createEmptyForm(): AgentForm {
	return {
		name: "",
		slug: "",
		description: "",
		systemPrompt: "",
		providerId: "",
		modelId: "",
		temperature: defaultGenParams.temperature,
		topP: defaultGenParams.topP,
		maxOutputTokens: defaultGenParams.maxOutputTokens,
		maxToolCalls: defaultGenParams.maxToolCalls,
		toolChoice: "auto",
		generationSettings: {
			topK: "",
			presencePenalty: "",
			frequencyPenalty: "",
			seed: "",
			maxRetries: "",
			stopSequences: "",
		},
		responseFormat: "text",
		memoryPolicy: { enabled: false, maxMessages: 50 },
		guardrails: { enabled: false, blockedTopics: [] },
		approvalPolicy: { requireApprovalForAllTools: false },
		sharingMode: "personal",
		shareTargetEmail: "",
		originalSharingMode: "personal",
		isGlobal: false,
		isRecommended: false,
		curationLabel: "none",
	};
}
