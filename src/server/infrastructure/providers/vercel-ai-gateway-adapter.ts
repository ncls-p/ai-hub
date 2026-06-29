import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { logger } from "@/lib/logger";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import type {
	ProviderAdapter,
	ProviderRuntimeConfig,
	ProviderHealth,
	ModelDescriptor,
	ModelCapability,
} from "./adapter";

const DEFAULT_CAPABILITIES: ModelCapability = {
	text: true,
	vision: false,
	tools: false,
	reasoning: false,
	embeddings: false,
	audio: false,
};

const GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";

function normalizeBaseUrl(baseUrl?: string): string {
	const base = baseUrl?.replace(/\/+$/, "") || GATEWAY_BASE_URL;
	return base.endsWith("/v1") ? base : `${base}/v1`;
}

function gatewayHeaders(config: ProviderRuntimeConfig) {
	const headers: Record<string, string> = { ...config.headers };
	const usesBearerAuth = ["gateway", "bearer"].includes(config.authType);

	if (usesBearerAuth && config.apiKey) {
		headers.Authorization = `Bearer ${config.apiKey}`;
	}

	return headers;
}

export const vercelAiGatewayAdapter: ProviderAdapter = {
	kind: "vercel-ai-gateway",

	async validateConnection(
		config: ProviderRuntimeConfig,
	): Promise<ProviderHealth> {
		const start = Date.now();
		try {
			const baseUrl = normalizeBaseUrl(config.baseUrl);
			const headers: Record<string, string> = {
				...config.headers,
			};

			if (config.authType === "gateway" && config.apiKey) {
				headers["Authorization"] = `Bearer ${config.apiKey}`;
			} else if (config.authType === "bearer" && config.apiKey) {
				headers["Authorization"] = `Bearer ${config.apiKey}`;
			}

			const res = await fetch(`${baseUrl}/models`, {
				headers,
				signal: AbortSignal.timeout(10_000),
			});

			if (!res.ok) {
				return {
					status: "unhealthy",
					message: `HTTP ${res.status}: ${res.statusText}`,
					latencyMs: Date.now() - start,
				};
			}

			return {
				status: "healthy",
				message: "Connected successfully",
				latencyMs: Date.now() - start,
			};
		} catch (err) {
			return {
				status: "unhealthy",
				message: (err as Error).message,
				latencyMs: Date.now() - start,
			};
		}
	},

	async listModels(config: ProviderRuntimeConfig): Promise<ModelDescriptor[]> {
		try {
			const res = await fetch(`${normalizeBaseUrl(config.baseUrl)}/models`, {
				headers: gatewayHeaders(config),
				signal: AbortSignal.timeout(15_000),
			});

			if (!res.ok) {
				throw new Error(`Failed to list models: HTTP ${res.status}`);
			}

			const data = (await res.json()) as {
				data?: Array<{ id: string }>;
			};

			return (
				data.data?.map((m) => ({
					modelId: m.id,
					displayName: m.id,
					capabilities: { ...DEFAULT_CAPABILITIES },
				})) ?? []
			);
		} catch (error) {
			logger.error(
				"Failed to list Vercel AI Gateway models",
				{},
				error as Error,
			);
			throw error;
		}
	},

	createChatModel(
		config: ProviderRuntimeConfig,
		modelId: string,
	): LanguageModelV4 {
		const headers: Record<string, string> = { ...config.headers };

		if (config.authType === "gateway" && config.apiKey) {
			headers["Authorization"] = `Bearer ${config.apiKey}`;
		} else if (config.authType === "bearer" && config.apiKey) {
			headers["Authorization"] = `Bearer ${config.apiKey}`;
		}

		const provider = createOpenAICompatible({
			name: "vercel-ai-gateway",
			apiKey: config.apiKey,
			baseURL: normalizeBaseUrl(config.baseUrl),
			headers,
			queryParams: config.queryParams,
			includeUsage: true,
		});

		// Model IDs in gateway format: openai/gpt-4o, anthropic/claude-3.5-sonnet, etc.
		return provider.chatModel(modelId);
	},
};
