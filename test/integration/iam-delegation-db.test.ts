import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addOrganizationMember,
  addTeamMember,
  assignRole,
  createCustomRole,
  createOrganizationWithProject,
  createTeam,
  removeRoleAssignment,
  removeOrganizationMember,
  updateCustomRole,
} from "@/modules/iam/use-cases";
import { db } from "@/server/infrastructure/db";
import {
  auditEvents,
  organizations,
  organizationMembers,
  roleBindings,
  roles,
  users,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { authorization } from "@/server/domain/services/authorization";

const suite = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;
suite("delegated access cannot exceed the actor's authority", () => {
  const owner = randomUUID(),
    manager = randomUUID(),
    junior = randomUUID(),
    peer = randomUUID();
  const userIds = [owner, manager, junior, peer];
  const suffix = randomUUID().slice(0, 8);
  let workspaceId = "",
    organizationId = "",
    managerRoleId = "",
    readerRoleId = "";
  const actor = () => ({ actorUserId: manager, workspaceId });
  beforeAll(async () => {
    await db.insert(users).values(
      userIds.map((id, index) => ({
        id,
        name: `Delegation ${index}`,
        email: `${id}@example.test`,
        emailVerified: true,
      })),
    );
    workspaceId = (
      await createOrganizationWithProject({
        userId: owner,
        organizationName: `Delegation ${suffix}`,
        projectName: "Project",
      })
    ).id;
    organizationId = (
      await db.select().from(workspaces).where(eq(workspaces.id, workspaceId))
    )[0].organizationId;
    for (const id of [manager, junior, peer])
      await addOrganizationMember({
        actorUserId: owner,
        workspaceId,
        email: `${id}@example.test`,
      });
    const managerRole = await createCustomRole({
      actorUserId: owner,
      workspaceId,
      displayName: "Delegated manager",
      scopeType: "workspace",
      permissions: [
        "workspaces.get",
        "roles.get",
        "roles.create",
        "roles.update",
        "roles.delete",
        "roles.assign",
        "roles.revoke",
        "agents.get",
        "agents.create",
      ],
    });
    managerRoleId = managerRole.id;
    for (const id of [manager, peer])
      await assignRole({
        actorUserId: owner,
        workspaceId,
        principalType: "user",
        principalId: id,
        scopeType: "workspace",
        roleId: managerRole.id,
      });
  });
  afterAll(async () => {
    if (organizationId)
      await db
        .delete(auditEvents)
        .where(eq(auditEvents.organizationId, organizationId));
    await db
      .delete(roleBindings)
      .where(inArray(roleBindings.createdById, userIds));
    await db
      .delete(roles)
      .where(
        and(eq(roles.isSystem, false), inArray(roles.createdById, userIds)),
      );
    if (organizationId)
      await db
        .delete(organizations)
        .where(eq(organizations.id, organizationId));
    await db
      .update(roles)
      .set({ createdById: null })
      .where(
        and(eq(roles.isSystem, true), inArray(roles.createdById, userIds)),
      );
    await db.delete(users).where(inArray(users.id, userIds));
  });
  it("creates and assigns a custom role to a subordinate", async () => {
    const reader = await createCustomRole({
      ...actor(),
      displayName: "Reader",
      scopeType: "workspace",
      permissions: ["workspaces.get", "agents.get"],
    });
    readerRoleId = reader.id;
    await assignRole({
      ...actor(),
      principalType: "user",
      principalId: junior,
      roleId: reader.id,
      scopeType: "workspace",
    });
    expect(
      await authorization.hasPermission(
        { principalType: "user", principalId: junior },
        "agents.get",
        "workspace",
        workspaceId,
      ),
    ).toBe(true);
  });
  it("rejects unknown rights, stronger roles, peer grants and self grants", async () => {
    for (const permissions of [
      ["agents.delete"],
      ["agents.manage"],
      ["agents.futureAction"],
    ])
      await expect(
        createCustomRole({
          ...actor(),
          displayName: "Invalid role",
          scopeType: "workspace",
          permissions,
        }),
      ).rejects.toMatchObject({
        status: permissions[0] === "agents.futureAction" ? 400 : 403,
      });
    for (const id of [manager, peer, owner])
      await expect(
        assignRole({
          ...actor(),
          principalType: "user",
          principalId: id,
          roleId: readerRoleId,
          scopeType: "workspace",
        }),
      ).rejects.toMatchObject({ status: 403 });
  });
  it("cannot edit its own assigned role, even to reduce its permissions", async () => {
    await expect(
      updateCustomRole({
        ...actor(),
        roleId: managerRoleId,
        displayName: "Self edit",
        permissions: ["workspaces.get"],
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("serializes concurrent role edits and rejects the stale version", async () => {
    const role = (
      await db.select().from(roles).where(eq(roles.id, readerRoleId))
    )[0];
    const edits = await Promise.allSettled(
      ["Reader A", "Reader B"].map((displayName) =>
        updateCustomRole({
          ...actor(),
          roleId: readerRoleId,
          displayName,
          expectedUpdatedAt: role.updatedAt.toISOString(),
          permissions: ["agents.get"],
        }),
      ),
    );
    expect(
      edits.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(edits.find((result) => result.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
  });
  it("cannot gain project administrator rights through team membership", async () => {
    const organizationRole = await createCustomRole({
      actorUserId: owner,
      workspaceId,
      displayName: "Team coordinator",
      scopeType: "organization",
      permissions: ["organization.get", "teams.update"],
    });
    await assignRole({
      actorUserId: owner,
      workspaceId,
      principalType: "user",
      principalId: manager,
      roleId: organizationRole.id,
      scopeType: "organization",
    });
    const team = await createTeam({
      actorUserId: owner,
      workspaceId,
      name: "Privileged team",
    });
    const admin = (
      await db
        .select()
        .from(roles)
        .where(and(eq(roles.name, "workspace.admin"), eq(roles.isSystem, true)))
    )[0];
    await assignRole({
      actorUserId: owner,
      workspaceId,
      principalType: "group",
      principalId: team.id,
      roleId: admin.id,
      scopeType: "workspace",
    });
    await expect(
      addTeamMember({ ...actor(), teamId: team.id, userId: manager }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      addTeamMember({ ...actor(), teamId: team.id, userId: junior }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("checks virtual groups and descendant privileges when removing a member", async () => {
    const { requireSubordinatePrincipal } =
      await import("@/modules/iam/delegation");
    for (const groupId of [organizationId, workspaceId])
      await expect(
        requireSubordinatePrincipal({
          actorUserId: manager,
          principalType: "group",
          principalId: groupId,
          resourceType: "workspace",
          resourceId: workspaceId,
        }),
      ).rejects.toMatchObject({ status: 403 });
    const coordinator = await createCustomRole({
      actorUserId: owner,
      workspaceId,
      displayName: "Member coordinator",
      scopeType: "organization",
      permissions: ["organization.get", "members.create", "members.delete"],
    });
    await assignRole({
      actorUserId: owner,
      workspaceId,
      principalType: "user",
      principalId: manager,
      roleId: coordinator.id,
      scopeType: "organization",
    });
    const admin = (
      await db
        .select()
        .from(roles)
        .where(and(eq(roles.name, "workspace.admin"), eq(roles.isSystem, true)))
    )[0];
    await assignRole({
      actorUserId: owner,
      workspaceId,
      principalType: "user",
      principalId: junior,
      roleId: admin.id,
      scopeType: "workspace",
    });
    await expect(
      removeOrganizationMember({ ...actor(), userId: junior }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("reactivates a member with only the selected project role", async () => {
    await db
      .update(organizationMembers)
      .set({ status: "removed" })
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, junior),
        ),
      );
    await authorization.invalidatePrincipalPermissionCache(junior);
    await addOrganizationMember({
      ...actor(),
      email: `${junior}@example.test`,
      projectRoleId: readerRoleId,
    });
    expect(
      await authorization.hasPermission(
        { principalType: "user", principalId: junior },
        "agents.get",
        "workspace",
        workspaceId,
      ),
    ).toBe(true);
    expect(
      await authorization.hasPermission(
        { principalType: "user", principalId: junior },
        "agents.delete",
        "workspace",
        workspaceId,
      ),
    ).toBe(false);
    await expect(
      addOrganizationMember({ ...actor(), email: `${manager}@example.test` }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("cannot revoke a superior assignment and cannot act after being revoked", async () => {
    const ownerBinding = (
      await db
        .select()
        .from(roleBindings)
        .where(
          and(
            eq(roleBindings.principalId, owner),
            eq(roleBindings.resourceType, "organization"),
            eq(roleBindings.resourceId, organizationId),
          ),
        )
    )[0];
    await expect(
      removeRoleAssignment({ ...actor(), bindingId: ownerBinding.id }),
    ).rejects.toMatchObject({ status: 403 });
    // Prime the ordinary read cache before revocation.
    await authorization.listPermissions(
      { principalType: "user", principalId: manager },
      "workspace",
      workspaceId,
    );
    const binding = (
      await db
        .select()
        .from(roleBindings)
        .where(
          and(
            eq(roleBindings.principalId, manager),
            eq(roleBindings.roleId, managerRoleId),
          ),
        )
    )[0];
    await removeRoleAssignment({
      actorUserId: owner,
      workspaceId,
      bindingId: binding.id,
    });
    await expect(
      createCustomRole({
        ...actor(),
        displayName: "After revocation",
        scopeType: "workspace",
        permissions: ["agents.get"],
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
