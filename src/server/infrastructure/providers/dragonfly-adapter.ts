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

    // Dragonfly sends API key as X-API-KEY
    if (config.apiKey) {
        headers["X-API-KEY"] = config.apiKey;
    }

    return headers;
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
            data?: Array<{ id: string }>;
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
            name: "dragonfly",
            apiKey: config.apiKey,
            baseURL: normalizeBaseUrl(config.baseUrl),
            headers: buildHeaders(config),
            queryParams: config.queryParams,
            includeUsage: true,
            // Dragonfly uses a custom endpoint path
            transformRequestBody: (args: Record<string, unknown>) => {
                const messages = args.messages as
                    | Array<{
                          role?: string;
                          content?: unknown;
                      }>
                    | undefined;
                const systemMessage = messages?.find(
                    (m) => m.role === "system",
                );
                return {
                    ...args,
                    promptSystem: systemMessage?.content ?? undefined,
                    save: false,
                };
            },
        });

        return provider.chatModel(modelId);
    },
};
