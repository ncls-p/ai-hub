import { addOrganizationUser } from "@/modules/organization/add-organization-user";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  teams,
  teamMembers,
  users,
  agents,
  aiProviders,
  aiModels,
  organizationMembers,
  organizations,
  resourceOrganizationShares,
  usageLimits,
  usageLimitCharges,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { createSharingFixture } from "./resource-sharing-db.fixture";
import { distributedResourcePermissions } from "@/modules/iam/resource-availability";
import { setResourceOrganizations } from "@/modules/iam/organization-resource-sharing";
import { listAgents } from "@/modules/agent/use-cases.get-visible-agent-by-id";
import {
  reserveUsageLimits,
  settleUsageLimits,
} from "@/modules/usage/usage-limits";
import {
  createOrganizationOnly,
  listManagedOrganizations,
} from "@/modules/organization/organization-management";
const suite = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;
suite("organization distribution and concurrent usage limits", () => {
  let f: Awaited<ReturnType<typeof createSharingFixture>>;
  let recipient: string;
  beforeAll(async () => {
    f = await createSharingFixture();
    const org = await createOrganizationOnly(
      f.outsider,
      "Empty recipient " + "é".repeat(220),
    );
    recipient = org.id;
  }, 60000);
  afterAll(async () => {
    if (!f) return;
    await db.delete(usageLimits).where(eq(usageLimits.createdById, f.owner));
    await db
      .delete(resourceOrganizationShares)
      .where(eq(resourceOrganizationShares.createdById, f.owner));
    await db.delete(organizations).where(eq(organizations.id, recipient));
    await f.cleanup();
  });
  it("creates an organization without creating a project", async () => {
    expect(
      await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.organizationId, recipient)),
    ).toHaveLength(0);
    expect(await listManagedOrganizations(f.outsider, false)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: recipient,
          projects: [],
          canCreateProject: true,
        }),
      ]),
    );
  });
  it("exposes organization agents in sibling projects, but never grants mutation", async () => {
    const { agent } = await f.makeAgent("Organization assistant");
    await db
      .update(agents)
      .set({ visibility: "organization" })
      .where(eq(agents.id, agent.id));
    expect(
      await distributedResourcePermissions(
        f.member,
        "agent",
        agent.id,
        f.destinationId,
      ),
    ).toContain("agents.chat");
    expect(
      await distributedResourcePermissions(
        f.member,
        "agent",
        agent.id,
        f.destinationId,
      ),
    ).not.toContain("agents.update");
    expect(
      await distributedResourcePermissions(f.outsider, "agent", agent.id),
    ).toEqual([]);
    expect(
      (await listAgents(f.destinationId, f.member, false)).some(
        (row) => row.id === agent.id,
      ),
    ).toBe(true);
  });
  it("allows explicit recipient organizations and revokes immediately", async () => {
    const { agent } = await f.makeAgent("Shared privately");
    const input = {
      actorUserId: f.owner,
      resourceType: "agent" as const,
      resourceId: agent.id,
      includeDependencies: false,
    };
    await setResourceOrganizations({ ...input, organizationIds: [recipient] });
    expect(
      await distributedResourcePermissions(f.outsider, "agent", agent.id),
    ).toContain("agents.chat");
    await db
      .update(organizationMembers)
      .set({ status: "suspended" })
      .where(eq(organizationMembers.userId, f.outsider));
    expect(
      await distributedResourcePermissions(f.outsider, "agent", agent.id),
    ).toEqual([]);
    await db
      .update(organizationMembers)
      .set({ status: "active" })
      .where(eq(organizationMembers.userId, f.outsider));
    await setResourceOrganizations({ ...input, organizationIds: [] });
    expect(
      await distributedResourcePermissions(f.outsider, "agent", agent.id),
    ).toEqual([]);
  });
  it("shares one model without exposing sibling models or provider credentials", async () => {
    const [provider] = await db
      .insert(aiProviders)
      .values({
        workspaceId: f.workspaceId,
        kind: "openai-compatible",
        name: "Shared LLM",
        authType: "bearer",
        createdById: f.owner,
      })
      .returning();
    const models = await db
      .insert(aiModels)
      .values([
        { providerId: provider.id, modelId: "shared" },
        { providerId: provider.id, modelId: "private" },
      ])
      .returning();
    await setResourceOrganizations({
      actorUserId: f.owner,
      resourceType: "model",
      resourceId: models[0].id,
      organizationIds: [recipient],
      includeDependencies: false,
    });
    expect(
      await distributedResourcePermissions(f.outsider, "model", models[0].id),
    ).toContain("models.invoke");
    expect(
      await distributedResourcePermissions(f.outsider, "model", models[1].id),
    ).toEqual([]);
    expect(
      await distributedResourcePermissions(f.outsider, "provider", provider.id),
    ).toEqual(["providers.viewMetadata"]);
    await db.delete(aiModels).where(eq(aiModels.id, models[0].id));
    expect(
      await distributedResourcePermissions(f.outsider, "provider", provider.id),
    ).toEqual([]);
  });
  it("lets an admin add a user to an empty organization without project grants", async () => {
    await expect(
      addOrganizationUser({
        actorUserId: f.member,
        organizationId: recipient,
        email: `${f.member}@example.test`,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await db.update(users).set({ role: "admin" }).where(eq(users.id, f.owner));
    await addOrganizationUser({
      actorUserId: f.owner,
      organizationId: recipient,
      email: `${f.member}@example.test`,
    });
    expect(await listManagedOrganizations(f.member, false)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: recipient, projects: [] }),
      ]),
    );
    await db.update(users).set({ role: "user" }).where(eq(users.id, f.owner));
  });
  it("serializes parallel calls and settles exactly once", async () => {
    const [limit] = await db
      .insert(usageLimits)
      .values({
        subjectType: "user",
        subjectId: f.member,
        period: "month",
        requestLimit: 1,
        tokenLimit: 100,
        createdById: f.owner,
      })
      .returning();
    const context = {
      userId: f.member,
      workspaceId: f.workspaceId,
      providerId: crypto.randomUUID(),
      modelId: null,
    };
    const results = await Promise.allSettled([
      reserveUsageLimits(context, { tokens: 90, costUsd: 0 }),
      reserveUsageLimits(context, { tokens: 90, costUsd: 0 }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const accepted = results.find((result) => result.status === "fulfilled")!;
    if (accepted.status !== "fulfilled") throw new Error("No accepted call");
    await settleUsageLimits(accepted.value, { tokens: 12, costUsd: 0 });
    await settleUsageLimits(accepted.value, { tokens: 99, costUsd: 9 });
    const charges = await db
      .select()
      .from(usageLimitCharges)
      .where(eq(usageLimitCharges.limitId, limit.id));
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({ tokens: 12, status: "settled" });
    await db.delete(usageLimits).where(eq(usageLimits.id, limit.id));
  });
  it("enforces team cost caps and fails closed when pricing is unavailable", async () => {
    const [team] = await db
      .insert(teams)
      .values({
        organizationId: f.organizationId,
        name: "Budget team",
        slug: crypto.randomUUID(),
        createdById: f.owner,
      })
      .returning();
    await db.insert(teamMembers).values({ teamId: team.id, userId: f.member });
    const [limit] = await db
      .insert(usageLimits)
      .values({
        subjectType: "team",
        subjectId: team.id,
        period: "day",
        costLimitUsd: "0.01",
        createdById: f.owner,
      })
      .returning();
    const context = {
      userId: f.member,
      workspaceId: f.workspaceId,
      providerId: crypto.randomUUID(),
      modelId: null,
    };
    await expect(
      reserveUsageLimits(context, { tokens: 1, costUsd: null }),
    ).rejects.toMatchObject({ statusCode: 429 });
    await reserveUsageLimits(context, { tokens: 1, costUsd: 0.01 });
    await expect(
      reserveUsageLimits(context, { tokens: 1, costUsd: 0.001 }),
    ).rejects.toMatchObject({ statusCode: 429 });
    expect(
      await reserveUsageLimits(
        { ...context, userId: f.owner },
        { tokens: 1, costUsd: 0.001 },
      ),
    ).toBeNull();
    await db.delete(usageLimits).where(eq(usageLimits.id, limit.id));
  });
  it("applies organization and model filters cumulatively", async () => {
    const providerId = crypto.randomUUID(),
      modelId = crypto.randomUUID();
    const limits = await db
      .insert(usageLimits)
      .values([
        {
          subjectType: "organization",
          subjectId: f.organizationId,
          period: "day",
          requestLimit: 1,
          providerId,
          createdById: f.owner,
        },
        {
          subjectType: "user",
          subjectId: f.member,
          period: "day",
          tokenLimit: 0,
          modelId,
          createdById: f.owner,
        },
      ])
      .returning();
    const context = {
      userId: f.member,
      workspaceId: f.workspaceId,
      providerId,
      modelId,
    };
    await expect(
      reserveUsageLimits(context, { tokens: 1, costUsd: 0 }),
    ).rejects.toMatchObject({ statusCode: 429 });
    expect(
      await db
        .select()
        .from(usageLimitCharges)
        .where(
          inArray(
            usageLimitCharges.limitId,
            limits.map((row) => row.id),
          ),
        ),
    ).toHaveLength(0);
    expect(
      await reserveUsageLimits(
        { ...context, modelId: null },
        { tokens: 1, costUsd: 0 },
      ),
    ).toBeTypeOf("string");
    await expect(
      reserveUsageLimits(
        { ...context, modelId: null },
        { tokens: 1, costUsd: 0 },
      ),
    ).rejects.toMatchObject({ statusCode: 429 });
  });
});
