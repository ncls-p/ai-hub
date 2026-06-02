import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV2 } from "@ai-sdk/provider";
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

function normalizeBaseUrl(baseUrl?: string): string {
	const base = baseUrl?.replace(/\/+$/, "") || "https://api.openai.com";
	return base.endsWith("/v1") ? base : `${base}/v1`;
}

function buildHeaders(config: ProviderRuntimeConfig): Record<string, string> {
	const headers: Record<string, string> = { ...config.headers };

	switch (config.authType) {
		case "bearer":
			if (config.apiKey) {
				headers["Authorization"] = `Bearer ${config.apiKey}`;
			}
			break;
		case "x-api-key":
			if (config.apiKey) {
				headers["X-API-KEY"] = config.apiKey;
			}
			break;
		case "custom-header":
			// Custom headers already in config.headers
			break;
	}

	return headers;
}

type OpenAICompatibleModel = {
	// Official OpenAI Model object fields.
	id: string;
	object?: "model" | string;
	created?: number;
	owned_by?: string;

	// Non-standard fields exposed by OpenAI-compatible proxies such as llama.cpp.
	architecture?: {
		input_modalities?: string[];
		output_modalities?: string[];
	};
	backend?: string;
	task?: string;
	meta?: {
		n_ctx?: number;
		n_ctx_train?: number;
	};
};

function toPositiveNumber(value: number | null | undefined) {
	return typeof value === "number" && value > 0 ? value : undefined;
}

function normalizeModalities(values: string[] | undefined) {
	return new Set((values ?? []).map((value) => value.toLowerCase()));
}

function isChatModel(model: OpenAICompatibleModel) {
	// OpenAI's official /models response has no backend field. If a proxy adds one,
	// this adapter only registers language models because it creates chat models.
	return !model.backend || model.backend === "llm";
}

function capabilitiesFromModel(model: OpenAICompatibleModel): ModelCapability {
	const capabilities = { ...DEFAULT_CAPABILITIES };
	const inputModalities = normalizeModalities(
		model.architecture?.input_modalities,
	);
	const outputModalities = normalizeModalities(
		model.architecture?.output_modalities,
	);
	const task = model.task?.toLowerCase();

	if (inputModalities.has("image")) capabilities.vision = true;
	if (inputModalities.has("audio") || outputModalities.has("audio")) {
		capabilities.audio = true;
	}
	if (task === "embedding" || task === "embeddings") {
		capabilities.embeddings = true;
	}

	return capabilities;
}

function parseModels(data: unknown): ModelDescriptor[] {
	if (
		typeof data !== "object" ||
		data === null ||
		!("data" in data) ||
		!Array.isArray(data.data)
	) {
		return [];
	}

	return (data.data as OpenAICompatibleModel[])
		.filter((model) => typeof model.id === "string" && isChatModel(model))
		.map((model) => ({
			modelId: model.id,
			displayName: model.id,
			capabilities: capabilitiesFromModel(model),
			contextWindow: toPositiveNumber(
				model.meta?.n_ctx ?? model.meta?.n_ctx_train,
			),
		}));
}

export const openaiCompatibleAdapter: ProviderAdapter = {
	kind: "openai-compatible",

	async validateConnection(
		config: ProviderRuntimeConfig,
	): Promise<ProviderHealth> {
		const start = Date.now();
		try {
			const baseUrl = normalizeBaseUrl(config.baseUrl);
			const headers = buildHeaders(config);

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
		const baseUrl = normalizeBaseUrl(config.baseUrl);
		const headers = buildHeaders(config);

		const res = await fetch(`${baseUrl}/models`, {
			headers,
			signal: AbortSignal.timeout(15_000),
		});

		if (!res.ok) {
			throw new Error(`Failed to list models: HTTP ${res.status}`);
		}

		const data = (await res.json()) as unknown;
		return parseModels(data);
	},

	createChatModel(
		config: ProviderRuntimeConfig,
		modelId: string,
	): LanguageModelV2 {
		const provider = createOpenAICompatible({
			name: config.name || "openai-compatible",
			apiKey: config.apiKey,
			baseURL: normalizeBaseUrl(config.baseUrl),
			headers: buildHeaders(config),
			queryParams: config.queryParams,
			includeUsage: true,
		});

		return provider.chatModel(modelId);
	},
};
