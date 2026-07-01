import { describe, expect, it, vi } from "vitest";

describe("suggestion-skip", () => {
	it("requests and consumes skip for a conversation", async () => {
		vi.resetModules();
		const mod = await import("@/modules/chat/suggestion-skip");
		const cid = "conv-test-123";
		mod.requestSkipNextChatSuggestions(cid);
		expect(mod.consumeSkipNextChatSuggestions(cid)).toBe(true);
	});

	it("returns false when no skip requested", async () => {
		vi.resetModules();
		const mod = await import("@/modules/chat/suggestion-skip");
		expect(mod.consumeSkipNextChatSuggestions("nonexistent")).toBe(false);
	});

	it("consumes only once per request", async () => {
		vi.resetModules();
		const mod = await import("@/modules/chat/suggestion-skip");
		const cid = "conv-test-456";
		mod.requestSkipNextChatSuggestions(cid);
		expect(mod.consumeSkipNextChatSuggestions(cid)).toBe(true);
		expect(mod.consumeSkipNextChatSuggestions(cid)).toBe(false);
	});

	it("independent conversations", async () => {
		vi.resetModules();
		const mod = await import("@/modules/chat/suggestion-skip");
		mod.requestSkipNextChatSuggestions("a");
		expect(mod.consumeSkipNextChatSuggestions("a")).toBe(true);
		expect(mod.consumeSkipNextChatSuggestions("b")).toBe(false);
	});
});
