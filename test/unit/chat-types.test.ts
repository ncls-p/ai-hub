import { describe, expect, it } from "vitest";
import {
	appendMessagePart,
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

		expect(renderablePartsFromMessage(message).map((part) => part.type)).toEqual(
			["reasoning", "tool-call", "tool-result", "text"],
		);
	});
});
