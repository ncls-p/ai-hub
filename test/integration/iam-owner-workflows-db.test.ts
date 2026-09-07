import { createMemberAccount } from "@/modules/iam/use-cases.create-member-account";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/infrastructure/db";
import {
  auditEvents,
  organizations,
  roleBindings,
  roles,
  users,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { authorization } from "@/server/domain/services/authorization";
import {
  addOrganizationMember,
  addTeamMember,
  assignRole,
  createOrganizationWithProject,
  createTeam,
  getAccessConsoleSnapshot,
  removeRoleAssignment,
  updateCustomRole,
} from "@/modules/iam/use-cases";
import { updateTeam } from "@/modules/iam/use-cases.update-team";
import { standardRoleName } from "@/modules/iam/standard-role";
const suite = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;
suite("owner account and role workflows", () => {
  const owner = randomUUID(),
    member = randomUUID(),
    other = randomUUID();
  const ids: string[] = [owner, member, other];
  let workspaceId = "",
    organizationId = "",
    otherWorkspace = "",
    otherOrg = "";
  let viewer: typeof roles.$inferSelect, ownerRole: typeof roles.$inferSelect;
  const actor = () => ({ actorUserId: owner, workspaceId });
  beforeAll(async () => {
    await db.insert(users).values(
      ids.map((id) => ({
        id,
        name: "Owner workflow",
        email: `${id}@example.test`,
        emailVerified: true,
        banned: false,
      })),
    );
    workspaceId = (
      await createOrganizationWithProject({
        userId: owner,
        organizationName: `Owner ${owner}`,
        projectName: "Main",
      })
    ).id;
    otherWorkspace = (
      await createOrganizationWithProject({
        userId: other,
        organizationName: `Other ${other}`,
        projectName: "Other",
      })
    ).id;
    organizationId = (
      await db.select().from(workspaces).where(eq(workspaces.id, workspaceId))
    )[0].organizationId;
    otherOrg = (
      await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, otherWorkspace))
    )[0].organizationId;
    viewer = (
      await db
        .select()
        .from(roles)
        .where(
          and(eq(roles.name, "workspace.viewer"), eq(roles.isSystem, true)),
        )
    )[0];
    ownerRole = (
      await db
        .select()
        .from(roles)
        .where(
          and(eq(roles.name, "organization.owner"), eq(roles.isSystem, true)),
        )
    )[0];
    await addOrganizationMember({
      ...actor(),
      email: `${member}@example.test`,
      projectRoleId: viewer.id,
    });
  });
  afterAll(async () => {
    await db
      .delete(auditEvents)
      .where(inArray(auditEvents.organizationId, [organizationId, otherOrg]));
    await db.delete(roleBindings).where(inArray(roleBindings.createdById, ids));
    await db
      .delete(roles)
      .where(and(eq(roles.isSystem, false), inArray(roles.createdById, ids)));
    await db
      .delete(organizations)
      .where(inArray(organizations.id, [organizationId, otherOrg]));
    await db
      .update(roles)
      .set({ createdById: null })
      .where(inArray(roles.createdById, ids));
    await db.delete(users).where(inArray(users.id, ids));
  });
  it("lets an owner manage a team containing themselves and rename it without losing members", async () => {
    const team = await createTeam({ ...actor(), name: "Owner team" });
    await addTeamMember({ ...actor(), teamId: team.id, userId: owner });
    await assignRole({
      ...actor(),
      principalType: "group",
      principalId: team.id,
      roleId: viewer.id,
      scopeType: "workspace",
    });
    await addTeamMember({ ...actor(), teamId: team.id, userId: member });
    const renamed = await updateTeam({
      ...actor(),
      teamId: team.id,
      name: "Operations",
      description: "Everyone",
      expectedUpdatedAt: team.updatedAt.toISOString(),
    });
    expect(renamed.name).toBe("Operations");
    const snapshot = await getAccessConsoleSnapshot({
      userId: owner,
      workspaceId,
    });
    expect(
      snapshot.teams.find(({ id }) => id === team.id)?.members,
    ).toHaveLength(2);
    await expect(
      updateTeam({
        ...actor(),
        teamId: team.id,
        name: "Stale",
        expectedUpdatedAt: team.updatedAt.toISOString(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      updateTeam({
        actorUserId: other,
        workspaceId: otherWorkspace,
        teamId: team.id,
        name: "Foreign",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("edits a standard role in place for existing and future recipients without changing other tenants", async () => {
    const edited = await updateCustomRole({
      ...actor(),
      roleId: viewer.id,
      displayName: "Read assistants",
      permissions: ["workspaces.get", "agents.get"],
      expectedUpdatedAt: viewer.updatedAt.toISOString(),
    });
    expect(edited.name).toBe(standardRoleName(viewer.name));
    expect(
      await authorization.hasPermission(
        { principalType: "user", principalId: member },
        "usage.view",
        "workspace",
        workspaceId,
      ),
    ).toBe(false);
    const snapshot = await getAccessConsoleSnapshot({
      userId: owner,
      workspaceId,
    });
    expect(snapshot.roles.some(({ id }) => id === viewer.id)).toBe(false);
    expect(
      snapshot.assignments.some(
        (row) => row.principalId === member && row.roleId === edited.id,
      ),
    ).toBe(true);
    const otherSnapshot = await getAccessConsoleSnapshot({
      userId: other,
      workspaceId: otherWorkspace,
    });
    expect(otherSnapshot.roles.some(({ id }) => id === viewer.id)).toBe(true);
    expect(otherSnapshot.roles.some(({ id }) => id === edited.id)).toBe(false);
    await assignRole({
      ...actor(),
      principalType: "user",
      principalId: owner,
      roleId: viewer.id,
      scopeType: "workspace",
      replaceExisting: true,
    });
    expect(
      (
        await db
          .select()
          .from(roleBindings)
          .where(
            and(
              eq(roleBindings.principalId, owner),
              eq(roleBindings.resourceId, workspaceId),
            ),
          )
      )[0].roleId,
    ).toBe(edited.id);
    await updateCustomRole({
      ...actor(),
      roleId: edited.id,
      displayName: "Readers",
      permissions: ["workspaces.get"],
    });
    await expect(
      updateCustomRole({
        ...actor(),
        roleId: viewer.id,
        displayName: "Stale",
        permissions: ["workspaces.get"],
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("allows a tenant owner without platform admin access to create only a standard account", async () => {
    const email = `${randomUUID()}@example.test`;
    await expect(
      createMemberAccount({
        actorUserId: member,
        workspaceId,
        name: "Rejected",
        email,
        password: "Password123!",
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      await db.select().from(users).where(eq(users.email, email)),
    ).toHaveLength(0);
    const created = await createMemberAccount({
      ...actor(),
      name: "New colleague",
      email,
      password: "Password123!",
      projectRoleId: viewer.id,
    });
    ids.push(created.id);
    const account = (
      await db.select().from(users).where(eq(users.id, created.id))
    )[0];
    expect(account.role).toBe("user");
    await addOrganizationMember({
      ...actor(),
      email,
      projectRoleId: viewer.id,
    });
    expect(
      await authorization.hasPermission(
        { principalType: "user", principalId: created.id },
        "usage.view",
        "workspace",
        workspaceId,
      ),
    ).toBe(false);
  });
  it("protects the final active owner, including when another ownership has expired", async () => {
    await db.insert(roleBindings).values({
      principalType: "user",
      principalId: member,
      roleId: ownerRole.id,
      resourceType: "organization",
      resourceId: organizationId,
      expiresAt: new Date(Date.now() - 1000),
      createdById: owner,
    });
    const binding = (
      await db
        .select()
        .from(roleBindings)
        .where(
          and(
            eq(roleBindings.principalId, owner),
            eq(roleBindings.roleId, ownerRole.id),
            eq(roleBindings.resourceId, organizationId),
          ),
        )
    )[0];
    await expect(
      removeRoleAssignment({ ...actor(), bindingId: binding.id }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      updateCustomRole({
        ...actor(),
        roleId: ownerRole.id,
        displayName: "Owner",
        permissions: ["organization.get"],
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
