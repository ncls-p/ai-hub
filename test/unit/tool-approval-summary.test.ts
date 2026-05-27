import { describe, expect, it } from "vitest";

import { summarizeToolInput } from "@/components/chat/tool-approval-banner";

describe("tool approval summary", () => {
	it("summarizes URL access tools", () => {
		expect(
			summarizeToolInput("fetch_url", { url: "https://example.com/docs" }),
		).toBe("Access URL https://example.com/docs");
	});

	it("summarizes search tools", () => {
		expect(summarizeToolInput("web_search", { query: "AI Hub pricing" })).toBe(
			'Search for "AI Hub pricing"',
		);
	});

	it("falls back to parameter count", () => {
		expect(
			summarizeToolInput("custom_tool", { foo: "bar", baz: "qux" }),
		).toBe("Run custom_tool with 2 parameters");
	});
});
