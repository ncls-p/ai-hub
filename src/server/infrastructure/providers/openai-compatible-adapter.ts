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

    async listModels(
        config: ProviderRuntimeConfig,
    ): Promise<ModelDescriptor[]> {
        const baseUrl = normalizeBaseUrl(config.baseUrl);
        const headers = buildHeaders(config);

        const res = await fetch(`${baseUrl}/models`, {
            headers,
            signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
            throw new Error(`Failed to list models: HTTP ${res.status}`);
        }

        const data = (await res.json()) as {
            data?: Array<{ id: string; object?: string }>;
        };

        return (
            data.data?.map((m) => ({
                modelId: m.id,
                displayName: m.id,
                capabilities: { ...DEFAULT_CAPABILITIES },
            })) ?? []
        );
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
