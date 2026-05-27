import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { BuiltInToolDefinition } from "@/modules/tool/builtin-tools";

let listBuiltInTools: () => unknown[];
let getBuiltInTool: (id: string) => BuiltInToolDefinition | null;
let getBuiltInToolByName: (name: string) => BuiltInToolDefinition | null;
let requiresApproval: (riskLevel: string | null | undefined) => boolean;

beforeAll(async () => {
	process.env.APP_ENCRYPTION_KEY =
		"0000000000000000000000000000000000000000000000000000000000000000";
	process.env.APP_ENCRYPTION_KEY_ID = "default";

	({
		listBuiltInTools,
		getBuiltInTool,
		getBuiltInToolByName,
		requiresApproval,
	} = await import("@/modules/tool/builtin-tools"));
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("built-in tool registry", () => {
	it("returns all registered tools", () => {
		const tools = listBuiltInTools();
		expect(Array.isArray(tools)).toBe(true);
		expect(tools.length).toBeGreaterThanOrEqual(3);
	});

	it("each tool has required fields", () => {
		const tools = listBuiltInTools();
		for (const tool of tools) {
			expect(tool).toHaveProperty("id");
			expect(tool).toHaveProperty("name");
			expect(tool).toHaveProperty("displayName");
			expect(tool).toHaveProperty("description");
			expect(tool).toHaveProperty("riskLevel");
			expect(tool).toHaveProperty("requiresApprovalByDefault");
		}
	});

	it("finds tool by ID", () => {
		const tools = listBuiltInTools();
		const firstId = (tools[0] as { id: string }).id;
		const tool = getBuiltInTool(firstId);
		expect(tool).not.toBeNull();
		expect(tool!.id).toBe(firstId);
	});

	it("returns null for unknown tool ID", () => {
		expect(getBuiltInTool("nonexistent-id")).toBeNull();
	});

	it("finds tool by name", () => {
		const calculator = getBuiltInToolByName("calculator");
		expect(calculator).not.toBeNull();
		expect(calculator!.name).toBe("calculator");
	});

	it("includes web search", () => {
		const webSearch = getBuiltInToolByName("web_search");
		expect(webSearch).not.toBeNull();
		expect(webSearch!.riskLevel).toBe("medium");
	});

	it("returns null for unknown tool name", () => {
		expect(getBuiltInToolByName("nonexistent-tool")).toBeNull();
	});
});

describe("requiresApproval", () => {
	it("returns true for high risk", () => {
		expect(requiresApproval("high")).toBe(true);
	});

	it("returns true for critical risk", () => {
		expect(requiresApproval("critical")).toBe(true);
	});

	it("returns false for low risk", () => {
		expect(requiresApproval("low")).toBe(false);
	});

	it("returns false for medium risk", () => {
		expect(requiresApproval("medium")).toBe(false);
	});

	it("returns false for null", () => {
		expect(requiresApproval(null)).toBe(false);
	});

	it("returns false for undefined", () => {
		expect(requiresApproval(undefined)).toBe(false);
	});
});

describe("calculator tool", () => {
	it("evaluates simple arithmetic", async () => {
		const tool = getBuiltInToolByName("calculator");
		expect(tool).not.toBeNull();
		const result = await tool!.execute({ expression: "2 + 3" });
		expect((result as { result: number }).result).toBe(5);
	});

	it("evaluates complex expressions", async () => {
		const tool = getBuiltInToolByName("calculator");
		const result = await tool!.execute({ expression: "(2 + 3) * 4" });
		expect((result as { result: number }).result).toBe(20);
	});

	it("rejects non-finite results", () => {
		const tool = getBuiltInToolByName("calculator");
		expect(() => tool!.execute({ expression: "1 / 0" })).toThrow(
			"Expression did not evaluate to a finite number",
		);
	});
});

describe("current_time tool", () => {
	it("returns time info", async () => {
		const tool = getBuiltInToolByName("current_time");
		expect(tool).not.toBeNull();
		const result = await tool!.execute({ timezone: "UTC" });
		const typed = result as {
			timezone: string;
			iso: string;
			formatted: string;
		};
		expect(typed).toHaveProperty("iso");
		expect(typed).toHaveProperty("formatted");
		expect(typed.timezone).toBe("UTC");
	});
});

describe("web_search tool", () => {
	it("queries SearXNG and normalizes results", async () => {
		const fetchMock = vi.fn(async (url: string | URL) => {
			expect(String(url)).toContain("/search?");
			expect(String(url)).toContain("format=json");
			expect(String(url)).toContain("q=ai+hub");
			return new Response(
				JSON.stringify({
					results: [
						{
							title: "AI Hub",
							url: "https://example.com/ai-hub",
							content: "Workspace assistant platform",
							score: 2.5,
							engines: ["duckduckgo"],
						},
						{
							title: "Ignored result without URL",
							content: "Missing URL",
						},
					],
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			);
		});
		vi.stubGlobal("fetch", fetchMock);

		const tool = getBuiltInToolByName("web_search");
		expect(tool).not.toBeNull();
		const result = (await tool!.execute({
			query: "ai hub",
			limit: 3,
		})) as {
			query: string;
			results: Array<{ title: string; url: string; engines: string[] }>;
		};

		expect(result.query).toBe("ai hub");
		expect(result.results).toEqual([
			{
				title: "AI Hub",
				url: "https://example.com/ai-hub",
				snippet: "Workspace assistant platform",
				score: 2.5,
				engines: ["duckduckgo"],
			},
		]);
	});
});
