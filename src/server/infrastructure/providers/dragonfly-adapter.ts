import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
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

function hasOpenAiModelData(data: unknown): data is { data: OpenAiModel[] } {
	if (typeof data !== "object" || data === null || !("data" in data)) {
		return false;
	}

	return Array.isArray(data.data);
}

function parseOpenAiModels(data: unknown): ModelDescriptor[] {
	if (!hasOpenAiModelData(data)) {
		return [];
	}

	return data.data
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

type DragonflyToolCallContainer = {
	tool_calls?: Array<Record<string, unknown>>;
	tool_calls_index?: unknown;
};

type DragonflyChatChunk = {
	choices?: Array<{
		delta?: DragonflyToolCallContainer;
		message?: DragonflyToolCallContainer;
	}>;
};

function hasOpenAiFunction(toolCall: Record<string, unknown>) {
	return typeof toolCall.function === "object" && toolCall.function !== null;
}

function removeInvalidThinkingToolCalls(chunk: DragonflyChatChunk) {
	for (const choice of chunk.choices ?? []) {
		for (const container of [choice.delta, choice.message]) {
			if (!container?.tool_calls) continue;
			// Dragonfly streams Anthropic content blocks as OpenAI `tool_calls`
			// entries like `{ type: "thinking" }` or `{ type: "text" }`, without
			// the required OpenAI `function` object. The AI SDK correctly rejects
			// those. Reasoning/text content is already exposed via `reasoning_content`
			// and `content`, so drop only non-function tool-call shims.
			const validToolCalls = container.tool_calls.filter(hasOpenAiFunction);
			if (validToolCalls.length > 0) {
				container.tool_calls = validToolCalls;
			} else {
				delete container.tool_calls;
				delete container.tool_calls_index;
			}
		}
	}
	return chunk;
}

function sanitizeDragonflySsePayload(payload: string) {
	if (!payload || payload === "[DONE]") return payload;
	try {
		return JSON.stringify(removeInvalidThinkingToolCalls(JSON.parse(payload)));
	} catch {
		return payload;
	}
}

function sanitizeDragonflySseEvent(eventText: string) {
	const lines = eventText.split("\n");
	return lines
		.map((line) => {
			if (!line.startsWith("data:")) return line;
			const prefix = line.match(/^data:\s*/)?.[0] ?? "data: ";
			const payload = line.slice(prefix.length);
			return `${prefix}${sanitizeDragonflySsePayload(payload)}`;
		})
		.join("\n");
}

type OpenAiCompatibleMessage = Record<string, unknown> & {
	role?: string;
	content?: unknown;
	tool_call_id?: unknown;
	tool_calls?: unknown;
	reasoning_content?: unknown;
};

function isDragonflyAnthropicModel(model: unknown) {
	return (
		typeof model === "string" &&
		(model.includes("claude") || model.includes("anthropic"))
	);
}

function normalizeAnthropicToolLoopMessages(
	messages: unknown,
): OpenAiCompatibleMessage[] | unknown {
	if (!Array.isArray(messages)) return messages;

	return (messages as OpenAiCompatibleMessage[]).map((message) => {
		if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
			const rest = { ...message };
			delete rest.reasoning_content;

			return {
				...rest,
				// Dragonfly's Anthropic bridge rejects assistant prefill when the
				// assistant message also contains tool_calls. Keep the tool_use signal,
				// but remove generated text/reasoning from the replayed assistant turn.
				content: null,
			};
		}

		if (message.role === "tool") {
			return {
				role: "user",
				content: [
					`Tool result for ${String(message.tool_call_id ?? "unknown")}:`,
					typeof message.content === "string"
						? message.content
						: JSON.stringify(message.content ?? null),
					"Use this result to answer the user's request. Do not call the same tool again unless the result is insufficient.",
				].join("\n"),
			};
		}

		return message;
	});
}

async function dragonflyFetch(
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> {
	const response = await fetch(input, init);
	const contentType = response.headers.get("content-type") ?? "";
	if (!response.body || !contentType.includes("text/event-stream")) {
		return response;
	}

	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let buffer = "";

	const stream = new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			buffer += decoder.decode(chunk, { stream: true });
			const events = buffer.split("\n\n");
			buffer = events.pop() ?? "";
			for (const event of events) {
				controller.enqueue(
					encoder.encode(`${sanitizeDragonflySseEvent(event)}\n\n`),
				);
			}
		},
		flush(controller) {
			buffer += decoder.decode();
			if (buffer) {
				controller.enqueue(encoder.encode(sanitizeDragonflySseEvent(buffer)));
			}
		},
	});

	return new Response(response.body.pipeThrough(stream), {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
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
	): LanguageModelV4 {
		const provider = createOpenAICompatible({
			name: "dragonfly",
			apiKey: getBearerApiKey(config),
			baseURL: normalizeBaseUrl(config.baseUrl),
			headers: buildHeaders(config),
			queryParams: config.queryParams,
			fetch: dragonflyFetch,
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
					messages: isDragonflyAnthropicModel(args.model)
						? normalizeAnthropicToolLoopMessages(args.messages)
						: args.messages,
					promptSystem,
					cache: false,
					save: false,
				};
			},
		});

		return provider.chatModel(modelId);
	},
};
