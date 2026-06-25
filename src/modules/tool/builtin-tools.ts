import { createHash, randomInt, randomUUID } from "node:crypto";
import { z } from "zod";

import {
	createCodeWorkspaceFromFiles,
	deleteCodeWorkspaceFile,
	listCodeWorkspaceFiles,
	readCodeWorkspaceFile,
	writeCodeWorkspaceFile,
} from "@/modules/code-workspace/storage";
import {
	getUserGitHubStatus,
	publishCodeWorkspaceToGitHub,
} from "@/modules/github/publishing";
import { executeCodeSandbox } from "@/modules/tool/code-sandbox";
import type { ToolRiskLevel } from "./builtin-tools-catalog";
import {
	actionPlanInputSchema,
	businessDocumentInputSchema,
	competitiveBattlecardInputSchema,
	createActionPlanArtifact,
	createBusinessDocumentArtifact,
	createCompetitiveBattlecardArtifact,
	createCustomerAccountPlanArtifact,
	createDecisionMatrixArtifact,
	createEmailPackArtifact,
	createMeetingBriefArtifact,
	createProjectStatusReportArtifact,
	createRaciMatrixArtifact,
	createRiskRegisterArtifact,
	createSpreadsheetArtifact,
	customerAccountPlanInputSchema,
	decisionMatrixInputSchema,
	emailPackInputSchema,
	meetingBriefInputSchema,
	projectStatusReportInputSchema,
	raciMatrixInputSchema,
	riskRegisterInputSchema,
	spreadsheetInputSchema,
} from "./business-artifact-tools";
import {
	createSlideDeckArtifact,
	slideDeckInputSchema,
} from "./slide-deck-tool";

export type { ToolRiskLevel } from "./builtin-tools-catalog";

export interface BuiltInToolExecutionContext {
	workspaceId: string;
	userId: string;
	conversationId?: string;
	messageId?: string;
	emitEvent?: (event: Record<string, unknown>) => void;
}

export interface BuiltInToolDefinition<Input = unknown, Output = unknown> {
	id: string;
	name: string;
	displayName: string;
	description: string;
	riskLevel: ToolRiskLevel;
	category: string;
	inputSchema: z.ZodType<Input>;
	execute(
		input: Input,
		context?: BuiltInToolExecutionContext,
	): Promise<Output> | Output;
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

function runtimeLimitedString(
	maxChars: number,
	label: string,
	options: { min?: number; trim?: boolean } = {},
) {
	let schema = options.trim ? z.string().trim() : z.string();
	if (options.min !== undefined) schema = schema.min(options.min);
	return schema.superRefine((value, ctx) => {
		if (value.length <= maxChars) return;
		ctx.addIssue({
			code: "custom",
			message: `${label} must be at most ${maxChars.toLocaleString()} characters.`,
		});
	});
}

const codeSandboxInputSchema = z.object({
	language: z.enum(["python", "node", "bash"]),
	code: runtimeLimitedString(100_000, "Code", { min: 1, trim: true }),
	stdin: runtimeLimitedString(100_000, "Standard input").optional(),
	files: z
		.array(
			z.object({
				path: z.string().trim().min(1).max(260),
				content: runtimeLimitedString(200_000, "Input file content"),
			}),
		)
		.max(25)
		.default([]),
	attachments: z
		.array(
			z.object({
				id: z.uuid(),
				path: z.string().trim().min(1).max(260).optional(),
				includeExtractedText: z.boolean().default(true),
			}),
		)
		.max(8)
		.default([]),
	timeoutMs: z.number().int().min(250).max(10_000).default(5_000),
});

const codeWorkspaceCreateInputSchema = z.object({
	title: z.string().trim().min(1).max(120).default("Code workspace"),
	rootFile: z.string().trim().min(1).max(260).optional(),
	files: z
		.array(
			z.object({
				path: z.string().trim().min(1).max(260),
				content: runtimeLimitedString(1_000_000, "File content").optional(),
			}),
		)
		.min(1)
		.max(500),
});

const codeWorkspaceProjectInputSchema = z.object({
	projectId: z.uuid(),
});

const codeWorkspaceReadFileInputSchema = z.object({
	projectId: z.uuid(),
	path: z.string().trim().min(1).max(260),
});

const codeWorkspaceWriteFileInputSchema = z.object({
	projectId: z.uuid(),
	path: z.string().trim().min(1).max(260),
	content: runtimeLimitedString(1_000_000, "File content"),
});

const codeWorkspaceReplaceTextInputSchema = z.object({
	projectId: z.uuid(),
	path: z.string().trim().min(1).max(260),
	oldText: runtimeLimitedString(200_000, "Text to replace", { min: 1 }),
	newText: runtimeLimitedString(200_000, "Replacement text"),
	replaceAll: z.boolean().default(false),
});

const githubPublishStatusInputSchema = z.object({});

const githubPublishCodeWorkspaceInputSchema = z.object({
	projectId: z.uuid(),
	repositoryId: z.uuid(),
	mode: z.enum(["pull_request", "direct_push"]),
	targetBranch: z.string().trim().min(1).max(255),
	sourceBranch: z.string().trim().min(1).max(255).optional(),
	targetDirectory: z.string().trim().max(260).optional(),
	commitMessage: z.string().trim().min(1).max(240),
	pullRequestTitle: z.string().trim().min(1).max(240).optional(),
	pullRequestBody: z.string().trim().max(4000).optional(),
	confirmDirectPush: z.boolean().default(false),
});

const randomNumberInputSchema = z.object({
	min: z.number().default(0),
	max: z.number().default(100),
	count: z.number().int().min(1).max(100).default(1),
	integer: z.boolean().default(true),
});

const uuidGeneratorInputSchema = z.object({
	count: z.number().int().min(1).max(50).default(1),
});

const dateMathInputSchema = z.object({
	operation: z.enum(["add", "subtract", "difference"]),
	date: z.string().trim().min(1).max(64),
	endDate: z.string().trim().min(1).max(64).optional(),
	amount: z.number().int().min(0).max(100_000).default(0),
	unit: z.enum(["days", "weeks", "months", "years"]).default("days"),
});

const jsonToolInputSchema = z.object({
	action: z.enum(["validate", "format", "minify", "inspect"]).default("format"),
	json: runtimeLimitedString(100_000, "JSON", { min: 1 }),
});

const textStatsInputSchema = z.object({
	text: runtimeLimitedString(100_000, "Text"),
	wordsPerMinute: z.number().int().min(80).max(500).default(200),
});

const base64ToolInputSchema = z.object({
	action: z.enum(["encode", "decode"]),
	value: runtimeLimitedString(100_000, "Value"),
});

const hashTextInputSchema = z.object({
	text: runtimeLimitedString(100_000, "Text"),
	algorithm: z.enum(["sha256", "sha1", "md5"]).default("sha256"),
});

const unitConverterInputSchema = z.object({
	value: z.number(),
	from: z.enum([
		"mm",
		"cm",
		"m",
		"km",
		"in",
		"ft",
		"yd",
		"mi",
		"mg",
		"g",
		"kg",
		"oz",
		"lb",
		"b",
		"kb",
		"mb",
		"gb",
		"tb",
		"c",
		"f",
		"k",
	]),
	to: z.enum([
		"mm",
		"cm",
		"m",
		"km",
		"in",
		"ft",
		"yd",
		"mi",
		"mg",
		"g",
		"kg",
		"oz",
		"lb",
		"b",
		"kb",
		"mb",
		"gb",
		"tb",
		"c",
		"f",
		"k",
	]),
});

const slugifyTextInputSchema = z.object({
	text: z.string().min(1).max(1_000),
	separator: z.enum(["-", "_"]).default("-"),
});

const colorConverterInputSchema = z.object({
	hex: z
		.string()
		.trim()
		.regex(/^#?[0-9a-fA-F]{6}$/, "Use a 6-digit hex color"),
});

const markdownTableInputSchema = z.object({
	columns: z.array(z.string().min(1).max(80)).min(1).max(12),
	rows: z.array(z.array(z.string().max(500)).max(12)).max(100),
});

type SearxngResult = {
	title?: unknown;
	url?: unknown;
	content?: unknown;
	engine?: unknown;
	engines?: unknown;
	score?: unknown;
};

type NormalizedSearxngResult = {
	title: string;
	url: string;
	snippet: string;
	score: number | null;
	engines: string[];
};

type UnitKind = "length" | "weight" | "data" | "temperature";

const unitFactors: Record<string, { kind: UnitKind; factor: number }> = {
	mm: { kind: "length", factor: 0.001 },
	cm: { kind: "length", factor: 0.01 },
	m: { kind: "length", factor: 1 },
	km: { kind: "length", factor: 1_000 },
	in: { kind: "length", factor: 0.0254 },
	ft: { kind: "length", factor: 0.3048 },
	yd: { kind: "length", factor: 0.9144 },
	mi: { kind: "length", factor: 1_609.344 },
	mg: { kind: "weight", factor: 0.001 },
	g: { kind: "weight", factor: 1 },
	kg: { kind: "weight", factor: 1_000 },
	oz: { kind: "weight", factor: 28.349523125 },
	lb: { kind: "weight", factor: 453.59237 },
	b: { kind: "data", factor: 1 },
	kb: { kind: "data", factor: 1_024 },
	mb: { kind: "data", factor: 1_048_576 },
	gb: { kind: "data", factor: 1_073_741_824 },
	tb: { kind: "data", factor: 1_099_511_627_776 },
	c: { kind: "temperature", factor: 1 },
	f: { kind: "temperature", factor: 1 },
	k: { kind: "temperature", factor: 1 },
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

function todaySearchSuffix() {
	return `today ${new Date().toISOString().slice(0, 10)}`;
}

function searxngRequestHeaders() {
	return {
		Accept: "application/json",
		"X-Forwarded-For": "127.0.0.1",
		"X-Real-IP": "127.0.0.1",
		"User-Agent": "ai-hub-web-search/1.0",
	};
}

async function fetchSearxngResults(url: URL) {
	const response = await fetch(url, {
		headers: searxngRequestHeaders(),
		signal: AbortSignal.timeout(15_000),
	});
	if (!response.ok) {
		throw new Error(
			`SearXNG search failed with ${response.status} ${response.statusText}`,
		);
	}

	const payload = (await response.json()) as { results?: SearxngResult[] };
	return Array.isArray(payload.results) ? payload.results : [];
}

function normalizeSearxngResults(
	results: SearxngResult[],
	limit: number,
): NormalizedSearxngResult[] {
	return results
		.filter(
			(result) =>
				typeof result.title === "string" && typeof result.url === "string",
		)
		.slice(0, limit)
		.map((result) => ({
			title: result.title as string,
			url: result.url as string,
			snippet:
				typeof result.content === "string" ? result.content.slice(0, 800) : "",
			score: typeof result.score === "number" ? result.score : null,
			engines: normalizeSearxngEngines(result),
		}));
}

function summarizeSearchResults(results: NormalizedSearxngResult[]) {
	if (results.length === 0) {
		return "No web search results were returned.";
	}

	return results
		.map((result, index) => {
			const snippet = result.snippet ? ` — ${result.snippet}` : "";
			return `${index + 1}. ${result.title}${snippet}\n${result.url}`;
		})
		.join("\n\n");
}

async function searchWebWithSearxng(
	input: z.infer<typeof webSearchInputSchema>,
) {
	const { env } = await import("@/lib/env");
	const limit = input.limit ?? 5;
	const searchedQuery = `${input.query} ${todaySearchSuffix()}`.trim();
	const attemptedQueries = [searchedQuery, input.query];
	let lastError: string | null = null;
	let results: NormalizedSearxngResult[] = [];
	let successfulQuery = searchedQuery;

	for (const query of attemptedQueries) {
		const url = new URL("/search", env.SEARXNG_URL);
		url.searchParams.set("q", query);
		url.searchParams.set("format", "json");
		url.searchParams.set("safesearch", "1");
		if (input.language) url.searchParams.set("language", input.language);

		try {
			const rawResults = await fetchSearxngResults(url);
			results = normalizeSearxngResults(rawResults, limit);
			successfulQuery = query;
			if (results.length > 0) break;
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}
	}

	return {
		ok: results.length > 0,
		query: input.query,
		fetchedAt: new Date().toISOString(),
		searchedQuery,
		successfulQuery,
		resultCount: results.length,
		error: results.length === 0 ? lastError : null,
		summary: summarizeSearchResults(results),
		results,
	};
}

function randomNumbers({
	min,
	max,
	count,
	integer,
}: z.infer<typeof randomNumberInputSchema>) {
	if (max <= min) throw new Error("max must be greater than min");
	const values = Array.from({ length: count }, () => {
		if (!integer) return min + Math.random() * (max - min);
		const safeMin = Math.ceil(min);
		const safeMax = Math.floor(max);
		if (safeMax < safeMin) throw new Error("No integer exists in this range");
		return randomInt(safeMin, safeMax + 1);
	});
	return { values, value: values[0] };
}

function parseDate(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
	return date;
}

function mutateDate(date: Date, amount: number, unit: string) {
	const next = new Date(date);
	if (unit === "days") next.setUTCDate(next.getUTCDate() + amount);
	if (unit === "weeks") next.setUTCDate(next.getUTCDate() + amount * 7);
	if (unit === "months") next.setUTCMonth(next.getUTCMonth() + amount);
	if (unit === "years") next.setUTCFullYear(next.getUTCFullYear() + amount);
	return next;
}

function dateMath(input: z.infer<typeof dateMathInputSchema>) {
	const date = parseDate(input.date);
	if (input.operation === "difference") {
		if (!input.endDate) throw new Error("endDate is required for difference");
		const endDate = parseDate(input.endDate);
		const milliseconds = endDate.getTime() - date.getTime();
		return {
			startDate: date.toISOString(),
			endDate: endDate.toISOString(),
			milliseconds,
			days: milliseconds / 86_400_000,
		};
	}
	const amount = input.operation === "subtract" ? -input.amount : input.amount;
	const result = mutateDate(date, amount, input.unit);
	return { inputDate: date.toISOString(), result: result.toISOString() };
}

function jsonTool({ action, json }: z.infer<typeof jsonToolInputSchema>) {
	try {
		const parsed = JSON.parse(json) as unknown;
		if (action === "validate") return { valid: true };
		if (action === "minify") return { result: JSON.stringify(parsed) };
		if (action === "inspect") {
			return {
				valid: true,
				type: Array.isArray(parsed) ? "array" : typeof parsed,
				keys:
					parsed && typeof parsed === "object" && !Array.isArray(parsed)
						? Object.keys(parsed as Record<string, unknown>)
						: [],
				items: Array.isArray(parsed) ? parsed.length : undefined,
			};
		}
		return { result: JSON.stringify(parsed, null, 2) };
	} catch (error) {
		return {
			valid: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function textStats({
	text,
	wordsPerMinute,
}: z.infer<typeof textStatsInputSchema>) {
	const words = text.trim() ? text.trim().split(/\s+/).length : 0;
	return {
		characters: text.length,
		charactersNoSpaces: text.replace(/\s/g, "").length,
		words,
		lines: text.length ? text.split(/\r?\n/).length : 0,
		paragraphs: text.trim() ? text.trim().split(/\n\s*\n/).length : 0,
		readingTimeMinutes: Math.max(1, Math.ceil(words / wordsPerMinute)),
	};
}

function base64Tool({ action, value }: z.infer<typeof base64ToolInputSchema>) {
	if (action === "encode") {
		return { result: Buffer.from(value, "utf8").toString("base64") };
	}
	return { result: Buffer.from(value, "base64").toString("utf8") };
}

function convertTemperature(value: number, from: string, to: string) {
	const celsius =
		from === "c"
			? value
			: from === "f"
				? (value - 32) * (5 / 9)
				: value - 273.15;
	if (to === "c") return celsius;
	if (to === "f") return celsius * (9 / 5) + 32;
	return celsius + 273.15;
}

function unitConverter({
	value,
	from,
	to,
}: z.infer<typeof unitConverterInputSchema>) {
	const fromUnit = unitFactors[from];
	const toUnit = unitFactors[to];
	if (fromUnit.kind !== toUnit.kind) {
		throw new Error(`Cannot convert ${from} to ${to}`);
	}
	const result =
		fromUnit.kind === "temperature"
			? convertTemperature(value, from, to)
			: (value * fromUnit.factor) / toUnit.factor;
	return { value, from, to, result };
}

function trimSlugSeparator(value: string, separator: "-" | "_") {
	let start = 0;
	let end = value.length;
	while (value[start] === separator) start += 1;
	while (end > start && value[end - 1] === separator) end -= 1;
	return value.slice(start, end);
}

function slugifyText({
	text,
	separator,
}: z.infer<typeof slugifyTextInputSchema>) {
	const slug = text
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, separator);
	return { slug: trimSlugSeparator(slug, separator) };
}

function colorConverter({ hex }: z.infer<typeof colorConverterInputSchema>) {
	const normalized = hex.replace("#", "").toLowerCase();
	const r = Number.parseInt(normalized.slice(0, 2), 16);
	const g = Number.parseInt(normalized.slice(2, 4), 16);
	const b = Number.parseInt(normalized.slice(4, 6), 16);
	const r1 = r / 255;
	const g1 = g / 255;
	const b1 = b / 255;
	const max = Math.max(r1, g1, b1);
	const min = Math.min(r1, g1, b1);
	const lightness = (max + min) / 2;
	const delta = max - min;
	let hue = 0;
	let saturation = 0;
	if (delta !== 0) {
		saturation = delta / (1 - Math.abs(2 * lightness - 1));
		if (max === r1) hue = 60 * (((g1 - b1) / delta) % 6);
		if (max === g1) hue = 60 * ((b1 - r1) / delta + 2);
		if (max === b1) hue = 60 * ((r1 - g1) / delta + 4);
	}
	return {
		hex: `#${normalized}`,
		rgb: { r, g, b },
		hsl: {
			h: Math.round((hue + 360) % 360),
			s: Math.round(saturation * 100),
			l: Math.round(lightness * 100),
		},
	};
}

function markdownTable({
	columns,
	rows,
}: z.infer<typeof markdownTableInputSchema>) {
	const escapeCell = (value: string) =>
		value.replace(/\|/g, "\\|").replace(/\n/g, " ");
	const normalizedRows = rows.map((row) =>
		columns.map((_, index) => escapeCell(row[index] ?? "")),
	);
	const header = `| ${columns.map(escapeCell).join(" | ")} |`;
	const separator = `| ${columns.map(() => "---").join(" | ")} |`;
	const body = normalizedRows.map((row) => `| ${row.join(" | ")} |`);
	return { markdown: [header, separator, ...body].join("\n") };
}

function requireCodeWorkspaceContext(
	context: BuiltInToolExecutionContext | undefined,
) {
	if (!context?.workspaceId) {
		throw new Error("Code workspace tools require chat workspace context.");
	}
	return context;
}

async function replaceCodeWorkspaceText(
	input: z.infer<typeof codeWorkspaceReplaceTextInputSchema>,
	context: BuiltInToolExecutionContext,
) {
	const existing = await readCodeWorkspaceFile({
		projectId: input.projectId,
		workspaceId: context.workspaceId,
		userId: context.userId,
		filePath: input.path,
	});
	const occurrences = existing.content.split(input.oldText).length - 1;
	if (occurrences === 0) {
		throw new Error("oldText was not found in the target file.");
	}
	if (!input.replaceAll && occurrences > 1) {
		throw new Error(
			"oldText appears multiple times. Set replaceAll to true or provide a more specific oldText.",
		);
	}
	const nextContent = input.replaceAll
		? existing.content.split(input.oldText).join(input.newText)
		: existing.content.replace(input.oldText, input.newText);
	return writeCodeWorkspaceFile({
		projectId: input.projectId,
		workspaceId: context.workspaceId,
		userId: context.userId,
		filePath: input.path,
		content: nextContent,
	});
}

const MEDIUM_RISK_LEVEL = "medium";
const TITLE_FIELD = "title";

export const builtInTools = [
	{
		id: "00000000-0000-4000-8000-000000000001",
		name: "calculator",
		displayName: "Calculator",
		description: "Evaluate arithmetic expressions safely.",
		riskLevel: "low",
		category: "Think",
		inputSchema: calculatorInputSchema,
		execute: ({ expression }) => ({
			result: calculateExpression(expression),
		}),
	},
	{
		id: "00000000-0000-4000-8000-000000000002",
		name: "current_time",
		displayName: "Current time",
		description: "Return the current date and time for any timezone.",
		riskLevel: "low",
		category: "Time",
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
		description: "Fetch a remote URL after approval.",
		riskLevel: "high",
		category: "Web",
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
		description:
			"Search the web with today's date automatically included. When ok is true, use the returned summary and results to answer current-events and web questions.",
		riskLevel: MEDIUM_RISK_LEVEL,
		category: "Web",
		inputSchema: webSearchInputSchema,
		execute: searchWebWithSearxng,
	},
	{
		id: "00000000-0000-4000-8000-000000000005",
		name: "render_html_artifact",
		displayName: "HTML artifact",
		description:
			"Render interactive HTML/CSS/JS previews in chat for UI mockups, diagrams, cards, and demos.",
		riskLevel: MEDIUM_RISK_LEVEL,
		category: "Create",
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
	{
		id: "00000000-0000-4000-8000-000000000037",
		name: "run_code_sandbox",
		displayName: "Code sandbox",
		description:
			"Run Python, Node.js, or Bash in a wiped, no-network sandbox with classic data/science/document libraries and safe uploaded-document access.",
		riskLevel: "high",
		category: "Code",
		inputSchema: codeSandboxInputSchema,
		execute: executeCodeSandbox,
	},
	{
		id: "00000000-0000-4000-8000-000000000034",
		name: "code_workspace_create_project",
		displayName: "Create code workspace",
		description:
			"Start a live static HTML/CSS/JS code workspace from files generated by the model, with preview and ZIP download in chat.",
		riskLevel: MEDIUM_RISK_LEVEL,
		category: "Code",
		inputSchema: codeWorkspaceCreateInputSchema,
		execute: async ({ title, rootFile, files }, context) => {
			const workspaceContext = requireCodeWorkspaceContext(context);
			return createCodeWorkspaceFromFiles({
				workspaceId: workspaceContext.workspaceId,
				userId: workspaceContext.userId,
				title,
				rootFile,
				files,
			});
		},
	},
	{
		id: "00000000-0000-4000-8000-000000000029",
		name: "code_workspace_list_files",
		displayName: "Code workspace files",
		description:
			"List files and return the live chat artifact for a static HTML/CSS/JS code workspace.",
		riskLevel: "low",
		category: "Code",
		inputSchema: codeWorkspaceProjectInputSchema,
		execute: async ({ projectId }, context) => {
			const workspaceContext = requireCodeWorkspaceContext(context);
			return listCodeWorkspaceFiles({
				projectId,
				workspaceId: workspaceContext.workspaceId,
				userId: workspaceContext.userId,
			});
		},
	},
	{
		id: "00000000-0000-4000-8000-000000000030",
		name: "code_workspace_read_file",
		displayName: "Read code file",
		description:
			"Read a text file from an uploaded code workspace before editing it.",
		riskLevel: "low",
		category: "Code",
		inputSchema: codeWorkspaceReadFileInputSchema,
		execute: async ({ projectId, path }, context) => {
			const workspaceContext = requireCodeWorkspaceContext(context);
			return readCodeWorkspaceFile({
				projectId,
				workspaceId: workspaceContext.workspaceId,
				userId: workspaceContext.userId,
				filePath: path,
			});
		},
	},
	{
		id: "00000000-0000-4000-8000-000000000031",
		name: "code_workspace_write_file",
		displayName: "Write code file",
		description:
			"Create or replace a text file in an uploaded code workspace, then return the updated live preview artifact.",
		riskLevel: MEDIUM_RISK_LEVEL,
		category: "Code",
		inputSchema: codeWorkspaceWriteFileInputSchema,
		execute: async ({ projectId, path, content }, context) => {
			const workspaceContext = requireCodeWorkspaceContext(context);
			return writeCodeWorkspaceFile({
				projectId,
				workspaceId: workspaceContext.workspaceId,
				userId: workspaceContext.userId,
				filePath: path,
				content,
			});
		},
	},
	{
		id: "00000000-0000-4000-8000-000000000032",
		name: "code_workspace_replace_text",
		displayName: "Patch code file",
		description:
			"Patch a code workspace text file by replacing exact text; prefer this over rewriting large files.",
		riskLevel: MEDIUM_RISK_LEVEL,
		category: "Code",
		inputSchema: codeWorkspaceReplaceTextInputSchema,
		execute: async (
			toolInput: z.infer<typeof codeWorkspaceReplaceTextInputSchema>,
			context,
		) =>
			replaceCodeWorkspaceText(toolInput, requireCodeWorkspaceContext(context)),
	},
	{
		id: "00000000-0000-4000-8000-000000000033",
		name: "code_workspace_delete_file",
		displayName: "Delete code file",
		description:
			"Delete a file from an uploaded code workspace, then return the updated live preview artifact.",
		riskLevel: MEDIUM_RISK_LEVEL,
		category: "Code",
		inputSchema: codeWorkspaceReadFileInputSchema,
		execute: async ({ projectId, path }, context) => {
			const workspaceContext = requireCodeWorkspaceContext(context);
			return deleteCodeWorkspaceFile({
				projectId,
				workspaceId: workspaceContext.workspaceId,
				userId: workspaceContext.userId,
				filePath: path,
			});
		},
	},
	{
		id: "00000000-0000-4000-8000-000000000035",
		name: "github_get_publish_status",
		displayName: "GitHub status",
		description:
			"Check whether the current user connected GitHub and list repositories they can publish to. If not connected, return the chat-safe connect URL.",
		riskLevel: "low",
		category: "Code",
		inputSchema: githubPublishStatusInputSchema,
		execute: async (_input, context) => {
			const workspaceContext = requireCodeWorkspaceContext(context);
			return getUserGitHubStatus({
				userId: workspaceContext.userId,
				workspaceId: workspaceContext.workspaceId,
			});
		},
	},
	{
		id: "00000000-0000-4000-8000-000000000036",
		name: "github_publish_code_workspace",
		displayName: "Publish code to GitHub",
		description:
			"Publish a code workspace to one of the current user's GitHub repositories. The user must choose PR vs direct push, repository, and branch; direct push requires explicit confirmation.",
		riskLevel: "critical",
		category: "Code",
		inputSchema: githubPublishCodeWorkspaceInputSchema,
		execute: async (
			toolInput: z.infer<typeof githubPublishCodeWorkspaceInputSchema>,
			context,
		) => {
			const workspaceContext = requireCodeWorkspaceContext(context);
			return publishCodeWorkspaceToGitHub({
				projectId: toolInput.projectId,
				repositoryId: toolInput.repositoryId,
				mode: toolInput.mode,
				targetBranch: toolInput.targetBranch,
				sourceBranch: toolInput.sourceBranch,
				targetDirectory: toolInput.targetDirectory,
				commitMessage: toolInput.commitMessage,
				pullRequestTitle: toolInput.pullRequestTitle,
				pullRequestBody: toolInput.pullRequestBody,
				confirmDirectPush: toolInput.confirmDirectPush,
				workspaceId: workspaceContext.workspaceId,
				userId: workspaceContext.userId,
				conversationId: workspaceContext.conversationId,
			});
		},
	},
	{
		id: "00000000-0000-4000-8000-000000000017",
		name: "create_slide_deck",
		displayName: "Slide deck",
		description:
			"Create or revise an interactive slide deck with click-to-reveal steps and PDF print/export styling.",
		riskLevel: MEDIUM_RISK_LEVEL,
		category: "Create",
		inputSchema: slideDeckInputSchema,
		execute: createSlideDeckArtifact,
	},
	{
		id: "00000000-0000-4000-8000-000000000018",
		name: "create_business_document",
		displayName: "Business document",
		description:
			"Create printable briefs, reports, proposals, policies, SOPs, and memos.",
		riskLevel: MEDIUM_RISK_LEVEL,
		category: "Work",
		inputSchema: businessDocumentInputSchema,
		execute: createBusinessDocumentArtifact,
	},
	{
		id: "00000000-0000-4000-8000-000000000019",
		name: "create_spreadsheet",
		displayName: "Spreadsheet",
		description:
			"Create a clean printable table with insights and CSV export text.",
		riskLevel: MEDIUM_RISK_LEVEL,
		category: "Data",
		inputSchema: spreadsheetInputSchema,
		execute: createSpreadsheetArtifact,
	},
	{
		id: "00000000-0000-4000-8000-000000000020",
		name: "create_meeting_brief",
		displayName: "Meeting brief",
		description:
			"Turn meeting context into an agenda, decisions, and action-item brief.",
		riskLevel: MEDIUM_RISK_LEVEL,
		category: "Work",
		inputSchema: meetingBriefInputSchema,
		execute: createMeetingBriefArtifact,
	},
	{
		id: "00000000-0000-4000-8000-000000000021",
		name: "create_action_plan",
		displayName: "Action plan",
		description:
			"Create a phased project plan with owners, deadlines, and risks.",
		riskLevel: MEDIUM_RISK_LEVEL,
		category: "Work",
		inputSchema: actionPlanInputSchema,
		execute: createActionPlanArtifact,
	},
	{
		id: "00000000-0000-4000-8000-000000000022",
		name: "create_decision_matrix",
		displayName: "Decision matrix",
		description:
			"Compare options with weighted criteria and a clear recommendation.",
		riskLevel: MEDIUM_RISK_LEVEL,
		category: "Work",
		inputSchema: decisionMatrixInputSchema,
		execute: createDecisionMatrixArtifact,
	},
	{
		id: "00000000-0000-4000-8000-000000000023",
		name: "create_email_pack",
		displayName: "Email pack",
		description:
			"Draft polished business emails, follow-ups, announcements, and outreach variants.",
		riskLevel: MEDIUM_RISK_LEVEL,
		category: "Write",
		inputSchema: emailPackInputSchema,
		execute: createEmailPackArtifact,
	},
	{
		id: "00000000-0000-4000-8000-000000000024",
		name: "create_project_status_report",
		displayName: "Project status report",
		description:
			"Create executive-ready project updates with status, metrics, blockers, decisions, and next actions.",
		riskLevel: MEDIUM_RISK_LEVEL,
		category: "Work",
		inputSchema: projectStatusReportInputSchema,
		execute: createProjectStatusReportArtifact,
	},
	{
		id: "00000000-0000-4000-8000-000000000025",
		name: "create_risk_register",
		displayName: "Risk register",
		description:
			"Create a structured risk register with likelihood, impact, owners, mitigations, and contingency plans.",
		riskLevel: MEDIUM_RISK_LEVEL,
		category: "Work",
		inputSchema: riskRegisterInputSchema,
		execute: createRiskRegisterArtifact,
	},
	{
		id: "00000000-0000-4000-8000-000000000026",
		name: "create_raci_matrix",
		displayName: "RACI matrix",
		description:
			"Create a responsibility matrix that clarifies who is responsible, accountable, consulted, and informed.",
		riskLevel: MEDIUM_RISK_LEVEL,
		category: "Work",
		inputSchema: raciMatrixInputSchema,
		execute: createRaciMatrixArtifact,
	},
	{
		id: "00000000-0000-4000-8000-000000000027",
		name: "create_customer_account_plan",
		displayName: "Customer account plan",
		description:
			"Create a strategic account plan with stakeholders, opportunities, risks, and a mutual action plan.",
		riskLevel: MEDIUM_RISK_LEVEL,
		category: "Work",
		inputSchema: customerAccountPlanInputSchema,
		execute: createCustomerAccountPlanArtifact,
	},
	{
		id: "00000000-0000-4000-8000-000000000028",
		name: "create_competitive_battlecard",
		displayName: "Competitive battlecard",
		description:
			"Create a sales battlecard with positioning, win themes, landmines, objection handling, and discovery questions.",
		riskLevel: MEDIUM_RISK_LEVEL,
		category: "Work",
		inputSchema: competitiveBattlecardInputSchema,
		execute: createCompetitiveBattlecardArtifact,
	},
	{
		id: "00000000-0000-4000-8000-000000000006",
		name: "random_number",
		displayName: "Random number",
		description: "Generate one or more random numbers in a range.",
		riskLevel: "low",
		category: "Think",
		inputSchema: randomNumberInputSchema,
		execute: randomNumbers,
	},
	{
		id: "00000000-0000-4000-8000-000000000007",
		name: "uuid_generator",
		displayName: "UUID generator",
		description: "Generate UUIDs for IDs, examples, and test data.",
		riskLevel: "low",
		category: "Create",
		inputSchema: uuidGeneratorInputSchema,
		execute: ({ count }) => {
			const values = Array.from({ length: count }, () => randomUUID());
			return { values, value: values[0] };
		},
	},
	{
		id: "00000000-0000-4000-8000-000000000008",
		name: "date_math",
		displayName: "Date math",
		description: "Add, subtract, or compare dates.",
		riskLevel: "low",
		category: "Time",
		inputSchema: dateMathInputSchema,
		execute: dateMath,
	},
	{
		id: "00000000-0000-4000-8000-000000000009",
		name: "json_tool",
		displayName: "JSON helper",
		description: "Validate, format, minify, or inspect JSON.",
		riskLevel: "low",
		category: "Code",
		inputSchema: jsonToolInputSchema,
		execute: jsonTool,
	},
	{
		id: "00000000-0000-4000-8000-000000000010",
		name: "text_stats",
		displayName: "Text stats",
		description: "Count words, characters, lines, and reading time.",
		riskLevel: "low",
		category: "Write",
		inputSchema: textStatsInputSchema,
		execute: textStats,
	},
	{
		id: "00000000-0000-4000-8000-000000000011",
		name: "base64_tool",
		displayName: "Base64",
		description: "Encode or decode Base64 text.",
		riskLevel: "low",
		category: "Code",
		inputSchema: base64ToolInputSchema,
		execute: base64Tool,
	},
	{
		id: "00000000-0000-4000-8000-000000000012",
		name: "hash_text",
		displayName: "Hash text",
		description: "Create SHA-256, SHA-1, or MD5 hashes.",
		riskLevel: "low",
		category: "Code",
		inputSchema: hashTextInputSchema,
		execute: ({ text, algorithm }) => ({
			algorithm,
			hash: createHash(algorithm).update(text).digest("hex"),
		}),
	},
	{
		id: "00000000-0000-4000-8000-000000000013",
		name: "unit_converter",
		displayName: "Unit converter",
		description: "Convert length, weight, data, and temperature units.",
		riskLevel: "low",
		category: "Think",
		inputSchema: unitConverterInputSchema,
		execute: unitConverter,
	},
	{
		id: "00000000-0000-4000-8000-000000000014",
		name: "slugify_text",
		displayName: "Slugify text",
		description: "Turn text into clean URL/file slugs.",
		riskLevel: "low",
		category: "Write",
		inputSchema: slugifyTextInputSchema,
		execute: slugifyText,
	},
	{
		id: "00000000-0000-4000-8000-000000000015",
		name: "color_converter",
		displayName: "Color converter",
		description: "Convert hex colors to RGB and HSL.",
		riskLevel: "low",
		category: "Design",
		inputSchema: colorConverterInputSchema,
		execute: colorConverter,
	},
	{
		id: "00000000-0000-4000-8000-000000000016",
		name: "markdown_table",
		displayName: "Markdown table",
		description: "Create a clean Markdown table from columns and rows.",
		riskLevel: "low",
		category: "Write",
		inputSchema: markdownTableInputSchema,
		execute: markdownTable,
	},
] satisfies BuiltInToolDefinition[];

export function listBuiltInTools() {
	return builtInTools.map((tool) => ({
		id: tool.id,
		name: tool.name,
		displayName: tool.displayName,
		description: tool.description,
		riskLevel: tool.riskLevel,
		category: tool.category,
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

const commonSchemas: Record<string, unknown> = {
	calculator: {
		type: "object",
		properties: {
			expression: { type: "string", description: "Arithmetic expression" },
		},
		required: ["expression"],
	},
	current_time: {
		type: "object",
		properties: { timezone: { type: "string", default: "UTC" } },
		required: [],
	},
	http_fetch: {
		type: "object",
		properties: {
			url: { type: "string", format: "uri" },
			method: { type: "string", enum: ["GET", "HEAD"], default: "GET" },
		},
		required: ["url"],
	},
	web_search: {
		type: "object",
		properties: {
			query: {
				type: "string",
				description:
					"Search query. The tool automatically appends today's date to keep results current.",
			},
			limit: { type: "number", default: 5, minimum: 1, maximum: 10 },
			language: {
				type: "string",
				description: "Optional language code, for example en or fr.",
			},
		},
		required: ["query"],
	},
	render_html_artifact: {
		type: "object",
		properties: {
			title: { type: "string", default: "Interactive preview" },
			html: {
				type: "string",
				description: "HTML fragment for the isolated preview.",
			},
			css: { type: "string", default: "" },
			js: { type: "string", default: "" },
			height: { type: "number", default: 420, minimum: 160, maximum: 900 },
		},
		required: ["html"],
	},
	run_code_sandbox: {
		type: "object",
		properties: {
			language: {
				type: "string",
				enum: ["python", "node", "bash"],
				description: "Runtime to use for this execution.",
			},
			code: {
				type: "string",
				description:
					"Python, Node.js, or Bash code to run. Print values you want in stdout.",
			},
			stdin: {
				type: "string",
				description: "Optional standard input passed to the program.",
			},
			files: {
				type: "array",
				maxItems: 25,
				description:
					"Optional text files to make available before execution. Each run is wiped after completion.",
				items: {
					type: "object",
					properties: {
						path: { type: "string", description: "Relative file path." },
						content: { type: "string", description: "Text file content." },
					},
					required: ["path", "content"],
				},
				default: [],
			},
			attachments: {
				type: "array",
				maxItems: 8,
				description:
					"Uploaded chat attachment IDs to copy into the sandbox as files. Use IDs shown in the conversation context when analyzing uploaded documents or images. Readable documents also get a .extracted.txt sidecar unless includeExtractedText is false.",
				items: {
					type: "object",
					properties: {
						id: { type: "string", format: "uuid" },
						path: {
							type: "string",
							description:
								"Optional relative path inside the sandbox, for example attachments/report.pdf.",
						},
						includeExtractedText: {
							type: "boolean",
							default: true,
							description:
								"Also add extracted text as <path>.extracted.txt when available.",
						},
					},
					required: ["id"],
				},
				default: [],
			},
			timeoutMs: {
				type: "number",
				default: 5000,
				minimum: 250,
				maximum: 10000,
				description: "Maximum execution time in milliseconds.",
			},
		},
		required: ["language", "code"],
	},
	code_workspace_create_project: {
		type: "object",
		properties: {
			title: { type: "string", default: "Code workspace" },
			rootFile: {
				type: "string",
				description: "HTML entry file, for example index.html.",
			},
			files: {
				type: "array",
				minItems: 1,
				maxItems: 500,
				items: {
					type: "object",
					properties: {
						path: {
							type: "string",
							description: "Workspace-relative file path.",
						},
						content: {
							type: "string",
							description:
								"Optional initial content. Prefer omitting this and filling files with code_workspace_write_file.",
						},
					},
					required: ["path"],
				},
			},
		},
		required: ["files"],
	},
	code_workspace_list_files: {
		type: "object",
		properties: {
			projectId: { type: "string", format: "uuid" },
		},
		required: ["projectId"],
	},
	code_workspace_read_file: {
		type: "object",
		properties: {
			projectId: { type: "string", format: "uuid" },
			path: { type: "string", description: "Workspace-relative file path." },
		},
		required: ["projectId", "path"],
	},
	code_workspace_write_file: {
		type: "object",
		properties: {
			projectId: { type: "string", format: "uuid" },
			path: { type: "string", description: "Workspace-relative file path." },
			content: { type: "string", description: "Full text content to write." },
		},
		required: ["projectId", "path", "content"],
	},
	code_workspace_replace_text: {
		type: "object",
		properties: {
			projectId: { type: "string", format: "uuid" },
			path: { type: "string", description: "Workspace-relative file path." },
			oldText: { type: "string", description: "Exact text to replace." },
			newText: { type: "string", description: "Replacement text." },
			replaceAll: { type: "boolean", default: false },
		},
		required: ["projectId", "path", "oldText", "newText"],
	},
	code_workspace_delete_file: {
		type: "object",
		properties: {
			projectId: { type: "string", format: "uuid" },
			path: { type: "string", description: "Workspace-relative file path." },
		},
		required: ["projectId", "path"],
	},
	github_get_publish_status: {
		type: "object",
		properties: {},
		required: [],
	},
	github_publish_code_workspace: {
		type: "object",
		properties: {
			projectId: {
				type: "string",
				format: "uuid",
				description: "Code workspace id to publish.",
			},
			repositoryId: {
				type: "string",
				format: "uuid",
				description:
					"User-scoped GitHub repository id returned by github_get_publish_status.",
			},
			mode: {
				type: "string",
				enum: ["pull_request", "direct_push"],
				description:
					"Use pull_request unless the user explicitly asks for direct push.",
			},
			targetBranch: {
				type: "string",
				description:
					"Target branch chosen by the user, including main if requested.",
			},
			sourceBranch: {
				type: "string",
				description: "Optional new branch name for pull_request mode.",
			},
			targetDirectory: {
				type: "string",
				description: "Optional repository subdirectory to write files into.",
			},
			commitMessage: { type: "string" },
			pullRequestTitle: { type: "string" },
			pullRequestBody: { type: "string" },
			confirmDirectPush: {
				type: "boolean",
				description:
					"Must be true only after the user explicitly confirmed direct push.",
				default: false,
			},
		},
		required: [
			"projectId",
			"repositoryId",
			"mode",
			"targetBranch",
			"commitMessage",
		],
	},
	create_slide_deck: {
		type: "object",
		properties: {
			title: { type: "string", description: "Presentation title." },
			subtitle: { type: "string" },
			theme: {
				type: "string",
				enum: ["minimal", "deodis", "midnight", "warm"],
				default: "deodis",
			},
			accentColor: { type: "string", default: "#25adc5" },
			aspectRatio: { type: "string", enum: ["16:9", "4:3"], default: "16:9" },
			animation: {
				type: "string",
				enum: ["rise", "fade", "none"],
				default: "rise",
			},
			height: { type: "number", default: 560, minimum: 360, maximum: 900 },
			showPrintButton: { type: "boolean", default: true },
			slides: {
				type: "array",
				minItems: 1,
				maxItems: 30,
				items: {
					type: "object",
					properties: {
						layout: {
							type: "string",
							enum: [
								TITLE_FIELD,
								"section",
								"bullets",
								"two_column",
								"quote",
								"closing",
							],
							default: "bullets",
						},
						kicker: { type: "string" },
						title: { type: "string" },
						body: { type: "string" },
						bullets: { type: "array", items: { type: "string" }, default: [] },
						secondaryTitle: { type: "string" },
						secondaryBullets: {
							type: "array",
							items: { type: "string" },
							default: [],
						},
						quote: { type: "string" },
						attribution: { type: "string" },
						metricValue: { type: "string" },
						metricLabel: { type: "string" },
						imageUrl: { type: "string", format: "uri" },
						imageAlt: { type: "string" },
						footer: { type: "string" },
						notes: { type: "string" },
					},
					required: [TITLE_FIELD],
				},
			},
		},
		required: [TITLE_FIELD, "slides"],
	},
	create_business_document: {
		type: "object",
		properties: {
			title: { type: "string" },
			documentType: {
				type: "string",
				enum: ["brief", "memo", "report", "proposal", "policy", "sop"],
			},
			audience: { type: "string" },
			executiveSummary: { type: "string" },
			sections: { type: "array", items: { type: "object" } },
			nextSteps: { type: "array", items: { type: "string" } },
			height: { type: "number", default: 620 },
		},
		required: [TITLE_FIELD, "sections"],
	},
	create_spreadsheet: {
		type: "object",
		properties: {
			title: { type: "string" },
			summary: { type: "string" },
			columns: { type: "array", items: { type: "string" } },
			rows: {
				type: "array",
				items: { type: "array", items: { type: "string" } },
			},
			insights: { type: "array", items: { type: "string" } },
			height: { type: "number", default: 620 },
		},
		required: [TITLE_FIELD, "columns", "rows"],
	},
	create_meeting_brief: {
		type: "object",
		properties: {
			title: { type: "string" },
			date: { type: "string" },
			attendees: { type: "array", items: { type: "string" } },
			objective: { type: "string" },
			agenda: { type: "array", items: { type: "string" } },
			decisions: { type: "array", items: { type: "string" } },
			actionItems: { type: "array", items: { type: "object" } },
			height: { type: "number", default: 620 },
		},
		required: [TITLE_FIELD],
	},
	create_action_plan: {
		type: "object",
		properties: {
			title: { type: "string" },
			objective: { type: "string" },
			phases: { type: "array", items: { type: "object" } },
			actionItems: { type: "array", items: { type: "object" } },
			risks: { type: "array", items: { type: "string" } },
			height: { type: "number", default: 620 },
		},
		required: [TITLE_FIELD, "phases"],
	},
	create_decision_matrix: {
		type: "object",
		properties: {
			title: { type: "string" },
			context: { type: "string" },
			criteria: { type: "array", items: { type: "object" } },
			options: { type: "array", items: { type: "object" } },
			recommendation: { type: "string" },
			height: { type: "number", default: 620 },
		},
		required: [TITLE_FIELD, "criteria", "options"],
	},
	create_email_pack: {
		type: "object",
		properties: {
			title: { type: "string" },
			goal: { type: "string" },
			audience: { type: "string" },
			tone: {
				type: "string",
				enum: ["direct", "friendly", "executive", "sales", "support"],
			},
			emails: { type: "array", items: { type: "object" } },
			height: { type: "number", default: 620 },
		},
		required: [TITLE_FIELD, "emails"],
	},
	create_project_status_report: {
		type: "object",
		properties: {
			title: { type: "string" },
			reportingPeriod: { type: "string" },
			overallStatus: {
				type: "string",
				enum: ["green", "yellow", "red", "blocked"],
				default: "green",
			},
			executiveSummary: { type: "string" },
			metrics: { type: "array", items: { type: "object" } },
			milestones: { type: "array", items: { type: "object" } },
			blockers: { type: "array", items: { type: "string" } },
			decisionsNeeded: { type: "array", items: { type: "string" } },
			nextSteps: { type: "array", items: { type: "object" } },
			height: { type: "number", default: 620 },
		},
		required: [TITLE_FIELD],
	},
	create_risk_register: {
		type: "object",
		properties: {
			title: { type: "string" },
			context: { type: "string" },
			risks: { type: "array", items: { type: "object" } },
			height: { type: "number", default: 620 },
		},
		required: [TITLE_FIELD, "risks"],
	},
	create_raci_matrix: {
		type: "object",
		properties: {
			title: { type: "string" },
			context: { type: "string" },
			roles: { type: "array", items: { type: "string" } },
			activities: { type: "array", items: { type: "object" } },
			height: { type: "number", default: 620 },
		},
		required: [TITLE_FIELD, "roles", "activities"],
	},
	create_customer_account_plan: {
		type: "object",
		properties: {
			title: { type: "string" },
			accountName: { type: "string" },
			objective: { type: "string" },
			stakeholders: { type: "array", items: { type: "object" } },
			opportunities: { type: "array", items: { type: "object" } },
			risks: { type: "array", items: { type: "string" } },
			nextActions: { type: "array", items: { type: "object" } },
			height: { type: "number", default: 620 },
		},
		required: [TITLE_FIELD, "accountName"],
	},
	create_competitive_battlecard: {
		type: "object",
		properties: {
			title: { type: "string" },
			competitor: { type: "string" },
			positioning: { type: "string" },
			winThemes: { type: "array", items: { type: "string" } },
			strengths: { type: "array", items: { type: "string" } },
			weaknesses: { type: "array", items: { type: "string" } },
			landmines: { type: "array", items: { type: "string" } },
			objectionHandling: { type: "array", items: { type: "object" } },
			discoveryQuestions: { type: "array", items: { type: "string" } },
			height: { type: "number", default: 620 },
		},
		required: [TITLE_FIELD, "competitor"],
	},
	random_number: {
		type: "object",
		properties: {
			min: { type: "number", default: 0 },
			max: { type: "number", default: 100 },
			count: { type: "number", default: 1, minimum: 1, maximum: 100 },
			integer: { type: "boolean", default: true },
		},
		required: [],
	},
	uuid_generator: {
		type: "object",
		properties: {
			count: { type: "number", default: 1, minimum: 1, maximum: 50 },
		},
		required: [],
	},
	date_math: {
		type: "object",
		properties: {
			operation: { type: "string", enum: ["add", "subtract", "difference"] },
			date: { type: "string", description: "Start date, e.g. 2026-06-08" },
			endDate: { type: "string", description: "End date for difference" },
			amount: { type: "number", default: 0 },
			unit: {
				type: "string",
				enum: ["days", "weeks", "months", "years"],
				default: "days",
			},
		},
		required: ["operation", "date"],
	},
	json_tool: {
		type: "object",
		properties: {
			action: {
				type: "string",
				enum: ["validate", "format", "minify", "inspect"],
				default: "format",
			},
			json: { type: "string" },
		},
		required: ["json"],
	},
	text_stats: {
		type: "object",
		properties: {
			text: { type: "string" },
			wordsPerMinute: { type: "number", default: 200 },
		},
		required: ["text"],
	},
	base64_tool: {
		type: "object",
		properties: {
			action: { type: "string", enum: ["encode", "decode"] },
			value: { type: "string" },
		},
		required: ["action", "value"],
	},
	hash_text: {
		type: "object",
		properties: {
			text: { type: "string" },
			algorithm: {
				type: "string",
				enum: ["sha256", "sha1", "md5"],
				default: "sha256",
			},
		},
		required: ["text"],
	},
	unit_converter: {
		type: "object",
		properties: {
			value: { type: "number" },
			from: { type: "string" },
			to: { type: "string" },
		},
		required: ["value", "from", "to"],
	},
	slugify_text: {
		type: "object",
		properties: {
			text: { type: "string" },
			separator: { type: "string", enum: ["-", "_"], default: "-" },
		},
		required: ["text"],
	},
	color_converter: {
		type: "object",
		properties: {
			hex: { type: "string", description: "6-digit hex color, e.g. #0ea5e9" },
		},
		required: ["hex"],
	},
	markdown_table: {
		type: "object",
		properties: {
			columns: { type: "array", items: { type: "string" } },
			rows: {
				type: "array",
				items: { type: "array", items: { type: "string" } },
			},
		},
		required: ["columns", "rows"],
	},
};

export function toolToJsonSchema(toolId: string) {
	const tool = getBuiltInTool(toolId);
	if (!tool) return null;
	return (
		commonSchemas[tool.name] ?? { type: "object", properties: {}, required: [] }
	);
}
