import { describe, expect, it } from "vitest";

import {
  addWorkspaceMember,
  createWorkspace,
  ensurePrimaryWorkspaceForUser,
  ensureWorkspaceForUser,
} from "@/modules/workspace/use-cases";
import {
  dbModule,
  fakeMember,
  fakeRole,
  fakeWorkspace,
} from "./workspace-use-cases.test.db-module";

describe("ensureWorkspaceForUser", () => {
  it("keeps an existing accessible project instead of recreating the primary organization", async () => {
    const existingWorkspace = {
      ...fakeWorkspace,
      id: "workspace-existing",
      organizationId: "organization-existing",
    };
    dbModule._chain.where.mockResolvedValueOnce([
      {
        workspace: existingWorkspace,
        member: fakeMember,
        organizationMember: null,
        organization: {
          id: "organization-existing",
          name: "Existing organization",
        },
      },
    ]);

    const result = await ensureWorkspaceForUser({ userId: "user-2" });

    expect(result).toEqual(existingWorkspace);
    expect(dbModule.db.transaction).not.toHaveBeenCalled();
  });
});

describe("ensurePrimaryWorkspaceForUser", () => {
  it("joins the hidden primary workspace with the role derived from platform role", async () => {
    const primaryWorkspace = { ...fakeWorkspace, slug: "main", name: "Maiah" };
    const adminRole = {
      ...fakeRole,
      id: "role-admin",
      name: "workspace.admin",
    };

    dbModule._chain.limit
      .mockResolvedValueOnce([{ workspace: primaryWorkspace }]) // getPrimaryWorkspace
      .mockResolvedValueOnce([]) // getActiveWorkspaceMember
      .mockResolvedValueOnce([]) // getActiveOrganizationMember
      .mockResolvedValueOnce([]) // no managed membership in any organization
      .mockResolvedValueOnce([primaryWorkspace]) // addWorkspaceMember workspace lookup
      .mockResolvedValueOnce([]) // existing member lookup
      .mockResolvedValueOnce([]) // existing organization member
      .mockResolvedValueOnce([adminRole]); // getSystemWorkspaceRole
    dbModule._tx.limit.mockResolvedValueOnce([]); // existing role binding lookup

    const result = await ensurePrimaryWorkspaceForUser({
      userId: "user-2",
      role: "admin",
      invitedBy: "admin-1",
    });

    expect(result).toEqual(primaryWorkspace);
    expect(dbModule.db.transaction).toHaveBeenCalledOnce();
  });

  it("updates an active member when platform role is downgraded", async () => {
    const primaryWorkspace = { ...fakeWorkspace, slug: "main", name: "Maiah" };
    const memberRole = {
      ...fakeRole,
      id: "role-member",
      name: "workspace.member",
    };

    dbModule._chain.limit
      .mockResolvedValueOnce([{ workspace: primaryWorkspace }]) // getPrimaryWorkspace
      .mockResolvedValueOnce([fakeMember]) // getActiveWorkspaceMember
      .mockResolvedValueOnce([{ roleName: "workspace.admin" }]) // getWorkspaceRoleName
      .mockResolvedValueOnce([primaryWorkspace]) // updateWorkspaceMemberRole workspace lookup
      .mockResolvedValueOnce([memberRole]) // getSystemWorkspaceRole
      .mockResolvedValueOnce([]) // no scoped customization
      .mockResolvedValueOnce([fakeMember]); // member lookup

    await ensurePrimaryWorkspaceForUser({
      userId: "user-2",
      role: "user",
      invitedBy: "admin-1",
    });

    expect(dbModule.db.transaction).toHaveBeenCalledOnce();
  });

  it("does not grant default project access to an organization member", async () => {
    const primaryWorkspace = { ...fakeWorkspace, slug: "main", name: "Maiah" };

    dbModule._chain.limit
      .mockResolvedValueOnce([{ workspace: primaryWorkspace }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "organization-member-1" }]);

    const result = await ensurePrimaryWorkspaceForUser({
      userId: "user-2",
      role: "user",
      invitedBy: "admin-1",
    });

    expect(result).toEqual(primaryWorkspace);
    expect(dbModule.db.transaction).not.toHaveBeenCalled();
  });

  it("preserves explicit custom IAM roles during platform synchronization", async () => {
    const primaryWorkspace = { ...fakeWorkspace, slug: "main", name: "Maiah" };

    dbModule._chain.limit
      .mockResolvedValueOnce([{ workspace: primaryWorkspace }])
      .mockResolvedValueOnce([fakeMember])
      .mockResolvedValueOnce([{ roleName: "custom.access-manager" }]);

    await ensurePrimaryWorkspaceForUser({
      userId: "user-2",
      role: "user",
      invitedBy: "admin-1",
    });

    expect(dbModule.db.transaction).not.toHaveBeenCalled();
  });

  it("preserves multiple explicit assignments during platform synchronization", async () => {
    const primaryWorkspace = { ...fakeWorkspace, slug: "main", name: "Maiah" };

    dbModule._chain.limit
      .mockResolvedValueOnce([{ workspace: primaryWorkspace }])
      .mockResolvedValueOnce([fakeMember])
      .mockResolvedValueOnce([
        { roleName: "workspace.member" },
        { roleName: "custom.audit-reader" },
      ]);

    await ensurePrimaryWorkspaceForUser({
      userId: "user-2",
      role: "admin",
      invitedBy: "admin-1",
    });

    expect(dbModule.db.transaction).not.toHaveBeenCalled();
  });
});

describe("createWorkspace", () => {
  it("creates workspace via transaction, returning workspace object", async () => {
    const fakeOrg = { id: "org-1", name: "Acme", slug: "acme" };
    const fakeWs = {
      id: "ws-2",
      name: "Main",
      slug: "main",
      organizationId: "org-1",
    };
    const seedRole = { id: "role-owner", name: "workspace.owner" };

    // tx.select().from(organizations).where().limit(1) → finds existing org
    dbModule._tx.limit.mockResolvedValue([fakeOrg]);

    // tx.insert(workspaces).values().returning() → first returning = workspace
    // tx.insert(roles).values().onConflictDoNothing().returning() → default [] (then fallback select)
    dbModule._tx.returning
      .mockResolvedValueOnce([fakeWs]) // workspace insert
      .mockResolvedValue([]); // role inserts (all empty → fallback to limit)

    // tx.select().from(roles).where().limit(1) for seedSystemRoles fallbacks → seedRole
    // Already covered: tx.limit default returns [fakeOrg] which is truthy (acts as role)
    // Override to return something with an id property
    dbModule._tx.limit.mockResolvedValue([seedRole]);

    const result = await createWorkspace({
      userId: "user-1",
      organizationName: "Acme",
      organizationSlug: "acme",
      workspaceName: "Main",
      workspaceSlug: "main",
    });

    expect(result).toEqual(fakeWs);
    expect(dbModule.db.transaction).toHaveBeenCalledOnce();
  });
});

describe("addWorkspaceMember", () => {
  it("throws when workspace not found", async () => {
    await expect(
      addWorkspaceMember({
        workspaceId: "ws-1",
        userId: "user-2",
        invitedBy: "user-1",
      }),
    ).rejects.toThrow("Workspace not found");
  });

  it("throws when user is already an active member", async () => {
    dbModule._chain.limit
      .mockResolvedValueOnce([fakeWorkspace])
      .mockResolvedValueOnce([{ ...fakeMember, status: "active" }]);

    await expect(
      addWorkspaceMember({
        workspaceId: "ws-1",
        userId: "user-2",
        invitedBy: "user-1",
      }),
    ).rejects.toThrow("already a workspace member");
  });

  it("throws when role not found", async () => {
    dbModule._chain.limit
      .mockResolvedValueOnce([fakeWorkspace])
      .mockResolvedValueOnce([]) // no existing member
      .mockResolvedValueOnce([]) // no organization member
      .mockResolvedValueOnce([]); // role not found

    await expect(
      addWorkspaceMember({
        workspaceId: "ws-1",
        userId: "user-2",
        roleName: "workspace.nonexistent",
        invitedBy: "user-1",
      }),
    ).rejects.toThrow("Role not found");
  });

  it("adds new member via transaction (no existing member)", async () => {
    dbModule._chain.limit
      .mockResolvedValueOnce([fakeWorkspace])
      .mockResolvedValueOnce([]) // no existing member
      .mockResolvedValueOnce([]) // no organization member
      .mockResolvedValueOnce([fakeRole]);

    // tx: check existing binding
    dbModule._tx.limit.mockResolvedValueOnce([]); // no existing binding

    await addWorkspaceMember({
      workspaceId: "ws-1",
      userId: "user-2",
      invitedBy: "user-1",
    });

    expect(dbModule.db.transaction).toHaveBeenCalledOnce();
  });

  it("reactivates removed member via transaction update", async () => {
    dbModule._chain.limit
      .mockResolvedValueOnce([fakeWorkspace])
      .mockResolvedValueOnce([{ ...fakeMember, status: "removed" }])
      .mockResolvedValueOnce([]) // no organization member
      .mockResolvedValueOnce([fakeRole]);

    // tx: check existing binding
    dbModule._tx.limit.mockResolvedValueOnce([]);

    await addWorkspaceMember({
      workspaceId: "ws-1",
      userId: "user-2",
      invitedBy: "user-1",
    });

    expect(dbModule.db.transaction).toHaveBeenCalledOnce();
  });
});
