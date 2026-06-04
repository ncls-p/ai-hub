/** Client-safe builtin tool metadata (no env or server-only imports). */

export type ToolRiskLevel = "low" | "medium" | "high" | "critical";

export type BuiltInToolSummary = {
	id: string;
	name: string;
	displayName: string;
	description: string;
	riskLevel: ToolRiskLevel;
};

export const BUILTIN_TOOL_SUMMARIES: BuiltInToolSummary[] = [
	{
		id: "00000000-0000-4000-8000-000000000001",
		name: "calculator",
		displayName: "Calculator",
		description: "Safely evaluate arithmetic expressions.",
		riskLevel: "low",
	},
	{
		id: "00000000-0000-4000-8000-000000000002",
		name: "current_time",
		displayName: "Current time",
		description: "Return the current date and time for a requested timezone.",
		riskLevel: "low",
	},
	{
		id: "00000000-0000-4000-8000-000000000003",
		name: "http_fetch",
		displayName: "HTTP fetch",
		description: "Request a remote URL. Requires approval before execution.",
		riskLevel: "high",
	},
	{
		id: "00000000-0000-4000-8000-000000000004",
		name: "web_search",
		displayName: "Web search",
		description: "Search the web through the workspace SearXNG instance.",
		riskLevel: "medium",
	},
];

export function listBuiltInToolSummaries(): BuiltInToolSummary[] {
	return BUILTIN_TOOL_SUMMARIES;
}
