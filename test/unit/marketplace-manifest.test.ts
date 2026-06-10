import { describe, it, expect } from "vitest";
import {
	buildMcpPresetManifest,
	buildSkillManifest,
} from "@/modules/marketplace/manifest-builders";
import { skillFileStats } from "@/modules/marketplace/manifest-types";
import { installPostInstallFlags } from "@/modules/marketplace/install-helpers";

const baseServer = {
	id: "srv-1",
	workspaceId: "ws-1",
	createdById: "user-1",
	name: "Test Server",
	transport: "sse" as const,
	command: null,
	argsJson: null,
	url: "https://mcp.example.com",
	encryptedHeadersJson: { Authorization: "enc" },
	encryptedEnvJson: null,
	enabled: true,
	requireApproval: false,
	healthStatus: "healthy",
	lastCheckedAt: null,
	archivedAt: null,
	createdAt: new Date(),
	updatedAt: new Date(),
};

const baseTool = {
	id: "tool-1",
	mcpServerId: "srv-1",
	name: "search",
	description: "Search the web",
	inputSchemaJson: { type: "object" },
	outputSchemaJson: null,
	enabled: true,
	requireApproval: false,
	discoveredAt: null,
	createdAt: new Date(),
	updatedAt: new Date(),
};

const baseSkill = {
	id: "skill-1",
	workspaceId: "ws-1",
	createdById: "user-1",
	name: "My Skill",
	description: "A skill",
	sourcePackage: null,
	sourceSkillName: null,
	installCommand: null,
	markdownFilesJson: [{ path: "SKILL.md", content: "# Hello" }],
	metadataJson: null,
	archivedAt: null,
	createdAt: new Date(),
	updatedAt: new Date(),
};

describe("skillFileStats", () => {
	it("counts files and bytes", () => {
		const stats = skillFileStats([
			{ path: "a.md", content: "abc" },
			{ path: "b.md", content: "de" },
		]);
		expect(stats.fileCount).toBe(2);
		expect(stats.totalBytes).toBe(5);
	});
});

describe("buildSkillManifest", () => {
	it("includes file stats in manifest", () => {
		const manifest = buildSkillManifest(baseSkill, "My Skill", "desc");
		expect(manifest.type).toBe("skill");
		expect(manifest.skill.fileCount).toBe(1);
		expect(manifest.skill.totalBytes).toBe(7);
		expect(manifest.skill.markdownFiles[0].content).toBe("# Hello");
	});
});

describe("buildMcpPresetManifest", () => {
	it("excludes secrets by default", () => {
		const manifest = buildMcpPresetManifest(
			"Test Server",
			null,
			baseServer,
			[baseTool],
			"server",
			false,
		);
		expect(manifest.preset.requiresCredentials).toBe(true);
		expect(manifest.preset.secretsIncluded).toBeFalsy();
		expect(manifest.preset.encryptedHeadersJson).toBeUndefined();
		expect(manifest.preset.tools[0].name).toBe("search");
		expect(manifest.preset.enabled).toBe(true);
	});

	it("includes secrets when requested", () => {
		const manifest = buildMcpPresetManifest(
			"Test Server",
			null,
			baseServer,
			[baseTool],
			"server",
			true,
		);
		expect(manifest.preset.secretsIncluded).toBe(true);
		expect(manifest.preset.encryptedHeadersJson).toEqual({
			Authorization: "enc",
		});
	});
});

describe("installPostInstallFlags", () => {
	it("flags missing credentials on mcp preset", () => {
		const flags = installPostInstallFlags({
			type: "mcp_preset",
			name: "x",
			preset: {
				scope: "server",
				serverName: "s",
				transport: "stdio",
				enabled: true,
				requireApproval: false,
				requiresCredentials: true,
				secretsIncluded: false,
				tools: [],
			},
		});
		expect(flags.requiresCredentials).toBe(true);
	});

	it("clears flag when secrets included", () => {
		const flags = installPostInstallFlags({
			type: "custom_tool",
			name: "t",
			tool: {
				requiresCredentials: true,
				secretsIncluded: true,
			},
		});
		expect(flags.requiresCredentials).toBe(false);
	});
});
