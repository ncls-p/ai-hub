/* ─── Types ─────────────────────────────────────────────────────────── */

export type Agent = {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	sharingMode: "personal" | "marketplace" | "specific_user";
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

export type AgentForm = {
	name: string;
	description: string;
	systemPrompt: string;
	providerId: string;
	modelId: string;
	temperature: string;
	topP: string;
	maxOutputTokens: string;
	maxToolCalls: string;
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

export const AVATAR_COLORS = [
	"from-violet-500 to-indigo-600",
	"from-cyan-500 to-blue-600",
	"from-emerald-500 to-teal-600",
	"from-amber-500 to-orange-600",
	"from-rose-500 to-pink-600",
	"from-fuchsia-500 to-purple-600",
	"from-lime-500 to-green-600",
	"from-sky-500 to-cyan-600",
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
		description: "",
		systemPrompt: "",
		providerId: "",
		modelId: "",
		temperature: defaultGenParams.temperature,
		topP: defaultGenParams.topP,
		maxOutputTokens: defaultGenParams.maxOutputTokens,
		maxToolCalls: defaultGenParams.maxToolCalls,
		sharingMode: "personal",
		shareTargetEmail: "",
		originalSharingMode: "personal",
		isGlobal: false,
		isRecommended: false,
		curationLabel: "none",
	};
}
