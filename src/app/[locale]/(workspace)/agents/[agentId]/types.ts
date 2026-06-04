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
};

export type Provider = { id: string; name: string; kind: string };
export type Model = {
	id: string;
	providerId: string;
	modelId: string;
	displayName: string | null;
};
export type BuiltinTool = {
	id: string;
	name: string;
	description: string;
	riskLevel: string;
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
export type KnowledgeBase = { id: string; name: string };
export type ToolBinding = {
	toolSource: string;
	toolId: string;
	requireApproval: boolean;
};
export type KnowledgeBinding = {
	knowledgeBaseId: string;
	name: string;
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

export const AGENT_ACCENTS = [
	{
		bar: "bg-violet-500",
		iconBg: "bg-violet-500/10",
		text: "text-violet-600 dark:text-violet-400",
	},
	{
		bar: "bg-cyan-500",
		iconBg: "bg-cyan-500/10",
		text: "text-cyan-600 dark:text-cyan-400",
	},
	{
		bar: "bg-emerald-500",
		iconBg: "bg-emerald-500/10",
		text: "text-emerald-600 dark:text-emerald-400",
	},
	{
		bar: "bg-amber-500",
		iconBg: "bg-amber-500/10",
		text: "text-amber-600 dark:text-amber-400",
	},
	{
		bar: "bg-rose-500",
		iconBg: "bg-rose-500/10",
		text: "text-rose-600 dark:text-rose-400",
	},
	{
		bar: "bg-fuchsia-500",
		iconBg: "bg-fuchsia-500/10",
		text: "text-fuchsia-600 dark:text-fuchsia-400",
	},
	{
		bar: "bg-lime-500",
		iconBg: "bg-lime-500/10",
		text: "text-lime-600 dark:text-lime-400",
	},
	{
		bar: "bg-sky-500",
		iconBg: "bg-sky-500/10",
		text: "text-sky-600 dark:text-sky-400",
	},
];

export const defaultGenParams = {
	temperature: "0.7",
	topP: "1",
	maxOutputTokens: "1024",
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
