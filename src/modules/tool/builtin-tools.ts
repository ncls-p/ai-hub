import { z } from "zod";

import type { ToolRiskLevel } from "./builtin-tools-catalog";

export type { ToolRiskLevel } from "./builtin-tools-catalog";

export interface BuiltInToolDefinition<Input = unknown, Output = unknown> {
	id: string;
	name: string;
	displayName: string;
	description: string;
	riskLevel: ToolRiskLevel;
	inputSchema: z.ZodType<Input>;
	execute(input: Input): Promise<Output> | Output;
}

const calculatorInputSchema = z.object({
	expression: z
		.string()
		.min(1)
		.max(256)
		.regex(/^[0-9+\-*/(). %]+$/, "Only arithmetic characters are allowed"),
});

const currentTimeInputSchema = z.object({
	timezone: z.string().min(1).max(64).default("UTC"),
});

const httpFetchInputSchema = z.object({
	url: z.url(),
	method: z.enum(["GET", "HEAD"]).default("GET"),
});

const webSearchInputSchema = z.object({
	query: z.string().trim().min(1).max(512),
	limit: z.number().int().min(1).max(10).default(5),
	language: z.string().trim().min(2).max(16).optional(),
});

const htmlArtifactInputSchema = z.object({
	title: z.string().trim().min(1).max(120).default("Interactive preview"),
	html: z.string().min(1).max(24_000),
	css: z.string().max(24_000).default(""),
	js: z.string().max(24_000).default(""),
	height: z.number().int().min(160).max(900).default(420),
});

type SearxngResult = {
	title?: unknown;
	url?: unknown;
	content?: unknown;
	engine?: unknown;
	engines?: unknown;
	score?: unknown;
};

function calculateExpression(expression: string) {
	// Restricted by calculatorInputSchema to arithmetic-only characters.
	const result = Function(`"use strict"; return (${expression});`)();
	if (typeof result !== "number" || !Number.isFinite(result)) {
		throw new Error("Expression did not evaluate to a finite number");
	}
	return result;
}

function normalizeSearxngEngines(result: SearxngResult) {
	if (Array.isArray(result.engines)) {
		return result.engines.filter((engine) => typeof engine === "string");
	}
	if (typeof result.engine === "string") {
		return [result.engine];
	}
	return [];
}

async function searchWebWithSearxng(
	input: z.infer<typeof webSearchInputSchema>,
) {
	const { env } = await import("@/lib/env");
	const limit = input.limit ?? 5;
	const url = new URL("/search", env.SEARXNG_URL);
	url.searchParams.set("q", input.query);
	url.searchParams.set("format", "json");
	url.searchParams.set("safesearch", "1");
	if (input.language) url.searchParams.set("language", input.language);

	const response = await fetch(url, {
		headers: { Accept: "application/json" },
		signal: AbortSignal.timeout(15_000),
	});
	if (!response.ok) {
		throw new Error(
			`SearXNG search failed with ${response.status} ${response.statusText}`,
		);
	}

	const payload = (await response.json()) as { results?: SearxngResult[] };
	const results = Array.isArray(payload.results) ? payload.results : [];

	return {
		query: input.query,
		results: results
			.filter(
				(result) =>
					typeof result.title === "string" && typeof result.url === "string",
			)
			.slice(0, limit)
			.map((result) => ({
				title: result.title as string,
				url: result.url as string,
				snippet:
					typeof result.content === "string"
						? result.content.slice(0, 800)
						: "",
				score: typeof result.score === "number" ? result.score : null,
				engines: normalizeSearxngEngines(result),
			})),
	};
}

export const builtInTools = [
	{
		id: "00000000-0000-4000-8000-000000000001",
		name: "calculator",
		displayName: "Calculator",
		description: "Safely evaluate arithmetic expressions.",
		riskLevel: "low",
		inputSchema: calculatorInputSchema,
		execute: ({ expression }) => ({
			result: calculateExpression(expression),
		}),
	},
	{
		id: "00000000-0000-4000-8000-000000000002",
		name: "current_time",
		displayName: "Current time",
		description: "Return the current date and time for a requested timezone.",
		riskLevel: "low",
		inputSchema: currentTimeInputSchema,
		execute: ({ timezone }) => ({
			timezone,
			iso: new Date().toISOString(),
			formatted: new Intl.DateTimeFormat("en-US", {
				dateStyle: "full",
				timeStyle: "long",
				timeZone: timezone,
			}).format(new Date()),
		}),
	},
	{
		id: "00000000-0000-4000-8000-000000000003",
		name: "http_fetch",
		displayName: "HTTP fetch",
		description: "Request a remote URL. Requires approval before execution.",
		riskLevel: "high",
		inputSchema: httpFetchInputSchema,
		execute: async ({ url, method }) => {
			const response = await fetch(url, {
				method,
				signal: AbortSignal.timeout(10_000),
			});
			const text = method === "HEAD" ? "" : await response.text();
			return {
				status: response.status,
				statusText: response.statusText,
				contentType: response.headers.get("content-type"),
				bodyPreview: text.slice(0, 4_000),
			};
		},
	},
	{
		id: "00000000-0000-4000-8000-000000000004",
		name: "web_search",
		displayName: "Web search",
		description: "Search the web through the workspace SearXNG instance.",
		riskLevel: "medium",
		inputSchema: webSearchInputSchema,
		execute: searchWebWithSearxng,
	},
	{
		id: "00000000-0000-4000-8000-000000000005",
		name: "render_html_artifact",
		displayName: "HTML artifact",
		description:
			"Render a self-contained HTML/CSS/JS artifact in the chat for UI mockups, diagrams, cards, and interactive demos. The user can inspect the source code.",
		riskLevel: "medium",
		inputSchema: htmlArtifactInputSchema,
		execute: ({ title, html, css, js, height }) => ({
			kind: "html_artifact" as const,
			title,
			html,
			css,
			js,
			height,
		}),
	},
] satisfies BuiltInToolDefinition[];

export function listBuiltInTools() {
	return builtInTools.map((tool) => ({
		id: tool.id,
		name: tool.name,
		displayName: tool.displayName,
		description: tool.description,
		riskLevel: tool.riskLevel,
		inputSchemaJson: toolToJsonSchema(tool.id),
		requiresApprovalByDefault: requiresApproval(tool.riskLevel),
	}));
}

export function getBuiltInTool(toolId: string) {
	return builtInTools.find((tool) => tool.id === toolId) ?? null;
}

export function getBuiltInToolByName(name: string) {
	return builtInTools.find((tool) => tool.name === name) ?? null;
}

export function requiresApproval(
	riskLevel: ToolRiskLevel | string | null | undefined,
) {
	return riskLevel === "high" || riskLevel === "critical";
}

export function toolToJsonSchema(toolId: string) {
	const tool = getBuiltInTool(toolId);
	if (!tool) return null;

	if (tool.name === "calculator") {
		return {
			type: "object",
			properties: {
				expression: {
					type: "string",
					description: "Arithmetic expression",
				},
			},
			required: ["expression"],
		};
	}
	if (tool.name === "current_time") {
		return {
			type: "object",
			properties: {
				timezone: { type: "string", default: "UTC" },
			},
			required: [],
		};
	}
	if (tool.name === "web_search") {
		return {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: "Search query to send to SearXNG.",
				},
				limit: {
					type: "number",
					default: 5,
					minimum: 1,
					maximum: 10,
				},
				language: {
					type: "string",
					description: "Optional SearXNG language code, for example en or fr.",
				},
			},
			required: ["query"],
		};
	}
	if (tool.name === "render_html_artifact") {
		return {
			type: "object",
			properties: {
				title: {
					type: "string",
					description: "Short title displayed above the preview.",
					default: "Interactive preview",
				},
				html: {
					type: "string",
					description:
						"HTML fragment to render inside the isolated preview. Do not include html/head/body tags unless necessary.",
				},
				css: {
					type: "string",
					description: "CSS for the preview.",
					default: "",
				},
				js: {
					type: "string",
					description:
						"Optional JavaScript for the preview. It runs only inside a sandboxed iframe.",
					default: "",
				},
				height: {
					type: "number",
					description: "Preview height in pixels.",
					default: 420,
					minimum: 160,
					maximum: 900,
				},
			},
			required: ["html"],
		};
	}
	return {
		type: "object",
		properties: {
			url: { type: "string", format: "uri" },
			method: { type: "string", enum: ["GET", "HEAD"], default: "GET" },
		},
		required: ["url"],
	};
}
