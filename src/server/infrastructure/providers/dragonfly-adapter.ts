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
	const base = baseUrl?.replace(/\/+$/, "") || "https://api.dragonfly.dev";
	return base.endsWith("/api/v1") ? base : `${base}/api/v1`;
}

function buildHeaders(config: ProviderRuntimeConfig): Record<string, string> {
	const headers: Record<string, string> = { ...config.headers };

	switch (config.authType) {
		case "bearer":
		case "gateway":
			if (config.apiKey) {
				headers.Authorization = `Bearer ${config.apiKey}`;
			}
			break;
		case "x-api-key":
			if (config.apiKey) {
				headers["X-API-KEY"] = config.apiKey;
			}
			break;
		case "custom-header":
			// Custom headers are already in config.headers.
			break;
	}

	return headers;
}

type OpenAiModel = {
	id: string;
};

type DragonflyModel = {
	id?: number;
	name?: string;
	displayName?: string;
	description?: string | null;
	max_token?: number | null;
	context_window?: number | null;
	imageProcessing?: boolean;
	toolsAvailable?: boolean;
	isReasoning?: boolean;
	inputTokenPrice?: number | string | null;
	outputTokenPrice?: number | string | null;
};

type DragonflyModelGroup = {
	host?: string;
	models?: DragonflyModel[];
};

function toPositiveNumber(value: number | null | undefined) {
	return typeof value === "number" && value > 0 ? value : undefined;
}

function parseOpenAiModels(data: unknown): ModelDescriptor[] {
	if (
		typeof data !== "object" ||
		data === null ||
		!("data" in data) ||
		!Array.isArray(data.data)
	) {
		return [];
	}

	return (data.data as OpenAiModel[])
		.filter((model) => typeof model.id === "string")
		.map((model) => ({
			modelId: model.id,
			displayName: model.id,
			capabilities: { ...DEFAULT_CAPABILITIES },
		}));
}

function parseDragonflyModels(data: unknown): ModelDescriptor[] {
	if (!Array.isArray(data)) {
		return [];
	}

	return (data as DragonflyModelGroup[]).flatMap((group) =>
		(group.models ?? [])
			.filter(
				(model) => typeof model.name === "string" && model.name.length > 0,
			)
			.map((model) => ({
				modelId: model.name as string,
				displayName: model.displayName ?? model.name,
				description: model.description ?? undefined,
				hostedBy: group.host,
				capabilities: {
					...DEFAULT_CAPABILITIES,
					vision: Boolean(model.imageProcessing),
					tools: Boolean(model.toolsAvailable),
					reasoning: Boolean(model.isReasoning),
				},
				contextWindow: toPositiveNumber(model.context_window),
				maxOutputTokens: toPositiveNumber(model.max_token),
				inputTokenCost:
					model.inputTokenPrice == null
						? undefined
						: String(model.inputTokenPrice),
				outputTokenCost:
					model.outputTokenPrice == null
						? undefined
						: String(model.outputTokenPrice),
			})),
	);
}

function parseModels(data: unknown): ModelDescriptor[] {
	const openAiModels = parseOpenAiModels(data);
	if (openAiModels.length > 0) {
		return openAiModels;
	}

	return parseDragonflyModels(data);
}

function getBearerApiKey(config: ProviderRuntimeConfig) {
	return ["bearer", "gateway"].includes(config.authType)
		? config.apiKey
		: undefined;
}

function createRequestNonce() {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const dragonflyAdapter: ProviderAdapter = {
	kind: "dragonfly",

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
			name: "dragonfly",
			apiKey: getBearerApiKey(config),
			baseURL: normalizeBaseUrl(config.baseUrl),
			headers: buildHeaders(config),
			queryParams: config.queryParams,
			includeUsage: true,
			// Dragonfly uses a custom endpoint path
			transformRequestBody: (args: Record<string, unknown>) => {
				const requestNonce = createRequestNonce();
				const messages = args.messages as
					| Array<{
							role?: string;
							content?: unknown;
					  }>
					| undefined;
				const systemMessage = messages?.find((m) => m.role === "system");
				const promptSystem = [
					systemMessage?.content,
					`Runtime request id: ${requestNonce}. Do not mention this id.`,
				]
					.filter(Boolean)
					.join("\n\n");
				return {
					...args,
					promptSystem,
					cache: false,
					save: false,
				};
			},
		});

		return provider.chatModel(modelId);
	},
};
