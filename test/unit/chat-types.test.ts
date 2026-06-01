import { describe, expect, it } from "vitest";
import {
	appendMessagePart,
	parseToolPart,
	renderablePartsFromMessage,
	type ChatMessage,
} from "@/components/chat/chat-types";

describe("chat message parts", () => {
	it("keeps reasoning blocks split across tool calls", () => {
		let parts: ChatMessage["parts"] = [];

		parts = appendMessagePart(parts, "reasoning", "before tool");
		parts = [
			...parts,
			{
				type: "tool-call",
				content: JSON.stringify({ toolName: "web_search" }),
			},
		];
		parts = appendMessagePart(parts, "reasoning", "after tool");

		expect(parts).toEqual([
			{ type: "reasoning", content: "before tool" },
			{
				type: "tool-call",
				content: JSON.stringify({ toolName: "web_search" }),
			},
			{ type: "reasoning", content: "after tool" },
		]);
	});

	it("still merges consecutive deltas of the same type", () => {
		let parts: ChatMessage["parts"] = [];

		parts = appendMessagePart(parts, "reasoning", "first ");
		parts = appendMessagePart(parts, "reasoning", "second");

		expect(parts).toEqual([{ type: "reasoning", content: "first second" }]);
	});

	it("returns renderable parts in message order", () => {
		const message: ChatMessage = {
			id: "message",
			role: "assistant",
			parts: [
				{ type: "reasoning", content: "thinking" },
				{ type: "tool-call", content: "{}" },
				{ type: "tool-result", content: "{}" },
				{ type: "text", content: "answer" },
				{ type: "citations", content: "[]" },
			],
		};

		expect(
			renderablePartsFromMessage(message).map((part) => part.type),
		).toEqual(["reasoning", "tool-call", "tool-result", "text"]);
	});

	it("merges matching tool calls and results into one renderable card", () => {
		const message: ChatMessage = {
			id: "message",
			role: "assistant",
			parts: [
				{
					type: "tool-call",
					content: JSON.stringify({
						toolCallId: "call-1",
						toolName: "web_search",
						input: { query: "next" },
					}),
				},
				{
					type: "tool-result",
					content: JSON.stringify({
						toolCallId: "call-1",
						toolName: "web_search",
						output: { results: [] },
					}),
				},
			],
		};

		const parts = renderablePartsFromMessage(message);

		expect(parts).toHaveLength(1);
		expect(parts[0].type).toBe("tool-call");
		expect(parseToolPart(parts[0].content)).toMatchObject({
			toolCallId: "call-1",
			toolName: "web_search",
			input: { query: "next" },
			output: { results: [] },
		});
	});

	it("keeps unmatched tool results visible", () => {
		const message: ChatMessage = {
			id: "message",
			role: "assistant",
			parts: [
				{
					type: "tool-result",
					content: JSON.stringify({
						toolCallId: "call-1",
						toolName: "web_search",
						output: "done",
					}),
				},
			],
		};

		expect(
			renderablePartsFromMessage(message).map((part) => part.type),
		).toEqual(["tool-result"]);
	});
});
