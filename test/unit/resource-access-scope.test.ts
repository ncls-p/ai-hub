import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyAgentAccessSelection,
  getAgentAccessOptions,
  getAgentAccessSelection,
  invalidateAgentAccessCache,
  validateAgentAccessSelection,
} from "@/modules/agent/access-scope";
import {
  applyResourceAccessSelection,
  getResourceAccessSelection,
} from "@/modules/iam/resource-access-scope";
import { canEditAgentForScope } from "@/modules/agent/use-cases.get-visible-agent-by-id";
import {
  buildResourceProvenance,
  withResourceProvenance,
} from "@/modules/iam/resource-provenance";
import * as _authorizationModule from "@/server/domain/services/authorization";
import * as _dbModule from "@/server/infrastructure/db";

type Chain = {
  from: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  onConflictDoNothing: ReturnType<typeof vi.fn>;
  then: Promise<unknown[]>["then"];
};

const selectResults: unknown[][] = [];
const mutationSets: unknown[] = [];

vi.mock("@/server/infrastructure/db/access-resource-repository", () => ({
  findAccessResource: vi.fn().mockResolvedValue({
    workspaceId: "workspace-1",
    organizationId: "organization-1",
  }),
}));
vi.mock(
  "@/modules/iam/use-cases.iam-operation-error",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/modules/iam/use-cases.iam-operation-error")
      >();
    const { SYSTEM_ROLES } = await import("@/server/domain/entities/iam");
    return {
      ...actual,
      findSystemRole: vi.fn(async (name: string) => {
        const role = SYSTEM_ROLES.find((item) => item.name === name)!;
        return { ...role, permissionsJson: role.permissions };
      }),
    };
  },
);

vi.mock("@/modules/iam/resource-sharing", () => ({
  listResourceShareTargets: vi.fn().mockResolvedValue([
    { type: "agent", id: "agent-1" },
    { type: "agent", id: "agent-2" },
    { type: "knowledge_base", id: "kb-1" },
  ]),
}));

vi.mock("@/modules/agent/access-scope.agent-graph", () => ({
  AgentAccessError: class AgentAccessError extends Error {
    constructor(
      message: string,
      public readonly status = 403,
    ) {
      super(message);
    }
  },
  loadAgentGraphIds: vi.fn().mockResolvedValue(["agent-1", "agent-2"]),
  loadOwnedAgentGraph: vi.fn().mockResolvedValue(["agent-1"]),
}));

vi.mock("@/server/infrastructure/db", () => ({
  db: {
    select: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@/server/domain/services/authorization", () => ({
  authorization: {
    listPermissions: vi.fn().mockResolvedValue(["*"]),
    hasPermission: vi.fn(),
    invalidatePermissionCache: vi.fn(),
  },
}));

const dbModule = _dbModule as unknown as {
  db: {
    select: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
  };
};
const authorizationModule = _authorizationModule as unknown as {
  authorization: {
    hasPermission: ReturnType<typeof vi.fn>;
    invalidatePermissionCache: ReturnType<typeof vi.fn>;
  };
};

function chain(result: unknown[] = []): Chain {
  const promise = Promise.resolve(result);
  const query = {} as Chain;
  query.from = vi.fn(() => query);
  query.innerJoin = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.orderBy = vi.fn(() => query);
  query.set = vi.fn((value: unknown) => {
    mutationSets.push(value);
    return query;
  });
  query.values = vi.fn(() => query);
  query.onConflictDoNothing = vi.fn(() => query);
  query.then = promise.then.bind(promise);
  return query;
}

beforeEach(() => {
  selectResults.length = 0;
  mutationSets.length = 0;
  vi.clearAllMocks();
  dbModule.db.select.mockImplementation(() =>
    chain(selectResults.shift() ?? []),
  );
  dbModule.db.delete.mockImplementation(() => chain());
  dbModule.db.update.mockImplementation(() => chain());
  dbModule.db.insert.mockImplementation(() => chain());
  authorizationModule.authorization.hasPermission.mockResolvedValue(false);
  authorizationModule.authorization.invalidatePermissionCache.mockResolvedValue(
    undefined,
  );
});

describe("assistant access scope primitives", () => {
  it("offers scopes and teams according to share permissions", async () => {
    selectResults.push(
      [
        {
          workspaceId: "workspace-1",
          projectName: "Maiah",
          organizationId: "organization-1",
          organizationName: "Deodis",
        },
      ],
      [{ id: "team-1", name: "Platform" }],
    );
    authorizationModule.authorization.hasPermission
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);

    await expect(
      getAgentAccessOptions("owner-1", "workspace-1"),
    ).resolves.toEqual({
      scopes: ["private", "project", "team", "organization"],
      teams: [{ id: "team-1", name: "Platform" }],
      projectName: "Maiah",
      organizationName: "Deodis",
    });
  });

  it("returns private-only options and rejects a forbidden scope", async () => {
    const workspace = {
      workspaceId: "workspace-1",
      projectName: "Maiah",
      organizationId: "organization-1",
      organizationName: "Deodis",
    };
    selectResults.push([workspace], [workspace]);

    await expect(
      getAgentAccessOptions("member-1", "workspace-1"),
    ).resolves.toEqual(
      expect.objectContaining({ scopes: ["private"], teams: [] }),
    );
    await expect(
      validateAgentAccessSelection({
        userId: "member-1",
        workspaceId: "workspace-1",
        selection: { scope: "project" },
      }),
    ).rejects.toThrow("You do not have permission");
  });

  it("validates required and organization-owned teams", async () => {
    const workspace = {
      workspaceId: "workspace-1",
      projectName: "Maiah",
      organizationId: "organization-1",
      organizationName: "Deodis",
    };
    authorizationModule.authorization.hasPermission.mockResolvedValue(true);
    selectResults.push([workspace], [{ id: "team-1", name: "Platform" }]);
    await expect(
      validateAgentAccessSelection({
        userId: "owner-1",
        workspaceId: "workspace-1",
        selection: { scope: "team" },
      }),
    ).rejects.toThrow("A team is required");

    selectResults.push([workspace], [{ id: "team-1", name: "Platform" }]);
    await expect(
      validateAgentAccessSelection({
        userId: "owner-1",
        workspaceId: "workspace-1",
        selection: { scope: "team", teamId: "other-team" },
      }),
    ).rejects.toThrow("outside this organization");

    selectResults.push([workspace], [{ id: "team-1", name: "Platform" }]);
    await expect(
      validateAgentAccessSelection({
        userId: "owner-1",
        workspaceId: "workspace-1",
        selection: { scope: "team", teamId: "team-1" },
      }),
    ).resolves.toBeUndefined();
  });

  it("fails when the project no longer exists", async () => {
    selectResults.push([]);
    await expect(
      getAgentAccessOptions("owner-1", "missing-workspace"),
    ).rejects.toThrow("Project not found");
  });

  it("applies assistant team access and invalidates graph caches", async () => {
    selectResults.push(
      [{ workspaceId: "workspace-1", organizationId: "organization-1" }],
      [],
      [{ id: "agent-user-role" }],
      [{ teamId: "old-team" }],
      [{ userId: "member-1" }, { userId: "member-1" }],
      [
        { id: "agent-user-role", name: "workspace.agent_user" },
        { id: "viewer-role", name: "workspace.viewer" },
      ],
    );
    await expect(
      applyAgentAccessSelection({
        agentId: "agent-1",
        userId: "owner-1",
        selection: { scope: "team", teamId: "team-1" },
      }),
    ).resolves.toEqual(["member-1"]);
    expect(dbModule.db.insert).toHaveBeenCalledTimes(2);

    await invalidateAgentAccessCache("agent-1", ["member-1"]);
    expect(
      authorizationModule.authorization.invalidatePermissionCache,
    ).toHaveBeenCalledWith("member-1", "agent", "agent-1");
    expect(
      authorizationModule.authorization.invalidatePermissionCache,
    ).toHaveBeenCalledWith("member-1", "agent", "agent-2");
  });

  it.each([
    ["private", "private", false],
    ["project", "workspace", true],
    ["organization", "organization", true],
  ] as const)(
    "applies assistant %s visibility",
    async (scope, visibility, isGlobal) => {
      selectResults.push(
        [{ workspaceId: "workspace-1", organizationId: "organization-1" }],
        [],
        [{ id: "agent-user-role" }],
        [],
      );
      if (scope !== "private") {
        selectResults.push(
          [
            { id: "agent-user-role", name: "workspace.agent_user" },
            { id: "viewer-role", name: "workspace.viewer" },
          ],
          [{ userId: "member-1" }],
          [],
        );
      }
      await applyAgentAccessSelection({
        agentId: "agent-1",
        userId: "owner-1",
        selection: { scope },
      });
      expect(mutationSets).toContainEqual(
        expect.objectContaining({
          visibility,
          isGlobal,
          sharingMode: "personal",
        }),
      );
    },
  );

  it("rejects assistant changes without the system role", async () => {
    selectResults.push(
      [{ workspaceId: "workspace-1", organizationId: "organization-1" }],
      [],
      [],
    );
    await expect(
      applyAgentAccessSelection({
        agentId: "agent-1",
        userId: "owner-1",
        selection: { scope: "private" },
      }),
    ).rejects.toThrow("Assistant access role is unavailable");
  });

  it.each([
    [
      [{ teamId: "team-1" }],
      "private",
      false,
      { scope: "team", teamId: "team-1" },
    ],
    [[], "organization", false, { scope: "organization" }],
    [[], "workspace", false, { scope: "project" }],
    [[], "private", true, { scope: "project" }],
    [[], "private", false, { scope: "private" }],
  ] as const)(
    "reads persisted assistant access",
    async (bindings, visibility, isGlobal, expected) => {
      selectResults.push([...bindings]);
      await expect(
        getAgentAccessSelection({
          id: "agent-1",
          visibility,
          isGlobal,
        } as never),
      ).resolves.toEqual(expected);
    },
  );
});

describe("scope-aware assistant administration", () => {
  const agent = {
    id: "agent-1",
    workspaceId: "workspace-1",
    createdById: "owner-1",
    visibility: "private",
    isGlobal: false,
  };

  it("always lets the creator edit", async () => {
    await expect(canEditAgentForScope(agent as never, "owner-1")).resolves.toBe(
      true,
    );
    expect(
      authorizationModule.authorization.hasPermission,
    ).not.toHaveBeenCalled();
  });

  it("lets project admins edit project-scoped assistants", async () => {
    authorizationModule.authorization.hasPermission.mockResolvedValue(true);
    await expect(
      canEditAgentForScope(
        { ...agent, visibility: "workspace", isGlobal: true } as never,
        "project-admin",
      ),
    ).resolves.toBe(true);
    expect(
      authorizationModule.authorization.hasPermission,
    ).toHaveBeenCalledWith(
      { principalType: "user", principalId: "project-admin" },
      "agents.manage",
      "workspace",
      "workspace-1",
    );
  });

  it("requires organization administration for organization scope", async () => {
    selectResults.push([{ organizationId: "organization-1" }]);
    authorizationModule.authorization.hasPermission.mockResolvedValue(true);
    await expect(
      canEditAgentForScope(
        { ...agent, visibility: "organization", isGlobal: true } as never,
        "organization-admin",
      ),
    ).resolves.toBe(true);
    expect(
      authorizationModule.authorization.hasPermission,
    ).toHaveBeenCalledWith(
      { principalType: "user", principalId: "organization-admin" },
      "agents.manage",
      "organization",
      "organization-1",
    );
  });

  it("does not let an unrelated admin edit a private assistant", async () => {
    await expect(
      canEditAgentForScope(agent as never, "other-user", true),
    ).resolves.toBe(false);
  });
});

describe("resource access scopes", () => {
  it.each([
    {
      bindings: [{ teamId: "team-1" }],
      expected: { scope: "team", teamId: "team-1" },
      visibility: undefined,
      isGlobal: undefined,
    },
    {
      bindings: [],
      expected: { scope: "organization" },
      visibility: "organization",
      isGlobal: undefined,
    },
    {
      bindings: [],
      expected: { scope: "project" },
      visibility: "workspace",
      isGlobal: undefined,
    },
    {
      bindings: [],
      expected: { scope: "project" },
      visibility: null,
      isGlobal: true,
    },
    {
      bindings: [],
      expected: { scope: "private" },
      visibility: undefined,
      isGlobal: undefined,
    },
  ] as const)(
    "derives the persisted selection for each visibility",
    async ({ bindings, expected, visibility, isGlobal }) => {
      selectResults.push([...bindings]);
      await expect(
        getResourceAccessSelection({
          resourceType: "mcp_server",
          resourceId: "mcp-1",
          visibility,
          isGlobal,
        }),
      ).resolves.toEqual(expected);
    },
  );

  it("rejects changes when the system viewer role is unavailable", async () => {
    selectResults.push([]);
    await expect(
      applyResourceAccessSelection({
        resourceType: "knowledge_base",
        resourceId: "kb-1",
        userId: "owner-1",
        selection: { scope: "private" },
      }),
    ).rejects.toThrow("Resource access role is unavailable");
  });

  it("applies a private knowledge-base selection without team grants", async () => {
    selectResults.push([{ id: "viewer-role" }], []);

    await applyResourceAccessSelection({
      resourceType: "knowledge_base",
      resourceId: "kb-1",
      userId: "owner-1",
      selection: { scope: "private" },
    });

    expect(mutationSets).toContainEqual(
      expect.objectContaining({ isGlobal: false, visibility: "private" }),
    );
    expect(dbModule.db.insert).not.toHaveBeenCalled();
    expect(
      authorizationModule.authorization.invalidatePermissionCache,
    ).not.toHaveBeenCalled();
  });

  it.each([
    ["project", "workspace"],
    ["organization", "organization"],
  ] as const)("applies the %s MCP scope", async (scope, visibility) => {
    selectResults.push(
      [{ id: "viewer-role" }],
      [{ teamId: "old-team" }],
      [{ userId: "member-1" }, { userId: "member-1" }],
    );

    await applyResourceAccessSelection({
      resourceType: "mcp_server",
      resourceId: "mcp-1",
      userId: "owner-1",
      selection: { scope },
    });

    expect(mutationSets).toContainEqual(
      expect.objectContaining({ isGlobal: true, visibility }),
    );
    expect(
      authorizationModule.authorization.invalidatePermissionCache,
    ).toHaveBeenCalledTimes(1);
    expect(
      authorizationModule.authorization.invalidatePermissionCache,
    ).toHaveBeenCalledWith("member-1", "mcp_server", "mcp-1");
  });

  it("replaces team access and invalidates old and new team members", async () => {
    selectResults.push(
      [{ id: "viewer-role" }],
      [{ teamId: "old-team" }],
      [{ userId: "old-member" }, { userId: "new-member" }],
    );

    await applyResourceAccessSelection({
      resourceType: "knowledge_base",
      resourceId: "kb-1",
      userId: "owner-1",
      selection: { scope: "team", teamId: "new-team" },
    });

    expect(mutationSets).toContainEqual(
      expect.objectContaining({ isGlobal: false, visibility: "private" }),
    );
    expect(dbModule.db.insert).toHaveBeenCalledTimes(1);
    expect(
      authorizationModule.authorization.invalidatePermissionCache,
    ).toHaveBeenCalledTimes(2);
  });
});

describe("resource provenance", () => {
  const context = {
    currentUserId: "owner-1",
    workspaceName: "Maiah",
    organizationName: "Deodis",
    ownerNames: new Map([["owner-1", "Nicolas Pierrot"]]),
  };

  it("labels every explicit scope and preserves legacy global provenance", () => {
    expect(
      buildResourceProvenance(
        { createdById: "owner-1", visibility: "workspace" },
        context,
      ),
    ).toEqual({
      scope: "workspace",
      scopeName: "Maiah",
      ownerName: "Nicolas Pierrot",
    });
    expect(
      buildResourceProvenance(
        { createdById: "owner-1", visibility: "organization" },
        context,
      ).scope,
    ).toBe("organization");
    expect(
      buildResourceProvenance(
        { createdById: "owner-1", isGlobal: true },
        context,
      ).scope,
    ).toBe("organization");
    expect(
      buildResourceProvenance({ createdById: "owner-1" }, context),
    ).toEqual({
      scope: "user",
      scopeName: "Nicolas Pierrot",
      ownerName: "Nicolas Pierrot",
    });
    expect(
      buildResourceProvenance({ createdById: "other-user" }, context),
    ).toEqual({
      scope: "workspace",
      scopeName: "Maiah",
      ownerName: "Unknown user",
    });
  });

  it("adds provenance with database context and handles empty input", async () => {
    await expect(
      withResourceProvenance([], "workspace-1", "owner-1"),
    ).resolves.toEqual([]);

    selectResults.push(
      [{ name: "Maiah", organizationName: "Deodis" }],
      [{ id: "owner-1", name: "Nicolas Pierrot" }],
    );
    await expect(
      withResourceProvenance(
        [{ id: "mcp-1", createdById: "owner-1", visibility: "private" }],
        "workspace-1",
        "owner-1",
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "mcp-1",
        provenance: {
          scope: "user",
          scopeName: "Nicolas Pierrot",
          ownerName: "Nicolas Pierrot",
        },
      }),
    ]);
  });

  it("uses fallback scope names when workspace context is absent", async () => {
    selectResults.push([], []);
    const [resource] = await withResourceProvenance(
      [{ createdById: "missing-user", visibility: "organization" }],
      "missing-workspace",
      "owner-1",
    );
    expect(resource.provenance).toEqual({
      scope: "organization",
      scopeName: "Organization",
      ownerName: "Unknown user",
    });
  });
});

describe("publishing delegation ceilings", () => {
  it("rejects publishing before changing bindings when the author lacks usage rights", async () => {
    selectResults.push([
      { workspaceId: "workspace-1", organizationId: "organization-1" },
    ]);
    vi.mocked(
      _authorizationModule.authorization.listPermissions,
    ).mockResolvedValueOnce(["roles.assign", "agents.get"]);
    await expect(
      applyAgentAccessSelection({
        agentId: "agent-1",
        userId: "restricted",
        selection: { scope: "project" },
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(dbModule.db.delete).not.toHaveBeenCalled();
    expect(dbModule.db.insert).not.toHaveBeenCalled();
  });
  it("rejects a knowledge share without the corresponding read permission", async () => {
    vi.mocked(
      _authorizationModule.authorization.listPermissions,
    ).mockResolvedValueOnce(["roles.assign"]);
    await expect(
      applyResourceAccessSelection({
        resourceType: "knowledge_base",
        resourceId: "kb-1",
        userId: "restricted",
        selection: { scope: "team", teamId: "team-1" },
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(dbModule.db.delete).not.toHaveBeenCalled();
  });
});
