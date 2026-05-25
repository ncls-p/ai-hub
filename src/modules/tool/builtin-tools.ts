import { z } from "zod";

export type ToolRiskLevel = "low" | "medium" | "high" | "critical";

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

function calculateExpression(expression: string) {
	// Restricted by calculatorInputSchema to arithmetic-only characters.
	const result = Function(`"use strict"; return (${expression});`)();
	if (typeof result !== "number" || !Number.isFinite(result)) {
		throw new Error("Expression did not evaluate to a finite number");
	}
	return result;
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
	return {
		type: "object",
		properties: {
			url: { type: "string", format: "uri" },
			method: { type: "string", enum: ["GET", "HEAD"], default: "GET" },
		},
		required: ["url"],
	};
}
