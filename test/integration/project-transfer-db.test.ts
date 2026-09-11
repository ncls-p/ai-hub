import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  organizations,
  organizationMembers,
  workspaces,
  teams,
  teamMembers,
  roles,
  roleBindings,
  agents,
} from "@/server/infrastructure/db/schema";
import { createSharingFixture } from "./resource-sharing-db.fixture";
import { prepareProjectTransfer } from "./project-transfer-db.fixture";
import { authorization } from "@/server/domain/services/authorization";
import {
  listProjectTransferDestinations,
  previewProjectTransfer,
} from "@/modules/iam/project-transfer.preview";
import { executeProjectTransfer } from "@/modules/iam/project-transfer.execute";
const suite = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;
suite("whole project transfer permissions and transaction", () => {
  let f: Awaited<ReturnType<typeof createSharingFixture>>;
  let target: string;
  let agentId: string;
  let teamId: string;
  let roleId: string;
  const input = () => ({
    actorUserId: f.owner,
    sourceWorkspaceId: f.workspaceId,
    targetOrganizationId: target,
  });
  beforeAll(async () => {
    f = await createSharingFixture();
    ({ target, agentId, teamId, roleId } = await prepareProjectTransfer(f));
  }, 60000);
  afterAll(async () => {
    if (!f) return;
    await db
      .delete(roles)
      .where(
        and(
          eq(roles.ownerResourceId, f.workspaceId),
          eq(roles.isSystem, false),
        ),
      );
    await db.delete(organizations).where(eq(organizations.id, target));
    await f.cleanup();
  });
  it("requires source and destination administration and rejects stale previews", async () => {
    const destinations = await listProjectTransferDestinations({
      actorUserId: f.owner,
      sourceWorkspaceId: f.workspaceId,
    });
    expect(destinations.some((o) => o.id === target)).toBe(true);
    await expect(
      previewProjectTransfer({ ...input(), actorUserId: f.member }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      previewProjectTransfer({ ...input(), actorUserId: f.outsider }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      previewProjectTransfer({
        ...input(),
        targetOrganizationId: f.organizationId,
      }),
    ).rejects.toMatchObject({ status: 400 });
    const preview = await previewProjectTransfer(input());
    expect(
      preview.conflictResolutions.map((r) => [r.resourceType, r.to]),
    ).toEqual(
      expect.arrayContaining([
        ["project", "source-2"],
        ["team", "reviewers-2"],
        ["role", "project-reviewer-2"],
      ]),
    );
    await db
      .update(workspaces)
      .set({ name: "Updated project" })
      .where(eq(workspaces.id, f.workspaceId));
    await expect(
      executeProjectTransfer({
        ...input(),
        confirmationToken: preview.confirmationToken,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await db
          .select()
          .from(workspaces)
          .where(eq(workspaces.id, f.workspaceId))
      )[0].organizationId,
    ).toBe(f.organizationId);
  });
  it("never reactivates a suspended destination member as a side effect", async () => {
    await db.insert(organizationMembers).values({
      organizationId: target,
      userId: f.member,
      status: "suspended",
    });
    await expect(previewProjectTransfer(input())).rejects.toMatchObject({
      status: 409,
    });
    await db
      .delete(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, target),
          eq(organizationMembers.userId, f.member),
        ),
      );
  });
  it("preserves direct grants, clones only linked teams and roles, and revokes source inherited access immediately", async () => {
    const principal = {
      principalType: "user" as const,
      principalId: f.outsider,
    };
    expect(
      (
        await authorization.checkPermission(
          principal,
          "agents.get",
          "agent",
          agentId,
        )
      ).granted,
    ).toBe(true);
    const preview = await previewProjectTransfer(input());
    expect(preview.counts).toMatchObject({ projects: 1, teams: 1, roles: 1 });
    await executeProjectTransfer({
      ...input(),
      confirmationToken: preview.confirmationToken,
    });
    const [project] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, f.workspaceId));
    expect(project).toMatchObject({
      organizationId: target,
      slug: "source-2",
      name: "Updated project",
    });
    expect(
      (await db.select().from(agents).where(eq(agents.id, agentId)))[0]
        .workspaceId,
    ).toBe(f.workspaceId);
    const [copy] = await db
      .select()
      .from(teams)
      .where(
        and(eq(teams.organizationId, target), eq(teams.slug, "reviewers-2")),
      );
    expect(
      (
        await db
          .select()
          .from(teamMembers)
          .where(eq(teamMembers.teamId, copy.id))
      ).map((m) => m.userId),
    ).toEqual([f.member]);
    expect(
      (await db.select().from(teams).where(eq(teams.id, teamId)))[0]
        .organizationId,
    ).toBe(f.organizationId);
    expect(
      (await db.select().from(roles).where(eq(roles.id, roleId)))[0]
        .ownerResourceId,
    ).toBe(f.organizationId);
    const [copiedRole] = await db
      .select()
      .from(roles)
      .where(
        and(
          eq(roles.ownerResourceId, f.workspaceId),
          eq(roles.name, "project-reviewer-2"),
        ),
      );
    expect(copiedRole.permissionsJson).toEqual([
      "workspaces.get",
      "agents.list",
      "agents.get",
    ]);
    expect(
      await db
        .select()
        .from(roleBindings)
        .where(
          and(
            eq(roleBindings.principalId, copy.id),
            eq(roleBindings.roleId, copiedRole.id),
            eq(roleBindings.resourceId, f.workspaceId),
          ),
        ),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(roleBindings)
        .where(
          and(
            eq(roleBindings.principalId, target),
            eq(roleBindings.resourceId, agentId),
          ),
        ),
    ).toHaveLength(1);
    expect(
      (
        await authorization.checkPermission(
          principal,
          "agents.get",
          "agent",
          agentId,
        )
      ).granted,
    ).toBe(false);
    expect(
      (
        await authorization.checkPermission(
          { principalType: "user", principalId: f.member },
          "agents.get",
          "agent",
          agentId,
        )
      ).granted,
    ).toBe(true);
    expect(
      await db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, f.organizationId),
            inArray(organizationMembers.userId, [f.owner, f.member]),
          ),
        ),
    ).toHaveLength(2);
  });
});
