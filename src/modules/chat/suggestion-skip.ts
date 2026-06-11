const globalStore = globalThis as typeof globalThis & {
	__aiHubSkipNextChatSuggestions?: Set<string>;
};

const skipNextSuggestions =
	globalStore.__aiHubSkipNextChatSuggestions ?? new Set<string>();
globalStore.__aiHubSkipNextChatSuggestions = skipNextSuggestions;

export function requestSkipNextChatSuggestions(conversationId: string) {
	skipNextSuggestions.add(conversationId);
}

export function consumeSkipNextChatSuggestions(conversationId: string) {
	const shouldSkip = skipNextSuggestions.has(conversationId);
	if (shouldSkip) skipNextSuggestions.delete(conversationId);
	return shouldSkip;
}
