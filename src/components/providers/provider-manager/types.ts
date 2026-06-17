export type ProviderKind =
	| "openai-compatible"
	| "dragonfly"
	| "vercel-ai-gateway"
	| "native";

export type ProviderAuthType =
	| "bearer"
	| "x-api-key"
	| "custom-header"
	| "gateway";

export type SafeProvider = {
	id: string;
	workspaceId: string;
	kind: ProviderKind;
	name: string;
	baseUrl: string | null;
	authType: ProviderAuthType;
	enabled: boolean;
	healthStatus: string | null;
	lastCheckedAt: string | null;
	hasApiKey: boolean;
	hasCustomHeaders: boolean;
	createdAt: string;
};

export type ProviderModel = {
	id: string;
	providerId: string;
	modelId: string;
	displayName: string | null;
	logoUrl: string | null;
	capabilitiesJson: Record<string, boolean> | null;
	contextWindow: number | null;
	maxOutputTokens: number | null;
	inputTokenCost: string | null;
	outputTokenCost: string | null;
	enabled: boolean;
};

export type DiscoveredModel = {
	modelId: string;
	displayName?: string;
	description?: string;
	hostedBy?: string;
	capabilities?: Record<string, boolean>;
	contextWindow?: number;
	maxOutputTokens?: number;
	inputTokenCost?: string;
	outputTokenCost?: string;
};
