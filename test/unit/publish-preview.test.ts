import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
	AgentMarketplaceManifest,
	McpPresetMarketplaceManifest,
	SkillMarketplaceManifest,
	ToolMarketplaceManifest,
} from "@/modules/marketplace/manifest-types";

// ─── DB mock ────────────────────────────────────────────────────────────

type SelectChain = {
	from: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
};

vi.mock("@/server/infrastructure/db", () => {
	const selectChain: SelectChain = {
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		limit: vi.fn().mockResolvedValue([]),
	};
	return {
		db: {
			select: vi.fn().mockReturnValue(selectChain),
		},
		_selectChain: selectChain,
	};
});

declare module "@/server/infrastructure/db" {
	export const _selectChain: SelectChain;
}

vi.mock("@/modules/marketplace/manifest-builders", () => ({
	buildAgentManifest: vi.fn(),
	buildSkillManifest: vi.fn(),
	buildCustomToolManifest: vi.fn(),
	buildMcpPresetManifest: vi.fn(),
}));

vi.mock("@/modules/marketplace/draft-helpers", () => ({
	findExistingDraft: vi.fn().mockResolvedValue(null),
}));

import * as dbModule from "@/server/infrastructure/db";
import * as manifestBuilders from "@/modules/marketplace/manifest-builders";
import * as draftHelpers from "@/modules/marketplace/draft-helpers";
import { getPublishPreview } from "@/modules/marketplace/publish-preview";

const mockBuildAgent = vi.mocked(manifestBuilders.buildAgentManifest);
const mockBuildSkill = vi.mocked(manifestBuilders.buildSkillManifest);
const mockBuildTool = vi.mocked(manifestBuilders.buildCustomToolManifest);
const mockBuildMcp = vi.mocked(manifestBuilders.buildMcpPresetManifest);
const mockFindDraft = vi.mocked(draftHelpers.findExistingDraft);

function resetChains() {
	dbModule._selectChain.from.mockReset().mockReturnThis();
	dbModule._selectChain.where.mockReset().mockReturnThis();
	dbModule._selectChain.limit.mockReset().mockResolvedValue([]);
}

beforeEach(() => {
	vi.clearAllMocks();
	resetChains();
	mockFindDraft.mockResolvedValue(null);
});

// ─── Fixture manifests ──────────────────────────────────────────────────

const agentManifest: AgentMarketplaceManifest = {
	type: "agent",
	name: "Test Agent",
	description: "An agent",
	agent: {
		systemPrompt: "You are helpful",
		providerId: "prov-1",
		modelId: "model-1",
		providerName: "OpenAI",
		modelName: "gpt-4",
	},
	toolBindings: [{ source: "builtin", ref: "web_search", requireApproval: false }],
	skillBindings: [{ ref: "my-skill" }],
	knowledgeBindings: [{ name: "kb-1" }],
	bundledResources: { skills: [], mcpPresets: [], customTools: [] },
};

const skillManifest: SkillMarketplaceManifest = {
	type: "skill",
	name: "My Skill",
	skill: {
		markdownFiles: [
			{ path: "README.md", content: "# Hello" },
			{ path: "guide.md", content: "Some guide text" },
		],
		sourcePackage: "@my/pkg",
		totalBytes: 21,
	},
};

const toolManifest: ToolMarketplaceManifest = {
	type: "custom_tool",
	name: "My Tool",
	tool: {
		status: "active",
		inputSchema: { type: "object" },
		outputSchema: { type: "string" },
		n8nWorkflowId: "wf-1",
		requiresCredentials: true,
		credentialSchema: [
			{ key: "API_KEY", label: "API Key", required: true },
		],
	},
};

const mcpManifest: McpPresetMarketplaceManifest = {
	type: "mcp_preset",
	name: "GitHub MCP",
	preset: {
		scope: "server",
		serverName: "github",
		transport: "stdio",
		enabled: true,
		requireApproval: true,
		requiresCredentials: true,
		credentialSchema: [
			{ key: "GH_TOKEN", label: "GitHub Token", required: true },
		],
		tools: [
			{ name: "list_repos", requireApproval: false, enabled: true },
		],
	},
};

// ─── Tests ──────────────────────────────────────────────────────────────

describe("getPublishPreview", () => {
	describe("when itemId is provided", () => {
		it("throws when marketplace item not found", async () => {
			dbModule._selectChain.limit.mockResolvedValueOnce([]);

			await expect(
				getPublishPreview({
					workspaceId: "ws-1",
					userId: "user-1",
					itemId: "item-1",
				}),
			).rejects.toThrow("Marketplace item not found");
		});

		it("returns preview for an existing item", async () => {
			const itemId = crypto.randomUUID();
			const versionId = crypto.randomUUID();
			dbModule._selectChain.limit
				.mockResolvedValueOnce([
					{
						id: itemId,
						name: "My Agent",
						description: "desc",
						tagsJson: ["ai"],
						status: "draft",
						latestVersionId: versionId,
					},
				])
				.mockResolvedValueOnce([
					{
						id: versionId,
						version: "1.2.0",
						manifestJson: agentManifest,
					},
				]);

			const preview = await getPublishPreview({
				workspaceId: "ws-1",
				userId: "user-1",
				itemId,
			});

			expect(preview.name).toBe("My Agent");
			expect(preview.tags).toEqual(["ai"]);
			expect(preview.suggestedVersion).toBe("1.2.0");
			expect(preview.hasExistingDraft).toBe(true);
			expect(preview.existingItemId).toBe(itemId);
			expect(preview.resourceType).toBe("marketplace_item");
			expect(preview.manifestPreview).toMatchObject({ type: "agent" });
		});

		it("handles item with no latestVersionId", async () => {
			const itemId = crypto.randomUUID();
			dbModule._selectChain.limit.mockResolvedValueOnce([
				{
					id: itemId,
					name: "Orphan Item",
					description: null,
					tagsJson: null,
					status: "published",
					latestVersionId: null,
				},
			]);

			const preview = await getPublishPreview({
				workspaceId: "ws-1",
				userId: "user-1",
				itemId,
			});

			expect(preview.name).toBe("Orphan Item");
			expect(preview.suggestedVersion).toBe("1.0.0");
			expect(preview.tags).toEqual([]);
		});
	});

	describe("when agentId is provided", () => {
		it("throws when agent not found", async () => {
			dbModule._selectChain.limit.mockResolvedValueOnce([]);

			await expect(
				getPublishPreview({
					workspaceId: "ws-1",
					userId: "user-1",
					agentId: "agent-1",
				}),
			).rejects.toThrow("Agent not found");
		});

		it("returns preview for an agent", async () => {
			const agentId = crypto.randomUUID();
			dbModule._selectChain.limit.mockResolvedValueOnce([
				{ id: agentId, name: "Smart Agent", description: "Helps you" },
			]);
			mockBuildAgent.mockResolvedValueOnce(agentManifest);

			const preview = await getPublishPreview({
				workspaceId: "ws-1",
				userId: "user-1",
				agentId,
			});

			expect(preview.name).toBe("Smart Agent");
			expect(preview.resourceType).toBe("agent");
			expect(preview.manifestPreview).toMatchObject({
				type: "agent",
				toolBindings: 1,
				skillBindings: 1,
				knowledgeBindings: 1,
				hasSystemPrompt: true,
			});
		});
	});

	describe("when skillId is provided", () => {
		it("throws when skill not found", async () => {
			dbModule._selectChain.limit.mockResolvedValueOnce([]);

			await expect(
				getPublishPreview({
					workspaceId: "ws-1",
					userId: "user-1",
					skillId: "skill-1",
				}),
			).rejects.toThrow("Skill not found");
		});

		it("returns preview for a skill manifest", async () => {
			const skillId = crypto.randomUUID();
			dbModule._selectChain.limit.mockResolvedValueOnce([
				{ id: skillId, name: "My Skill", description: null },
			]);
			mockBuildSkill.mockReturnValueOnce(skillManifest);

			const preview = await getPublishPreview({
				workspaceId: "ws-1",
				userId: "user-1",
				skillId,
			});

			expect(preview.resourceType).toBe("skill");
			expect(preview.manifestPreview).toMatchObject({
				type: "skill",
				fileCount: 2,
				sourcePackage: "@my/pkg",
			});
		});
	});

	describe("when customToolId is provided", () => {
		it("throws when custom tool not found", async () => {
			dbModule._selectChain.limit.mockResolvedValueOnce([]);

			await expect(
				getPublishPreview({
					workspaceId: "ws-1",
					userId: "user-1",
					customToolId: "tool-1",
				}),
			).rejects.toThrow("Custom tool not found");
		});

		it("returns preview for a custom tool", async () => {
			const toolId = crypto.randomUUID();
			dbModule._selectChain.limit.mockResolvedValueOnce([
				{ id: toolId, name: "My Tool", description: "does stuff" },
			]);
			mockBuildTool.mockResolvedValueOnce(toolManifest);

			const preview = await getPublishPreview({
				workspaceId: "ws-1",
				userId: "user-1",
				customToolId: toolId,
			});

			expect(preview.resourceType).toBe("custom_tool");
			expect(preview.credentialFields).toHaveLength(1);
			expect(preview.credentialFields[0].key).toBe("API_KEY");
			expect(preview.canIncludeSecrets).toBe(true);
			expect(preview.manifestPreview).toMatchObject({
				type: "custom_tool",
				requiresCredentials: true,
				n8nWorkflow: true,
			});
		});
	});

	describe("when mcpServerId is provided", () => {
		it("throws when MCP server not found", async () => {
			dbModule._selectChain.limit.mockResolvedValueOnce([]);

			await expect(
				getPublishPreview({
					workspaceId: "ws-1",
					userId: "user-1",
					mcpServerId: "srv-1",
				}),
			).rejects.toThrow("MCP server not found");
		});

		it("returns preview for an MCP server preset", async () => {
			const serverId = crypto.randomUUID();
			// First query: mcpServers — uses .limit()
			dbModule._selectChain.limit.mockResolvedValueOnce([
				{ id: serverId, name: "github", workspaceId: "ws-1" },
			]);
			// Second query: mcpTools — uses .where() as terminal (no .limit())
			dbModule._selectChain.where
				.mockReturnValueOnce(dbModule._selectChain) // server where → keeps chain for limit
				.mockResolvedValueOnce([
					{ id: "tool-1", name: "list_repos", mcpServerId: serverId },
				]);
			mockBuildMcp.mockReturnValueOnce(mcpManifest);

			const preview = await getPublishPreview({
				workspaceId: "ws-1",
				userId: "user-1",
				mcpServerId: serverId,
			});

			expect(preview.resourceType).toBe("mcp_server");
			expect(preview.credentialFields).toHaveLength(1);
			expect(preview.credentialFields[0].key).toBe("GH_TOKEN");
			expect(preview.manifestPreview).toMatchObject({
				type: "mcp_preset",
				toolCount: 1,
			});
		});
	});

	describe("when mcpToolId is provided", () => {
		it("throws when MCP tool not found", async () => {
			dbModule._selectChain.limit.mockResolvedValueOnce([]);

			await expect(
				getPublishPreview({
					workspaceId: "ws-1",
					userId: "user-1",
					mcpToolId: "tool-1",
				}),
			).rejects.toThrow("MCP tool not found");
		});

		it("throws when MCP server not found for tool", async () => {
			dbModule._selectChain.limit
				.mockResolvedValueOnce([
					{ id: "tool-1", name: "list_repos", mcpServerId: "srv-1" },
				])
				.mockResolvedValueOnce([]);

			await expect(
				getPublishPreview({
					workspaceId: "ws-1",
					userId: "user-1",
					mcpToolId: "tool-1",
				}),
			).rejects.toThrow("MCP server not found");
		});

		it("returns preview for an MCP tool", async () => {
			const toolId = crypto.randomUUID();
			const serverId = crypto.randomUUID();
			dbModule._selectChain.limit
				.mockResolvedValueOnce([
					{
						id: toolId,
						name: "list_repos",
						mcpServerId: serverId,
						description: "list them",
					},
				])
				.mockResolvedValueOnce([
					{ id: serverId, name: "github", workspaceId: "ws-1" },
				]);
			mockBuildMcp.mockReturnValueOnce(mcpManifest);

			const preview = await getPublishPreview({
				workspaceId: "ws-1",
				userId: "user-1",
				mcpToolId: toolId,
			});

			expect(preview.resourceType).toBe("mcp_tool");
		});
	});

	describe("existing draft detection", () => {
		it("marks hasExistingDraft true when a draft exists", async () => {
			const agentId = crypto.randomUUID();
			const draftId = crypto.randomUUID();
			dbModule._selectChain.limit.mockResolvedValueOnce([
				{ id: agentId, name: "Draft Agent", description: null },
			]);
			mockBuildAgent.mockResolvedValueOnce(agentManifest);
			mockFindDraft.mockResolvedValueOnce({
				id: draftId,
				tagsJson: ["beta"],
			} as Parameters<typeof mockFindDraft.mock.results[0]["value"]>[0]);

			const preview = await getPublishPreview({
				workspaceId: "ws-1",
				userId: "user-1",
				agentId,
			});

			expect(preview.hasExistingDraft).toBe(true);
			expect(preview.existingItemId).toBe(draftId);
			expect(preview.tags).toEqual(["beta"]);
		});

		it("marks hasExistingDraft false when no draft exists", async () => {
			const agentId = crypto.randomUUID();
			dbModule._selectChain.limit.mockResolvedValueOnce([
				{ id: agentId, name: "New Agent", description: null },
			]);
			mockBuildAgent.mockResolvedValueOnce(agentManifest);
			mockFindDraft.mockResolvedValueOnce(null);

			const preview = await getPublishPreview({
				workspaceId: "ws-1",
				userId: "user-1",
				agentId,
			});

			expect(preview.hasExistingDraft).toBe(false);
			expect(preview.existingItemId).toBeNull();
		});
	});

	describe("throws when no resource id provided", () => {
		it("throws when no resource id is given", async () => {
			await expect(
				getPublishPreview({ workspaceId: "ws-1", userId: "user-1" }),
			).rejects.toThrow("No resource id provided");
		});
	});
});
