export interface CredentialFieldSchema {
	key: string;
	label: string;
	type?: string;
	required?: boolean;
	description?: string | null;
}

export interface AgentVersionManifest {
	systemPrompt?: string | null;
	providerId?: string | null;
	modelId?: string | null;
	providerName?: string | null;
	modelName?: string | null;
	temperature?: string | null;
	topP?: string | null;
	maxOutputTokens?: number | null;
	maxToolCalls?: number;
	toolChoice?: string | null;
	generationSettings?: Record<string, unknown> | null;
	responseFormat?: Record<string, unknown> | null;
	memoryPolicy?: Record<string, unknown> | null;
	guardrails?: Record<string, unknown> | null;
	approvalPolicy?: Record<string, unknown> | null;
}

export interface PortableToolBinding {
	source: "builtin" | "mcp" | "custom";
	ref: string;
	label?: string;
	requireApproval: boolean;
	riskLevel?: string | null;
}

export interface PortableSkillBinding {
	ref: string;
	bundled?: SkillContentManifest;
}

export interface PortableKnowledgeBinding {
	name: string;
	description?: string | null;
}

export interface SkillContentManifest {
	markdownFiles: Array<{ path: string; content: string }>;
	sourcePackage?: string;
	sourceSkillName?: string;
	installCommand?: string;
	metadata?: Record<string, unknown>;
	fileCount?: number;
	totalBytes?: number;
}

export interface AgentMarketplaceManifest {
	type: "agent";
	name: string;
	description?: string;
	agent: AgentVersionManifest;
	toolBindings?: PortableToolBinding[];
	skillBindings?: PortableSkillBinding[];
	knowledgeBindings?: PortableKnowledgeBinding[];
	bundledResources?: {
		skills: Array<{ name: string; skill: SkillContentManifest }>;
		mcpPresets: McpPresetMarketplaceManifest[];
		customTools: ToolMarketplaceManifest[];
	};
	permissions?: Record<string, unknown>;
}

export interface SkillMarketplaceManifest {
	type: "skill";
	name: string;
	description?: string;
	skill: SkillContentManifest;
}

export interface ToolMarketplaceManifest {
	type: "custom_tool";
	name: string;
	description?: string;
	tool: {
		status?: string;
		inputSchema?: Record<string, unknown>;
		outputSchema?: Record<string, unknown>;
		n8nWorkflowId?: string;
		n8nWorkflowUrl?: string;
		metadata?: Record<string, unknown>;
		credentialSchema?: CredentialFieldSchema[];
		encryptedCredentialRefs?: Array<{
			provider: string;
			label: string;
			n8nCredentialId?: string | null;
			encryptedPayload: string;
			metadata?: Record<string, unknown> | null;
		}>;
		requiresCredentials?: boolean;
		secretsIncluded?: boolean;
	};
}

export interface McpPresetMarketplaceManifest {
	type: "mcp_preset";
	name: string;
	description?: string;
	preset: {
		scope: "server" | "tool";
		serverName: string;
		transport: "stdio" | "sse" | "streamable-http";
		command?: string;
		args?: string[];
		url?: string;
		enabled: boolean;
		requireApproval: boolean;
		healthStatus?: string;
		requiresCredentials: boolean;
		secretsIncluded?: boolean;
		credentialSchema?: CredentialFieldSchema[];
		encryptedHeadersJson?: unknown;
		encryptedEnvJson?: unknown;
		tools: Array<{
			name: string;
			description?: string | null;
			inputSchema?: Record<string, unknown> | null;
			outputSchema?: Record<string, unknown> | null;
			requireApproval: boolean;
			enabled: boolean;
		}>;
	};
}

export type MarketplaceManifest =
	| AgentMarketplaceManifest
	| SkillMarketplaceManifest
	| ToolMarketplaceManifest
	| McpPresetMarketplaceManifest;

export type SourceResourceType =
	| "agent"
	| "skill"
	| "custom_tool"
	| "mcp_server"
	| "mcp_tool";

export function skillFileStats(
	files: Array<{ path: string; content: string }>,
) {
	return {
		fileCount: files.length,
		totalBytes: files.reduce((sum, f) => sum + f.content.length, 0),
	};
}
