import { randomInt } from "node:crypto";
import { z } from "zod";

export const calculatorInputSchema = z.object({
	expression: z
		.string()
		.min(1)
		.max(256)
		.regex(/^[0-9+\-*/(). %]+$/, "Only arithmetic characters are allowed"),
});

export const currentTimeInputSchema = z.object({
	timezone: z.string().min(1).max(64).default("UTC"),
});

export const httpFetchInputSchema = z.object({
	url: z.url(),
	method: z.enum(["GET", "HEAD"]).default("GET"),
});

export const webSearchInputSchema = z.object({
	query: z.string().trim().min(1).max(512),
	limit: z.number().int().min(1).max(10).default(5),
	language: z.string().trim().min(2).max(16).optional(),
});

export const htmlArtifactInputSchema = z.object({
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

export const codeSandboxInputSchema = z.object({
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
	timeoutMs: z.number().int().min(250).max(120_000).default(15_000),
});

export const codeWorkspaceCreateInputSchema = z.object({
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

export const codeWorkspaceProjectInputSchema = z.object({
	projectId: z.uuid(),
});

export const codeWorkspaceReadFileInputSchema = z.object({
	projectId: z.uuid(),
	path: z.string().trim().min(1).max(260),
});

export const codeWorkspaceWriteFileInputSchema = z.object({
	projectId: z.uuid(),
	path: z.string().trim().min(1).max(260),
	content: runtimeLimitedString(1_000_000, "File content"),
});

export const codeWorkspaceReplaceTextInputSchema = z.object({
	projectId: z.uuid(),
	path: z.string().trim().min(1).max(260),
	oldText: runtimeLimitedString(200_000, "Text to replace", { min: 1 }),
	newText: runtimeLimitedString(200_000, "Replacement text"),
	replaceAll: z.boolean().default(false),
});

export const githubPublishStatusInputSchema = z.object({});

export const githubPublishCodeWorkspaceInputSchema = z.object({
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

export const randomNumberInputSchema = z.object({
	min: z.number().default(0),
	max: z.number().default(100),
	count: z.number().int().min(1).max(100).default(1),
	integer: z.boolean().default(true),
});

export const uuidGeneratorInputSchema = z.object({
	count: z.number().int().min(1).max(50).default(1),
});

export const dateMathInputSchema = z.object({
	operation: z.enum(["add", "subtract", "difference"]),
	date: z.string().trim().min(1).max(64),
	endDate: z.string().trim().min(1).max(64).optional(),
	amount: z.number().int().min(0).max(100_000).default(0),
	unit: z.enum(["days", "weeks", "months", "years"]).default("days"),
});

export const jsonToolInputSchema = z.object({
	action: z.enum(["validate", "format", "minify", "inspect"]).default("format"),
	json: runtimeLimitedString(100_000, "JSON", { min: 1 }),
});

export const textStatsInputSchema = z.object({
	text: runtimeLimitedString(100_000, "Text"),
	wordsPerMinute: z.number().int().min(80).max(500).default(200),
});

export const base64ToolInputSchema = z.object({
	action: z.enum(["encode", "decode"]),
	value: runtimeLimitedString(100_000, "Value"),
});

export const hashTextInputSchema = z.object({
	text: runtimeLimitedString(100_000, "Text"),
	algorithm: z.enum(["sha256", "sha1", "md5"]).default("sha256"),
});

export const unitConverterInputSchema = z.object({
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

export const slugifyTextInputSchema = z.object({
	text: z.string().min(1).max(1_000),
	separator: z.enum(["-", "_"]).default("-"),
});

export const colorConverterInputSchema = z.object({
	hex: z
		.string()
		.trim()
		.regex(/^#?[0-9a-fA-F]{6}$/, "Use a 6-digit hex color"),
});

export const markdownTableInputSchema = z.object({
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

export function calculateExpression(expression: string) {
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

export async function searchWebWithSearxng(
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

export function randomNumbers({
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

export function dateMath(input: z.infer<typeof dateMathInputSchema>) {
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

export function jsonTool({
	action,
	json,
}: z.infer<typeof jsonToolInputSchema>) {
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

export function textStats({
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

export function base64Tool({
	action,
	value,
}: z.infer<typeof base64ToolInputSchema>) {
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

export function unitConverter({
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

export function slugifyText({
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

export function colorConverter({
	hex,
}: z.infer<typeof colorConverterInputSchema>) {
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

export function markdownTable({
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
