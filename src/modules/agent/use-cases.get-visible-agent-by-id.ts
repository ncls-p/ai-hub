import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  userAgentPreferences,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { AgentDefaultPreferences, AgentRow } from "./use-cases.agent-row";
import { getAgentById } from "./use-cases.create-agent";

export async function getVisibleAgentById(
  agentId: string,
  workspaceId: string,
  userId: string,
  canAdminCurate: boolean,
) {
  // Admin curation does not grant access to another user's personal agents.
  void canAdminCurate;
  const agent = await getAgentById(agentId, workspaceId);
  if (!agent) return null;
  if (canUseAgent(agent, userId)) return agent;
  if (
    await authorization.hasDirectPermission(
      { principalType: "user", principalId: userId },
      "agents.get",
      "agent",
      agent.id,
      workspaceId,
    )
  ) {
    return agent;
  }
  return null;
}

export async function listAgents(
  workspaceId: string,
  userId: string,
  canAdminCurate: boolean,
) {
  // Keep user-facing lists scoped to agents the current user can actually use.
  void canAdminCurate;
  const rows = await db
    .select()
    .from(agents)
    .where(and(eq(agents.workspaceId, workspaceId), isNull(agents.archivedAt)))
    .orderBy(
      sql`${agents.isGlobal} DESC`,
      sql`${agents.organizationDisplayOrder} ASC`,
      sql`${agents.isRecommended} DESC`,
      sql`${agents.updatedAt} DESC`,
    );
  const directlyVisibleIds =
    await authorization.listDirectlyAuthorizedResourceIds(
      { principalType: "user", principalId: userId },
      "agents.get",
      "agent",
      rows.map(({ id }) => id),
      workspaceId,
    );
  return rows.filter(
    (agent) => canUseAgent(agent, userId) || directlyVisibleIds.has(agent.id),
  );
}

export function canUseAgent(agent: AgentRow, userId: string) {
  return (
    agent.createdById === userId ||
    agent.isGlobal ||
    agent.sharingMode === "marketplace" ||
    (agent.sharingMode === "specific_user" &&
      agent.shareTargetUserId === userId)
  );
}

export function canEditAgent(
  agent: AgentRow,
  userId: string,
  canAdminCurate = false,
) {
  return agent.createdById === userId || (agent.isGlobal && canAdminCurate);
}

export async function canEditAgentForScope(
  agent: AgentRow,
  userId: string,
  canAdminCurate = false,
) {
  if (agent.createdById === userId) return true;
  if (agent.visibility === "workspace") {
    return authorization.hasPermission(
      { principalType: "user", principalId: userId },
      "agents.manage",
      "workspace",
      agent.workspaceId,
    );
  }
  if (agent.visibility === "organization") {
    const [workspace] = await db
      .select({ organizationId: workspaces.organizationId })
      .from(workspaces)
      .where(eq(workspaces.id, agent.workspaceId))
      .limit(1);
    return Boolean(
      workspace &&
      (await authorization.hasPermission(
        { principalType: "user", principalId: userId },
        "agents.manage",
        "organization",
        workspace.organizationId,
      )),
    );
  }
  return agent.isGlobal && canAdminCurate;
}

export async function getAgentDefaultPreferences(
  workspaceId: string,
  userId: string,
  availableAgentIds?: Set<string>,
): Promise<AgentDefaultPreferences> {
  const [organizationDefault] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(
      and(
        eq(agents.workspaceId, workspaceId),
        eq(agents.isOrganizationDefault, true),
        isNull(agents.archivedAt),
      ),
    )
    .limit(1);
  const [userPreference] = await db
    .select({
      defaultAgentId: userAgentPreferences.defaultAgentId,
      hiddenAgentIdsJson: userAgentPreferences.hiddenAgentIdsJson,
    })
    .from(userAgentPreferences)
    .where(
      and(
        eq(userAgentPreferences.workspaceId, workspaceId),
        eq(userAgentPreferences.userId, userId),
      ),
    )
    .limit(1);

  const organizationDefaultAgentId = organizationDefault?.id ?? null;
  const userDefaultAgentId = userPreference?.defaultAgentId ?? null;
  const usableOrganizationDefault =
    organizationDefaultAgentId &&
    (!availableAgentIds || availableAgentIds.has(organizationDefaultAgentId))
      ? organizationDefaultAgentId
      : null;
  const usableUserDefault =
    userDefaultAgentId &&
    (!availableAgentIds || availableAgentIds.has(userDefaultAgentId))
      ? userDefaultAgentId
      : null;

  return {
    organizationDefaultAgentId: usableOrganizationDefault,
    userDefaultAgentId: usableUserDefault,
    effectiveDefaultAgentId: usableUserDefault ?? usableOrganizationDefault,
    hiddenAgentIds: (userPreference?.hiddenAgentIdsJson ?? []).filter(
      (id) => !availableAgentIds || availableAgentIds.has(id),
    ),
  };
}

export async function setAgentHiddenInChat(input: {
  workspaceId: string;
  userId: string;
  agentId: string;
  hidden: boolean;
  canAdminCurate?: boolean;
}) {
  const agent = await getVisibleAgentById(
    input.agentId,
    input.workspaceId,
    input.userId,
    Boolean(input.canAdminCurate),
  );
  if (!agent) throw new Error("Agent not found");

  const [preference] = await db
    .select({ hiddenAgentIdsJson: userAgentPreferences.hiddenAgentIdsJson })
    .from(userAgentPreferences)
    .where(
      and(
        eq(userAgentPreferences.workspaceId, input.workspaceId),
        eq(userAgentPreferences.userId, input.userId),
      ),
    )
    .limit(1);
  const hiddenIds = new Set(preference?.hiddenAgentIdsJson ?? []);
  if (input.hidden) hiddenIds.add(input.agentId);
  else hiddenIds.delete(input.agentId);

  await db
    .insert(userAgentPreferences)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      hiddenAgentIdsJson: [...hiddenIds],
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userAgentPreferences.workspaceId, userAgentPreferences.userId],
      set: { hiddenAgentIdsJson: [...hiddenIds], updatedAt: new Date() },
    });

  return getAgentDefaultPreferences(input.workspaceId, input.userId);
}

export async function setUserDefaultAgent(input: {
  workspaceId: string;
  userId: string;
  agentId: string | null;
  canAdminCurate?: boolean;
}) {
  if (!input.agentId) {
    await db
      .insert(userAgentPreferences)
      .values({
        workspaceId: input.workspaceId,
        userId: input.userId,
        defaultAgentId: null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userAgentPreferences.workspaceId, userAgentPreferences.userId],
        set: { defaultAgentId: null, updatedAt: new Date() },
      });
    return getAgentDefaultPreferences(input.workspaceId, input.userId);
  }

  const agent = await getVisibleAgentById(
    input.agentId,
    input.workspaceId,
    input.userId,
    Boolean(input.canAdminCurate),
  );
  if (!agent) throw new Error("Agent not found");

  await db
    .insert(userAgentPreferences)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      defaultAgentId: input.agentId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userAgentPreferences.workspaceId, userAgentPreferences.userId],
      set: { defaultAgentId: input.agentId, updatedAt: new Date() },
    });

  return getAgentDefaultPreferences(input.workspaceId, input.userId);
}

export async function setOrganizationDefaultAgent(input: {
  workspaceId: string;
  userId: string;
  agentId: string | null;
}) {
  if (input.agentId) {
    const [agent] = await db
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.id, input.agentId),
          eq(agents.workspaceId, input.workspaceId),
          isNull(agents.archivedAt),
        ),
      )
      .limit(1);
    if (!agent) {
      throw new Error("Organization assistant not found");
    }
    const canBeOrganizationDefault = agent.isGlobal || agent.isRecommended;
    if (!canBeOrganizationDefault) {
      throw new Error("Organization assistant not found");
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(agents)
      .set({ isOrganizationDefault: false, updatedAt: new Date() })
      .where(eq(agents.workspaceId, input.workspaceId));
    if (input.agentId) {
      await tx
        .update(agents)
        .set({ isOrganizationDefault: true, updatedAt: new Date() })
        .where(eq(agents.id, input.agentId));
    }
  });

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "agent.organization_default.updated",
    resourceType: "agent",
    resourceId: input.agentId ?? input.workspaceId,
    outcome: "success",
    metadata: { agentId: input.agentId },
  });

  return getAgentDefaultPreferences(input.workspaceId, input.userId);
}
