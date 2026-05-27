export interface ChatAgent {
	id: string;
	name: string;
	description: string | null;
	activeVersionId: string | null;
}

export interface ChatConversation {
	id: string;
	title: string;
	agentId: string;
	updatedAt: string;
}

export interface AgentVersion {
	id: string;
	providerId: string | null;
	modelId: string | null;
	isActive: boolean;
}

export interface ChatMessagePart {
	type: string;
	content: string;
}

export interface ChatMessage {
	id: string;
	role: "user" | "assistant" | "system" | "tool";
	status?: string;
	parts: ChatMessagePart[];
	createdAt?: string;
}

export interface PendingToolApproval {
	invocationId: string;
	toolName: string;
	input: unknown;
}

export interface ChatCitation {
	chunkId: string;
	documentId: string;
	documentTitle: string;
	content: string;
	score: number;
	knowledgeBaseId?: string;
	knowledgeBaseName?: string;
}

export type ChatStreamEvent =
	| { type: "text" | "reasoning"; delta: string }
	| { type: "error"; error: string }
	| {
			type: "tool_approval_required";
			invocationId: string;
			toolName: string;
			input: unknown;
	  }
	| {
			type: "tool_call";
			toolCallId: string;
			toolName: string;
			input: unknown;
	  }
	| {
			type: "tool_result";
			toolCallId: string;
			toolName: string;
			output: unknown;
	  }
	| { type: "citations"; citations: ChatCitation[] };

export type Agent = ChatAgent;
export type Conversation = ChatConversation;
export type CitationSource = ChatCitation;

export function textFromMessage(message: ChatMessage) {
	return message.parts
		.filter((part) => part.type === "text")
		.map((part) => part.content)
		.join("\n");
}

export function reasoningFromMessage(message: ChatMessage) {
	return message.parts
		.filter((part) => part.type === "reasoning")
		.map((part) => part.content)
		.join("\n");
}

export function toolPartsFromMessage(message: ChatMessage) {
	return message.parts.filter(
		(part) => part.type === "tool-call" || part.type === "tool-result",
	);
}

export function citationsFromMessage(message: ChatMessage): ChatCitation[] {
	const part = message.parts.find((p) => p.type === "citations");
	if (!part?.content) return [];
	try {
		return JSON.parse(part.content) as ChatCitation[];
	} catch {
		return [];
	}
}

export function parseToolPart(content: string): {
	toolName?: string;
	input?: unknown;
	output?: unknown;
	denied?: boolean;
	message?: string;
} {
	if (!content) return {};
	try {
		const parsed = JSON.parse(content) as Record<string, unknown>;
		return parsed as ReturnType<typeof parseToolPart>;
	} catch {
		return { output: content };
	}
}

export function summarizeToolPart(content: string) {
	const parsed = parseToolPart(content);
	if (parsed.toolName) return parsed.toolName;
	const fallback = parsed.output ?? parsed.input ?? parsed;
	const text =
		typeof fallback === "string" ? fallback : JSON.stringify(fallback);
	return text.slice(0, 120);
}

export function createLocalMessage(
	role: "user" | "assistant",
	content: string,
): ChatMessage {
	return {
		id:
			typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
				? crypto.randomUUID()
				: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		role,
		status: role === "assistant" ? "streaming" : "completed",
		parts: [{ type: "text", content }],
	};
}

export function appendMessagePart(
	parts: ChatMessage["parts"],
	type: "text" | "reasoning",
	delta: string,
) {
	const nextParts = [...parts];
	const existingIndex = nextParts.findIndex((part) => part.type === type);

	if (existingIndex === -1) {
		return [...nextParts, { type, content: delta }];
	}

	nextParts[existingIndex] = {
		...nextParts[existingIndex],
		content: `${nextParts[existingIndex].content}${delta}`,
	};
	return nextParts;
}

export function isChatStreamEvent(value: unknown): value is ChatStreamEvent {
	if (typeof value !== "object" || value === null || !("type" in value)) {
		return false;
	}

	const event = value as {
		type?: unknown;
		delta?: unknown;
		error?: unknown;
		invocationId?: unknown;
		toolName?: unknown;
		input?: unknown;
		citations?: unknown;
		sources?: unknown;
	};

	if (
		(event.type === "text" || event.type === "reasoning") &&
		typeof event.delta === "string"
	) {
		return true;
	}
	if (event.type === "error" && typeof event.error === "string") {
		return true;
	}
	if (
		event.type === "tool_approval_required" &&
		typeof event.invocationId === "string" &&
		typeof event.toolName === "string"
	) {
		return true;
	}
	if (
		(event.type === "tool_call" || event.type === "tool_result") &&
		typeof event.toolName === "string"
	) {
		return true;
	}
	if (
		event.type === "citations" &&
		(Array.isArray(event.citations) || Array.isArray(event.sources))
	) {
		return true;
	}
	return false;
}
