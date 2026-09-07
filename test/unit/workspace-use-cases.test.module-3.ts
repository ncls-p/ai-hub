import { describe, expect, it } from "vitest";

import { updateWorkspaceMemberRole } from "@/modules/workspace/use-cases";
import {
  dbModule,
  fakeMember,
  fakeRole,
  fakeWorkspace,
} from "./workspace-use-cases.test.db-module";

describe("updateWorkspaceMemberRole", () => {
  it("throws when workspace not found", async () => {
    await expect(
      updateWorkspaceMemberRole({
        workspaceId: "ws-1",
        userId: "user-2",
        roleName: "workspace.member",
        updatedBy: "user-1",
      }),
    ).rejects.toThrow("Workspace not found");
  });

  it("throws when role not found", async () => {
    dbModule._chain.limit
      .mockResolvedValueOnce([fakeWorkspace])
      .mockResolvedValueOnce([]); // getSystemWorkspaceRole → not found

    await expect(
      updateWorkspaceMemberRole({
        workspaceId: "ws-1",
        userId: "user-2",
        roleName: "workspace.admin",
        updatedBy: "user-1",
      }),
    ).rejects.toThrow("Role not found");
  });

  it("throws when member not found", async () => {
    dbModule._chain.limit
      .mockResolvedValueOnce([fakeWorkspace])
      .mockResolvedValueOnce([fakeRole])
      .mockResolvedValueOnce([]) // no scoped customization
      .mockResolvedValueOnce([]);

    await expect(
      updateWorkspaceMemberRole({
        workspaceId: "ws-1",
        userId: "user-2",
        roleName: "workspace.member",
        updatedBy: "user-1",
      }),
    ).rejects.toThrow("Member not found");
  });

  it("deletes old binding and inserts new one via transaction", async () => {
    dbModule._chain.limit
      .mockResolvedValueOnce([fakeWorkspace])
      .mockResolvedValueOnce([fakeRole])
      .mockResolvedValueOnce([]) // no scoped customization
      .mockResolvedValueOnce([fakeMember]);

    await updateWorkspaceMemberRole({
      workspaceId: "ws-1",
      userId: "user-2",
      roleName: "workspace.member",
      updatedBy: "user-1",
    });

    expect(dbModule.db.transaction).toHaveBeenCalledOnce();
  });
});
