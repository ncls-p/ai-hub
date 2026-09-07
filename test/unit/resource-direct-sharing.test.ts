import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getDirectResourceSharing,
  replaceDirectResourceSharing,
} from "@/modules/iam/resource-direct-sharing";
import * as _auditModule from "@/server/domain/services/audit";
import * as _authorizationModule from "@/server/domain/services/authorization";
import * as _dbModule from "@/server/infrastructure/db";
import * as _resourceRepository from "@/server/infrastructure/db/access-resource-repository";
import * as _resourceSharing from "@/modules/iam/resource-sharing";

type Chain = {
  from: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  onConflictDoNothing: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
  then: Promise<unknown[]>["then"];
};

const selectResults: unknown[][] = [];
const insertedValues: unknown[] = [];

vi.mock("@/server/infrastructure/db", () => ({
  withPostgresAdvisoryLock: (_key: string, callback: () => Promise<unknown>) =>
    callback(),
  db: {
    transaction: vi.fn((callback) => callback(_dbModule.db)),
    select: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(),
  },
}));
vi.mock("@/server/domain/services/authorization", () => ({
  authorization: {
    listPermissions: vi.fn(({ principalId }) =>
      Promise.resolve(principalId === "owner-1" ? ["*"] : []),
    ),
    invalidatePrincipalPermissionCache: vi.fn(),
    hasPermission: vi.fn(),
    hasDirectPermission: vi.fn(),
    invalidatePermissionCache: vi.fn(),
  },
}));
vi.mock("@/server/domain/services/audit", () => ({
  audit: { emit: vi.fn() },
}));
vi.mock("@/server/infrastructure/db/access-resource-repository", () => ({
  findAccessResource: vi.fn(),
}));
vi.mock("@/modules/iam/resource-sharing", () => ({
  listResourceShareTargets: vi.fn(),
}));
vi.mock("@/modules/iam/use-cases.iam-operation-error", async () => {
  const actual = await vi.importActual<
    typeof import("@/modules/iam/use-cases.iam-operation-error")
  >("@/modules/iam/use-cases.iam-operation-error");
  return {
    ...actual,
    getWorkspaceScope: vi.fn().mockResolvedValue({
      workspace: { id: "workspace-1" },
      organization: { id: "organization-1" },
    }),
  };
});

const dbModule = _dbModule as unknown as {
  db: {
    select: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
  };
};
const authorizationModule = _authorizationModule as unknown as {
  authorization: {
    hasPermission: ReturnType<typeof vi.fn>;
    hasDirectPermission: ReturnType<typeof vi.fn>;
    invalidatePermissionCache: ReturnType<typeof vi.fn>;
    invalidatePrincipalPermissionCache: ReturnType<typeof vi.fn>;
  };
};
const auditModule = _auditModule as unknown as {
  audit: { emit: ReturnType<typeof vi.fn> };
};
const resourceRepository = _resourceRepository as unknown as {
  findAccessResource: ReturnType<typeof vi.fn>;
};
const resourceSharing = _resourceSharing as unknown as {
  listResourceShareTargets: ReturnType<typeof vi.fn>;
};

function chain(result: unknown[] = []): Chain {
  const query = {} as Chain;
  const promise = Promise.resolve(result);
  query.from = vi.fn(() => query);
  query.innerJoin = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.orderBy = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.values = vi.fn((values: unknown) => {
    insertedValues.push(values);
    return query;
  });
  query.onConflictDoNothing = vi.fn(() => query);
  query.returning = vi.fn(() => query);
  query.then = promise.then.bind(promise);
  return query;
}

const viewerRoleRow = { id: "viewer-role", name: "workspace.viewer" };
const editorRoleRow = {
  id: "editor-role",
  name: "workspace.knowledge_editor",
};

beforeEach(() => {
  selectResults.length = 0;
  insertedValues.length = 0;
  vi.clearAllMocks();
  dbModule.db.select.mockImplementation(() =>
    chain(selectResults.shift() ?? []),
  );
  dbModule.db.delete.mockImplementation(() => chain());
  dbModule.db.insert.mockImplementation(() => chain());
  authorizationModule.authorization.hasPermission.mockImplementation(
    (_principal: unknown, permission: string) =>
      Promise.resolve(permission === "workspaces.get"),
  );
  authorizationModule.authorization.hasDirectPermission.mockResolvedValue(true);
  authorizationModule.authorization.invalidatePermissionCache.mockResolvedValue(
    undefined,
  );
  resourceRepository.findAccessResource.mockResolvedValue({
    id: "kb-1",
    name: "Docs",
    workspaceId: "workspace-1",
    organizationId: "organization-1",
  });
  resourceSharing.listResourceShareTargets.mockResolvedValue([
    { type: "knowledge_base", id: "kb-1" },
  ]);
  auditModule.audit.emit.mockResolvedValue(undefined);
});

describe("direct resource sharing", () => {
  it("loads active members and current direct shares", async () => {
    selectResults.push(
      [viewerRoleRow, editorRoleRow],
      [
        { id: "owner-1", name: "Owner", email: "owner@example.com" },
        { id: "member-1", name: "Member", email: "member@example.com" },
      ],
      [{ userId: "member-1", roleId: "viewer-role" }],
    );

    await expect(
      getDirectResourceSharing({
        actorUserId: "owner-1",
        workspaceId: "workspace-1",
        resourceType: "knowledge_base",
        resourceId: "kb-1",
      }),
    ).resolves.toEqual({
      members: [
        { id: "member-1", name: "Member", email: "member@example.com" },
      ],
      sharedUserIds: ["member-1"],
      shares: [{ userId: "member-1", access: "view" }],
    });
  });

  it("reports edit access for users bound to the knowledge editor role", async () => {
    selectResults.push(
      [viewerRoleRow, editorRoleRow],
      [
        { id: "member-1", name: "Member", email: "member@example.com" },
        { id: "member-2", name: "Other", email: "other@example.com" },
      ],
      [
        { userId: "member-1", roleId: "editor-role" },
        { userId: "member-2", roleId: "viewer-role" },
      ],
    );

    await expect(
      getDirectResourceSharing({
        actorUserId: "owner-1",
        workspaceId: "workspace-1",
        resourceType: "knowledge_base",
        resourceId: "kb-1",
      }),
    ).resolves.toMatchObject({
      sharedUserIds: ["member-1", "member-2"],
      shares: [
        { userId: "member-1", access: "edit" },
        { userId: "member-2", access: "view" },
      ],
    });
  });

  it("allows a project access manager when no direct grant exists", async () => {
    authorizationModule.authorization.hasPermission.mockResolvedValue(true);
    authorizationModule.authorization.hasDirectPermission.mockResolvedValue(
      false,
    );
    selectResults.push([viewerRoleRow], [], []);

    await expect(
      getDirectResourceSharing({
        actorUserId: "admin-1",
        workspaceId: "workspace-1",
        resourceType: "mcp_server",
        resourceId: "kb-1",
      }),
    ).resolves.toEqual({ members: [], sharedUserIds: [], shares: [] });
  });

  it("rejects unknown and unauthorized resources", async () => {
    resourceRepository.findAccessResource.mockResolvedValueOnce(null);
    await expect(
      getDirectResourceSharing({
        actorUserId: "owner-1",
        workspaceId: "workspace-1",
        resourceType: "agent",
        resourceId: "agent-1",
      }),
    ).rejects.toThrow("Resource not found");

    authorizationModule.authorization.hasDirectPermission.mockResolvedValue(
      false,
    );
    await expect(
      getDirectResourceSharing({
        actorUserId: "member-1",
        workspaceId: "workspace-1",
        resourceType: "knowledge_base",
        resourceId: "kb-1",
      }),
    ).rejects.toThrow("cannot share");
  });

  it("rejects sharing when the viewer role is unavailable", async () => {
    selectResults.push([]);
    await expect(
      getDirectResourceSharing({
        actorUserId: "owner-1",
        workspaceId: "workspace-1",
        resourceType: "knowledge_base",
        resourceId: "kb-1",
      }),
    ).rejects.toThrow("roles required for sharing");
  });

  it("rejects selected users outside the organization", async () => {
    selectResults.push([viewerRoleRow, editorRoleRow], []);
    await expect(
      replaceDirectResourceSharing({
        actorUserId: "owner-1",
        workspaceId: "workspace-1",
        resourceType: "knowledge_base",
        resourceId: "kb-1",
        userIds: ["outside-user"],
      }),
    ).rejects.toThrow("outside this organization");
  });

  it("rejects organization members without project access", async () => {
    authorizationModule.authorization.hasPermission.mockResolvedValue(false);
    selectResults.push(
      [viewerRoleRow, editorRoleRow],
      [{ userId: "member-1" }],
    );
    await expect(
      replaceDirectResourceSharing({
        actorUserId: "owner-1",
        workspaceId: "workspace-1",
        resourceType: "knowledge_base",
        resourceId: "kb-1",
        userIds: ["member-1"],
      }),
    ).rejects.toThrow("does not have access to this project");
  });

  it("replaces shares, cascades agent dependencies, and invalidates caches", async () => {
    resourceRepository.findAccessResource.mockResolvedValue({
      id: "agent-1",
      workspaceId: "workspace-1",
    });
    resourceSharing.listResourceShareTargets.mockResolvedValue([
      { type: "agent", id: "agent-1" },
      { type: "mcp_server", id: "mcp-1" },
    ]);
    selectResults.push(
      [{ id: "agent-user-role", name: "workspace.agent_user" }, viewerRoleRow],
      [{ userId: "member-1" }, { userId: "member-2" }],
      [{ userId: "old-member" }],
    );

    await expect(
      replaceDirectResourceSharing({
        actorUserId: "owner-1",
        workspaceId: "workspace-1",
        resourceType: "agent",
        resourceId: "agent-1",
        userIds: ["member-1", "member-1", "member-2", "owner-1"],
      }),
    ).resolves.toEqual({
      userIds: ["member-1", "member-2"],
      resourceCount: 2,
    });
    expect(dbModule.db.insert).toHaveBeenCalledOnce();
    expect(insertedValues).toContainEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceType: "agent",
          resourceId: "agent-1",
          roleId: "agent-user-role",
          conditionJson: {
            source: "agent_direct_share",
            rootAgentId: "agent-1",
          },
        }),
        expect.objectContaining({
          resourceType: "mcp_server",
          resourceId: "mcp-1",
          roleId: "viewer-role",
          conditionJson: {
            source: "agent_direct_share",
            rootAgentId: "agent-1",
          },
        }),
      ]),
    );
    expect(
      authorizationModule.authorization.invalidatePrincipalPermissionCache,
    ).toHaveBeenCalledTimes(3);
    expect(resourceSharing.listResourceShareTargets).toHaveBeenCalledWith({
      resourceType: "agent",
      resourceId: "agent-1",
      includeDependencies: true,
    });
    expect(auditModule.audit.emit).toHaveBeenCalledOnce();
  });

  it("removes all direct shares without inserting replacements", async () => {
    selectResults.push([viewerRoleRow], [{ userId: "old-member" }]);
    await expect(
      replaceDirectResourceSharing({
        actorUserId: "owner-1",
        workspaceId: "workspace-1",
        resourceType: "mcp_server",
        resourceId: "kb-1",
        userIds: [],
      }),
    ).resolves.toEqual({ userIds: [], resourceCount: 1 });
    expect(dbModule.db.insert).not.toHaveBeenCalled();
    expect(resourceSharing.listResourceShareTargets).toHaveBeenCalledWith(
      expect.objectContaining({ includeDependencies: false }),
    );
  });

  it("binds the knowledge editor role for edit-level shares", async () => {
    selectResults.push(
      [viewerRoleRow, editorRoleRow],
      [{ userId: "member-1" }, { userId: "member-2" }],
      [],
    );

    await expect(
      replaceDirectResourceSharing({
        actorUserId: "owner-1",
        workspaceId: "workspace-1",
        resourceType: "knowledge_base",
        resourceId: "kb-1",
        shares: [
          { userId: "member-1", access: "edit" },
          { userId: "member-2", access: "view" },
        ],
      }),
    ).resolves.toEqual({
      userIds: ["member-1", "member-2"],
      resourceCount: 1,
    });
    expect(insertedValues).toContainEqual(
      expect.arrayContaining([
        expect.objectContaining({
          principalId: "member-1",
          roleId: "editor-role",
          resourceType: "knowledge_base",
          resourceId: "kb-1",
        }),
        expect.objectContaining({
          principalId: "member-2",
          roleId: "viewer-role",
          resourceType: "knowledge_base",
          resourceId: "kb-1",
        }),
      ]),
    );
    expect(auditModule.audit.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          access: { view: ["member-2"], edit: ["member-1"] },
        }),
      }),
    );
  });

  it("downgrades an editor to view access", async () => {
    selectResults.push(
      [viewerRoleRow, editorRoleRow],
      [{ userId: "member-1" }],
      [{ userId: "member-1" }],
    );

    await expect(
      replaceDirectResourceSharing({
        actorUserId: "owner-1",
        workspaceId: "workspace-1",
        resourceType: "knowledge_base",
        resourceId: "kb-1",
        shares: [{ userId: "member-1", access: "view" }],
      }),
    ).resolves.toEqual({ userIds: ["member-1"], resourceCount: 1 });
    expect(dbModule.db.delete).toHaveBeenCalledOnce();
    expect(insertedValues).toContainEqual(
      expect.arrayContaining([
        expect.objectContaining({
          principalId: "member-1",
          roleId: "viewer-role",
        }),
      ]),
    );
  });

  it("revokes both viewer and editor bindings when shares are omitted", async () => {
    selectResults.push(
      [viewerRoleRow, editorRoleRow],
      [{ userId: "member-1" }],
    );

    await expect(
      replaceDirectResourceSharing({
        actorUserId: "owner-1",
        workspaceId: "workspace-1",
        resourceType: "knowledge_base",
        resourceId: "kb-1",
        shares: [],
      }),
    ).resolves.toEqual({ userIds: [], resourceCount: 1 });
    expect(dbModule.db.delete).toHaveBeenCalledOnce();
    expect(dbModule.db.insert).not.toHaveBeenCalled();
    expect(
      authorizationModule.authorization.invalidatePrincipalPermissionCache,
    ).toHaveBeenCalledWith("member-1");
  });

  it("lazily creates the knowledge editor role when it is missing", async () => {
    dbModule.db.insert.mockImplementationOnce(() => chain([editorRoleRow]));
    selectResults.push([viewerRoleRow], [{ userId: "member-1" }], []);

    await expect(
      replaceDirectResourceSharing({
        actorUserId: "owner-1",
        workspaceId: "workspace-1",
        resourceType: "knowledge_base",
        resourceId: "kb-1",
        shares: [{ userId: "member-1", access: "edit" }],
      }),
    ).resolves.toEqual({ userIds: ["member-1"], resourceCount: 1 });
    expect(insertedValues).toContainEqual(
      expect.objectContaining({
        name: "workspace.knowledge_editor",
        isSystem: true,
        createdById: "owner-1",
      }),
    );
    expect(insertedValues).toContainEqual(
      expect.arrayContaining([
        expect.objectContaining({
          principalId: "member-1",
          roleId: "editor-role",
        }),
      ]),
    );
  });

  it("coerces edit shares to view access for agents", async () => {
    resourceRepository.findAccessResource.mockResolvedValue({
      id: "agent-1",
      workspaceId: "workspace-1",
    });
    resourceSharing.listResourceShareTargets.mockResolvedValue([
      { type: "agent", id: "agent-1" },
    ]);
    selectResults.push(
      [{ id: "agent-user-role", name: "workspace.agent_user" }, viewerRoleRow],
      [{ userId: "member-1" }],
      [],
    );

    await expect(
      replaceDirectResourceSharing({
        actorUserId: "owner-1",
        workspaceId: "workspace-1",
        resourceType: "agent",
        resourceId: "agent-1",
        shares: [{ userId: "member-1", access: "edit" }],
      }),
    ).resolves.toEqual({ userIds: ["member-1"], resourceCount: 1 });
    expect(insertedValues).toContainEqual(
      expect.arrayContaining([
        expect.objectContaining({
          principalId: "member-1",
          roleId: "agent-user-role",
          resourceType: "agent",
        }),
      ]),
    );
  });
});
