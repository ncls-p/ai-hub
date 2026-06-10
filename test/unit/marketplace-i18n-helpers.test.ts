import { describe, expect, it } from "vitest";
import { formatManifestPreview } from "@/components/marketplace/marketplace-i18n-helpers";

const t = (key: string, values?: Record<string, string | number>) => {
	if (values) {
		return `${key}:${JSON.stringify(values)}`;
	}
	return key;
};

describe("formatManifestPreview", () => {
	it("formats agent preview bullets", () => {
		const bullets = formatManifestPreview(
			{
				type: "agent",
				provider: "OpenAI",
				model: "gpt-4",
				toolBindings: 2,
				bundledMcp: 1,
				skillBindings: 1,
				knowledgeBindings: 0,
				hasSystemPrompt: true,
			},
			t,
		);

		expect(bullets.map((b) => b.label)).toEqual([
			'preview.agentProvider:{"provider":"OpenAI"}',
			'preview.agentModel:{"model":"gpt-4"}',
			'preview.agentTools:{"count":3}',
			'preview.agentSkills:{"count":1}',
			"preview.agentPrompt",
		]);
	});

	it("formats mcp preset preview bullets", () => {
		const bullets = formatManifestPreview(
			{
				type: "mcp_preset",
				transport: "sse",
				toolCount: 4,
				enabled: true,
				requiresCredentials: true,
			},
			t,
		);

		expect(bullets.map((b) => b.label)).toEqual([
			'preview.mcpTransport:{"transport":"sse"}',
			'preview.mcpTools:{"count":4}',
			"preview.mcpEnabled",
			"preview.mcpCredentials",
		]);
	});

	it("returns empty list for unknown type", () => {
		expect(formatManifestPreview({ type: "unknown" }, t)).toEqual([]);
	});
});
