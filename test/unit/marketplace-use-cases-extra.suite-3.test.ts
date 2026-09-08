vi.mock("@/modules/resource-package/permissions", () => ({
  requirePackageInstallPermissions: vi.fn().mockResolvedValue(undefined),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
const helperMocks = vi.hoisted(() => ({
  upsertMarketplaceDraft: vi.fn(async (input: unknown) => ({ draft: input })),
  buildAgentManifest: vi.fn(async () => ({
    type: "agent",
    name: "Agent",
    agent: {},
  })),
  buildCustomToolManifest: vi.fn(async () => ({
    type: "custom_tool",
    name: "Tool",
    tool: {},
  })),
  buildMcpPresetManifest: vi.fn(() => ({
    type: "mcp_preset",
    name: "Preset",
    preset: { tools: [] },
  })),
  buildSkillManifest: vi.fn(() => ({
    type: "skill",
    name: "Skill",
    skill: { markdownFiles: [] },
  })),
  installAgentManifest: vi.fn(async () => ({ id: "installed-agent" })),
  installCustomTool: vi.fn(async () => ({
    tool: { id: "installed-tool" },
    requiresCredentials: false,
  })),
  installMcpPreset: vi.fn(async () => ({
    server: { id: "installed-server" },
    requiresCredentials: true,
  })),
  installPostInstallFlags: vi.fn(() => ({ requiresCredentials: false })),
}));

vi.mock("@/modules/marketplace/draft-helpers", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/modules/marketplace/draft-helpers")
  >()),
  upsertMarketplaceDraft: helperMocks.upsertMarketplaceDraft,
}));
vi.mock("@/modules/marketplace/manifest-builders", () => ({
  buildAgentManifest: helperMocks.buildAgentManifest,
  buildCustomToolManifest: helperMocks.buildCustomToolManifest,
  buildMcpPresetManifest: helperMocks.buildMcpPresetManifest,
  buildSkillManifest: helperMocks.buildSkillManifest,
}));
vi.mock("@/modules/marketplace/install-helpers", () => ({
  installAgentManifest: helperMocks.installAgentManifest,
  installCustomTool: helperMocks.installCustomTool,
  installMcpPreset: helperMocks.installMcpPreset,
  installPostInstallFlags: helperMocks.installPostInstallFlags,
}));
vi.mock("@/server/domain/services/audit", () => ({
  audit: { emit: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/server/domain/services/authorization", () => ({
  authorization: { hasPermission: vi.fn().mockResolvedValue(false) },
}));
vi.mock("@/server/infrastructure/db/access-resource-repository", () => ({
  listDirectlyBoundResourceIds: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/logger", () => ({ logHandledError: vi.fn() }));

type Chain = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
};
function makeChain(): Chain {
  const c = {} as Chain;
  for (const key of [
    "select",
    "insert",
    "update",
    "delete",
    "from",
    "innerJoin",
    "where",
    "orderBy",
    "values",
    "set",
  ] as const)
    c[key] = vi.fn().mockReturnThis();
  c.limit = vi.fn().mockResolvedValue([]);
  c.returning = vi.fn().mockResolvedValue([]);
  return c;
}
type DbModule = {
  db: {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    transaction: ReturnType<typeof vi.fn>;
  };
  _c: Chain;
  _tx: Chain;
};
vi.mock("@/server/infrastructure/db", () => {
  const chain = makeChain();
  const tx = makeChain();
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn(),
    },
    _c: chain,
    _tx: tx,
  };
});
import { logHandledError } from "@/lib/logger";
import {
  createCustomToolMarketplaceDraft,
  createMcpServerMarketplaceDraft,
  createMcpToolMarketplaceDraft,
  createSkillMarketplaceDraft,
  getMarketplaceItemDetail,
  installMarketplaceItem,
} from "@/modules/marketplace/use-cases";
import * as _dbModule from "@/server/infrastructure/db";

const dbModule = _dbModule as unknown as DbModule;
const ids = { workspaceId: "ws-1", userId: "user-1", otherUserId: "user-2" };
const item = {
  id: "item-1",
  publisherUserId: ids.userId,
  publisherWorkspaceId: ids.workspaceId,
  status: "draft",
  visibility: "private",
  latestVersionId: "version-1",
  tagsJson: ["old"],
  description: "Item",
};
const published = { ...item, status: "published", visibility: "public" };
function resetChain(chain: Chain) {
  for (const key of [
    "select",
    "insert",
    "update",
    "delete",
    "from",
    "innerJoin",
    "where",
    "orderBy",
    "values",
    "set",
  ] as const)
    chain[key].mockReset().mockReturnThis();
  chain.limit.mockReset().mockResolvedValue([]);
  chain.returning.mockReset().mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetChain(dbModule._c);
  resetChain(dbModule._tx);
  dbModule.db.select.mockReset().mockReturnValue(dbModule._c);
  dbModule.db.insert.mockReset().mockReturnValue(dbModule._c);
  dbModule.db.update.mockReset().mockReturnValue(dbModule._c);
  dbModule.db.delete.mockReset().mockReturnValue(dbModule._c);
  dbModule.db.transaction
    .mockReset()
    .mockImplementation((cb: (tx: Chain) => Promise<unknown>) =>
      cb(dbModule._tx),
    );
  helperMocks.installPostInstallFlags.mockReturnValue({
    requiresCredentials: false,
  });
});
describe("marketplace item management", () => {
  it("loads item detail with owner shares and install permission", async () => {
    dbModule._c.limit
      .mockResolvedValueOnce([published])
      .mockResolvedValueOnce([
        {
          id: "version-1",
          version: "1",
          manifestJson: { type: "skill" },
          createdAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([
        { id: ids.userId, name: "Owner", email: "owner@test" },
      ]);
    dbModule._c.where
      .mockReturnValueOnce(dbModule._c)
      .mockResolvedValueOnce([{ id: "share-1" }])
      .mockReturnValueOnce(dbModule._c)
      .mockReturnValueOnce(dbModule._c)
      .mockResolvedValueOnce([
        {
          userId: ids.otherUserId,
          name: "Target",
          email: "t@test",
          sharedAt: new Date(),
        },
      ]);

    const detail = await getMarketplaceItemDetail("item-1", ids.userId);
    expect(detail).toMatchObject({
      id: "item-1",
      isOwner: true,
      canInstall: true,
    });
    expect(detail?.shares).toHaveLength(1);
  });
});

describe("marketplace installation", () => {
  it("rejects unavailable installs, missing versions, and unsupported manifest types", async () => {
    dbModule._c.limit.mockResolvedValueOnce([]);
    await expect(
      installMarketplaceItem({
        workspaceId: ids.workspaceId,
        userId: ids.userId,
        itemId: "missing",
      }),
    ).rejects.toThrow("Marketplace item not found");
    expect(logHandledError).toHaveBeenCalled();

    resetChain(dbModule._c);
    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule._c.limit.mockResolvedValueOnce([
      { ...published, status: "suspended" },
    ]);
    await expect(
      installMarketplaceItem({
        workspaceId: ids.workspaceId,
        userId: ids.otherUserId,
        itemId: "item-1",
      }),
    ).rejects.toThrow("Marketplace item not available");

    resetChain(dbModule._c);
    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule._c.limit
      .mockResolvedValueOnce([published])
      .mockResolvedValueOnce([]);
    await expect(
      installMarketplaceItem({
        workspaceId: ids.workspaceId,
        userId: ids.otherUserId,
        itemId: "item-1",
      }),
    ).rejects.toThrow("Marketplace item has no version");

    resetChain(dbModule._c);
    resetChain(dbModule._tx);
    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule.db.transaction.mockImplementation(
      (cb: (tx: Chain) => Promise<unknown>) => cb(dbModule._tx),
    );
    dbModule._c.limit
      .mockResolvedValueOnce([published])
      .mockResolvedValueOnce([
        { id: "version-1", version: "1", manifestJson: { type: "weird" } },
      ]);
    await expect(
      installMarketplaceItem({
        workspaceId: ids.workspaceId,
        userId: ids.otherUserId,
        itemId: "item-1",
      }),
    ).rejects.toThrow("Unsupported marketplace type");
  });
});
describe("marketplace draft creation", () => {
  it("creates skill, custom tool, MCP server, and MCP tool drafts", async () => {
    dbModule._c.limit.mockResolvedValueOnce([
      {
        id: "skill-1",
        name: "skill",
        description: "Skill",
        createdById: ids.userId,
      },
    ]);
    await createSkillMarketplaceDraft({
      workspaceId: ids.workspaceId,
      userId: ids.userId,
      skillId: "skill-1",
      version: "1",
    });
    expect(helperMocks.buildSkillManifest).toHaveBeenCalled();

    resetChain(dbModule._c);
    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule._c.limit.mockResolvedValueOnce([
      {
        id: "tool-1",
        name: "Tool",
        description: "Tool",
        createdById: ids.userId,
      },
    ]);
    await createCustomToolMarketplaceDraft({
      workspaceId: ids.workspaceId,
      userId: ids.userId,
      customToolId: "tool-1",
      version: "1",
    });
    expect(helperMocks.buildCustomToolManifest).toHaveBeenCalled();

    resetChain(dbModule._c);
    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule._c.limit.mockResolvedValueOnce([
      { id: "server-1", name: "Server", createdById: ids.userId },
    ]);
    dbModule._c.where
      .mockReturnValueOnce(dbModule._c)
      .mockResolvedValueOnce([{ id: "mcp-tool-1", name: "search" }]);
    await createMcpServerMarketplaceDraft({
      workspaceId: ids.workspaceId,
      userId: ids.userId,
      mcpServerId: "server-1",
      version: "1",
    });
    expect(helperMocks.buildMcpPresetManifest).toHaveBeenCalledWith(
      "Server",
      undefined,
      expect.any(Object),
      [{ id: "mcp-tool-1", name: "search" }],
      "server",
    );

    resetChain(dbModule._c);
    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule._c.limit
      .mockResolvedValueOnce([
        {
          id: "mcp-tool-1",
          name: "search",
          description: "Search",
          mcpServerId: "server-1",
        },
      ])
      .mockResolvedValueOnce([
        { id: "server-1", name: "Server", createdById: ids.userId },
      ]);
    await createMcpToolMarketplaceDraft({
      workspaceId: ids.workspaceId,
      userId: ids.userId,
      mcpToolId: "mcp-tool-1",
      version: "1",
    });
    expect(helperMocks.buildMcpPresetManifest).toHaveBeenLastCalledWith(
      "Server — search",
      "Search",
      expect.any(Object),
      [expect.objectContaining({ name: "search" })],
      "tool",
    );
  });
});
