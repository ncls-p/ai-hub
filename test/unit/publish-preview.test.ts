import * as draftHelpers from "@/modules/marketplace/draft-helpers";
import * as manifestBuilders from "@/modules/marketplace/manifest-builders";
import type {
  AgentMarketplaceManifest,
  SkillMarketplaceManifest,
} from "@/modules/marketplace/manifest-types";
import { getPublishPreview } from "@/modules/marketplace/publish-preview";
import * as _dbModule from "@/server/infrastructure/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
// ─── DB mock ────────────────────────────────────────────────────────────
type SelectChain = {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};
type DbMock = {
  select: ReturnType<typeof vi.fn>;
};
type DbModule = {
  db: DbMock;
  _selectChain: SelectChain;
};
vi.mock("@/server/infrastructure/db", () => {
  const selectChain: SelectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };
  return {
    db: {
      select: vi.fn(),
    },
    _selectChain: selectChain,
  };
});
vi.mock("@/modules/marketplace/manifest-builders", () => ({
  buildAgentManifest: vi.fn(),
  buildSkillManifest: vi.fn(),
  buildCustomToolManifest: vi.fn(),
  buildMcpPresetManifest: vi.fn(),
}));
vi.mock("@/modules/marketplace/draft-helpers", () => ({
  findExistingDraft: vi.fn().mockResolvedValue(null),
}));
const dbModule = _dbModule as unknown as DbModule;
const mockBuildAgent = vi.mocked(manifestBuilders.buildAgentManifest);
const mockBuildSkill = vi.mocked(manifestBuilders.buildSkillManifest);
const mockFindDraft = vi.mocked(draftHelpers.findExistingDraft) as ReturnType<
  typeof vi.fn<() => Promise<unknown>>
>;
function resetChains() {
  dbModule._selectChain.from.mockReset().mockReturnThis();
  dbModule._selectChain.where.mockReset().mockReturnThis();
  dbModule._selectChain.limit.mockReset().mockResolvedValue([]);
}
beforeEach(() => {
  vi.clearAllMocks();
  resetChains();
  dbModule.db.select.mockReturnValue(dbModule._selectChain);
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
  toolBindings: [
    { source: "builtin", ref: "web_search", requireApproval: false },
  ],
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
            publisherUserId: "user-1",
            publisherWorkspaceId: "ws-1",
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
          publisherUserId: "user-1",
          publisherWorkspaceId: "ws-1",
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
        {
          id: agentId,
          name: "Smart Agent",
          description: "Helps you",
          createdById: "user-1",
        },
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
        {
          id: skillId,
          name: "My Skill",
          description: null,
          createdById: "user-1",
        },
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
});
