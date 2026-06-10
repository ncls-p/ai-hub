import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let publishChatStreamEvent: (
	messageId: string,
	event: Record<string, unknown>,
) => void;
let completeChatStream: (messageId: string) => void;
let hasActiveChatStream: (messageId: string) => boolean;
let subscribeToChatStream: (
	messageId: string,
	subscriber: { enqueue: (e: Record<string, unknown>) => void; close: () => void },
	options?: { replay?: boolean },
) => () => void;
let abortChatStream: (messageId: string) => boolean;
let registerChatStreamAbortController: (
	messageId: string,
	controller: AbortController,
) => void;

beforeEach(async () => {
	vi.resetModules();
	({
		publishChatStreamEvent,
		completeChatStream,
		hasActiveChatStream,
		subscribeToChatStream,
		abortChatStream,
		registerChatStreamAbortController,
	} = await import("@/modules/chat/stream-bus"));
});

afterEach(() => {
	vi.resetModules();
});

describe("stream-bus", () => {
	describe("hasActiveChatStream", () => {
		it("returns false for unknown message", () => {
			expect(hasActiveChatStream(crypto.randomUUID())).toBe(false);
		});

		it("returns true after first publish", () => {
			const id = crypto.randomUUID();
			publishChatStreamEvent(id, { type: "text" });
			expect(hasActiveChatStream(id)).toBe(true);
		});

		it("returns false after stream is completed", () => {
			const id = crypto.randomUUID();
			publishChatStreamEvent(id, { type: "text" });
			completeChatStream(id);
			expect(hasActiveChatStream(id)).toBe(false);
		});
	});

	describe("subscribeToChatStream", () => {
		it("replays past events to new subscriber", () => {
			const id = crypto.randomUUID();
			const events = [{ type: "text", content: "a" }, { type: "text", content: "b" }];
			for (const e of events) publishChatStreamEvent(id, e);

			const received: Record<string, unknown>[] = [];
			const closed = { value: false };
			subscribeToChatStream(id, {
				enqueue: (e) => received.push(e),
				close: () => { closed.value = true; },
			});

			expect(received).toEqual(events);
			expect(closed.value).toBe(false);
		});

		it("skips replay when replay=false", () => {
			const id = crypto.randomUUID();
			publishChatStreamEvent(id, { type: "text", content: "old" });

			const received: Record<string, unknown>[] = [];
			subscribeToChatStream(
				id,
				{ enqueue: (e) => received.push(e), close: () => {} },
				{ replay: false },
			);

			expect(received).toHaveLength(0);
		});

		it("immediately closes subscriber when stream is already done", () => {
			const id = crypto.randomUUID();
			completeChatStream(id);

			const closed = { value: false };
			subscribeToChatStream(id, {
				enqueue: () => {},
				close: () => { closed.value = true; },
			});

			expect(closed.value).toBe(true);
		});

		it("delivers new events to active subscriber", () => {
			const id = crypto.randomUUID();
			const received: Record<string, unknown>[] = [];
			subscribeToChatStream(id, {
				enqueue: (e) => received.push(e),
				close: () => {},
			});

			publishChatStreamEvent(id, { type: "delta", token: "hi" });

			expect(received).toEqual([{ type: "delta", token: "hi" }]);
		});

		it("closes subscriber when stream completes", () => {
			const id = crypto.randomUUID();
			const closed = { value: false };
			subscribeToChatStream(id, {
				enqueue: () => {},
				close: () => { closed.value = true; },
			});

			completeChatStream(id);

			expect(closed.value).toBe(true);
		});

		it("unsubscribe stops delivering events", () => {
			const id = crypto.randomUUID();
			const received: Record<string, unknown>[] = [];
			const unsubscribe = subscribeToChatStream(id, {
				enqueue: (e) => received.push(e),
				close: () => {},
			});

			unsubscribe();
			publishChatStreamEvent(id, { type: "delta" });

			expect(received).toHaveLength(0);
		});
	});

	describe("abortChatStream", () => {
		it("returns false for unknown message", () => {
			expect(abortChatStream(crypto.randomUUID())).toBe(false);
		});

		it("returns false for already completed stream", () => {
			const id = crypto.randomUUID();
			completeChatStream(id);
			expect(abortChatStream(id)).toBe(false);
		});

		it("returns true and marks stream done", () => {
			const id = crypto.randomUUID();
			publishChatStreamEvent(id, { type: "text" });

			expect(abortChatStream(id)).toBe(true);
			expect(hasActiveChatStream(id)).toBe(false);
		});

		it("calls abort on registered controller", () => {
			const id = crypto.randomUUID();
			publishChatStreamEvent(id, { type: "text" });

			const controller = new AbortController();
			registerChatStreamAbortController(id, controller);

			abortChatStream(id);

			expect(controller.signal.aborted).toBe(true);
		});
	});

	describe("publishChatStreamEvent", () => {
		it("stores event in run history", () => {
			const id = crypto.randomUUID();
			publishChatStreamEvent(id, { type: "text", content: "hello" });
			publishChatStreamEvent(id, { type: "done" });

			const received: Record<string, unknown>[] = [];
			subscribeToChatStream(
				id,
				{ enqueue: (e) => received.push(e), close: () => {} },
				{ replay: true },
			);

			expect(received).toHaveLength(2);
		});
	});
});
