import {
  resolveStandardRole,
  standardRoleName,
} from "@/modules/iam/standard-role";
import { requireResourceSharePermissions } from "@/modules/iam/resource-share-permissions";
import { listResourceShareTargets } from "@/modules/iam/resource-sharing";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  organizationMembers,
  organizations,
  roleBindings,
  roles,
  teamMembers,
  teams,
  workspaceMembers,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  AgentAccessError,
  type AccessExecutor,
} from "./access-scope.agent-graph";

export { AgentAccessError } from "./access-scope.agent-graph";

export const AGENT_ACCESS_SCOPES = [
  "private",
  "project",
  "organization",
  "team",
] as const;
export type AgentAccessScope = (typeof AGENT_ACCESS_SCOPES)[number];

export type AgentAccessSelection = {
  scope: AgentAccessScope;
  teamId?: string | null;
};

export type AgentAccessOptions = {
  scopes: AgentAccessScope[];
  teams: Array<{ id: string; name: string }>;
  projectName: string;
  organizationName: string;
};

async function workspaceScope(workspaceId: string) {
  const [scope] = await db
    .select({
      workspaceId: workspaces.id,
      projectName: workspaces.name,
      organizationId: organizations.id,
      organizationName: organizations.name,
    })
    .from(workspaces)
    .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!scope) throw new AgentAccessError("Project not found", 404);
  return scope;
}

export async function getAgentAccessOptions(
  userId: string,
  workspaceId: string,
): Promise<AgentAccessOptions> {
  const scope = await workspaceScope(workspaceId);
  const [canShareProject, canShareOrganization] = await Promise.all([
    authorization.hasPermission(
      { principalType: "user", principalId: userId },
      "roles.assign",
      "workspace",
      workspaceId,
    ),
    authorization.hasPermission(
      { principalType: "user", principalId: userId },
      "roles.assign",
      "organization",
      scope.organizationId,
    ),
  ]);
  const availableScopes: AgentAccessScope[] = ["private"];
  if (canShareProject) availableScopes.push("project", "team");
  if (canShareOrganization) availableScopes.push("organization");
  const teamRows = canShareProject
    ? await db
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(eq(teams.organizationId, scope.organizationId))
        .orderBy(asc(teams.name))
    : [];
  return {
    scopes: availableScopes,
    teams: teamRows,
    projectName: scope.projectName,
    organizationName: scope.organizationName,
  };
}

export async function validateAgentAccessSelection(input: {
  userId: string;
  workspaceId: string;
  selection: AgentAccessSelection;
}) {
  const options = await getAgentAccessOptions(input.userId, input.workspaceId);
  if (!options.scopes.includes(input.selection.scope)) {
    throw new AgentAccessError(
      "You do not have permission to share assistants at this scope",
    );
  }
  if (input.selection.scope !== "team") return;
  if (!input.selection.teamId)
    throw new AgentAccessError("A team is required", 400);
  if (!options.teams.some(({ id }) => id === input.selection.teamId)) {
    throw new AgentAccessError(
      "The selected team is outside this organization",
      400,
    );
  }
}

export async function applyAgentAccessSelection(
  input: {
    agentId: string;
    userId: string;
    selection: AgentAccessSelection;
  },
  executor: AccessExecutor = db,
) {
  const [scope] = await executor
    .select({
      workspaceId: agents.workspaceId,
      organizationId: workspaces.organizationId,
    })
    .from(agents)
    .innerJoin(workspaces, eq(agents.workspaceId, workspaces.id))
    .where(eq(agents.id, input.agentId))
    .limit(1);
  if (!scope) throw new AgentAccessError("Assistant not found", 404);

  const targets = await listResourceShareTargets(
    {
      resourceType: "agent",
      resourceId: input.agentId,
      includeDependencies: true,
    },
    executor,
  );
  if (input.selection.scope !== "private") {
    for (const target of targets)
      await requireResourceSharePermissions({
        actorUserId: input.userId,
        workspaceId: scope.workspaceId,
        resourceType: target.type,
        resourceId: target.id,
      });
  }
  const generatedBindings = await executor
    .select({ principalId: roleBindings.principalId })
    .from(roleBindings)
    .where(
      and(
        eq(roleBindings.principalType, "group"),
        sql`${roleBindings.conditionJson}->>'source' = 'agent_scope'`,
        sql`${roleBindings.conditionJson}->>'rootAgentId' = ${input.agentId}`,
      ),
    );
  await executor
    .delete(roleBindings)
    .where(
      and(
        eq(roleBindings.principalType, "group"),
        sql`${roleBindings.conditionJson}->>'source' = 'agent_scope'`,
        sql`${roleBindings.conditionJson}->>'rootAgentId' = ${input.agentId}`,
      ),
    );

  const affectedUserIds = await applySingleAgentAccessSelection(
    { ...input, workspaceId: scope.workspaceId },
    executor,
  );
  const groupId =
    input.selection.scope === "project"
      ? scope.workspaceId
      : input.selection.scope === "organization"
        ? scope.organizationId
        : input.selection.scope === "team"
          ? input.selection.teamId
          : undefined;

  if (groupId) {
    const roleRows = await executor
      .select()
      .from(roles)
      .where(
        and(
          eq(roles.isSystem, true),
          inArray(roles.name, ["workspace.agent_user", "workspace.viewer"]),
        ),
      );
    const defaultAgentUserRole = roleRows.find(
      ({ name }) => name === "workspace.agent_user",
    );
    const defaultViewerRole = roleRows.find(
      ({ name }) => name === "workspace.viewer",
    );
    const agentUserRole = defaultAgentUserRole
      ? await resolveStandardRole(
          defaultAgentUserRole,
          "workspace",
          scope.workspaceId,
        )
      : undefined;
    const viewerRole = defaultViewerRole
      ? await resolveStandardRole(
          defaultViewerRole,
          "workspace",
          scope.workspaceId,
        )
      : undefined;
    if (!agentUserRole || !viewerRole) {
      throw new AgentAccessError(
        "Assistant dependency roles are unavailable",
        500,
      );
    }
    const generatedTargets = targets.filter(
      ({ type, id }) =>
        input.selection.scope !== "team" ||
        type !== "agent" ||
        id !== input.agentId,
    );
    if (generatedTargets.length > 0) {
      await executor
        .insert(roleBindings)
        .values(
          generatedTargets.map((target) => ({
            principalType: "group" as const,
            principalId: groupId,
            roleId: target.type === "agent" ? agentUserRole.id : viewerRole.id,
            resourceType: target.type,
            resourceId: target.id,
            conditionJson: {
              source: "agent_scope",
              rootAgentId: input.agentId,
            },
            createdById: input.userId,
          })),
        )
        .onConflictDoNothing();
    }
  }

  const affectsWholeScope = [scope.workspaceId, scope.organizationId].some(
    (scopeId) =>
      groupId === scopeId ||
      generatedBindings.some(({ principalId }) => principalId === scopeId),
  );
  if (affectsWholeScope) {
    const [organizationUsers, workspaceUsers] = await Promise.all([
      executor
        .select({ userId: organizationMembers.userId })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, scope.organizationId),
            eq(organizationMembers.status, "active"),
          ),
        ),
      executor
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, scope.workspaceId),
            eq(workspaceMembers.status, "active"),
          ),
        ),
    ]);
    affectedUserIds.push(
      ...organizationUsers.map(({ userId }) => userId),
      ...workspaceUsers.map(({ userId }) => userId),
    );
  }
  return [...new Set(affectedUserIds)];
}

async function applySingleAgentAccessSelection(
  input: {
    workspaceId: string;
    agentId: string;
    userId: string;
    selection: AgentAccessSelection;
  },
  executor: AccessExecutor,
) {
  const [defaultUseRole] = await executor
    .select()
    .from(roles)
    .where(
      and(
        eq(roles.name, "workspace.agent_user"),
        eq(roles.scopeType, "workspace"),
        eq(roles.isSystem, true),
      ),
    )
    .limit(1);
  const useRole = defaultUseRole
    ? await resolveStandardRole(defaultUseRole, "workspace", input.workspaceId)
    : undefined;
  if (!useRole)
    throw new AgentAccessError("Assistant access role is unavailable", 500);

  const previousTeams = await executor
    .select({ teamId: roleBindings.principalId })
    .from(roleBindings)
    .where(
      and(
        eq(roleBindings.resourceType, "agent"),
        eq(roleBindings.resourceId, input.agentId),
        eq(roleBindings.roleId, useRole.id),
        eq(roleBindings.principalType, "group"),
      ),
    );
  const affectedTeamIds = [
    ...new Set([
      ...previousTeams.map(({ teamId }) => teamId),
      ...(input.selection.scope === "team" && input.selection.teamId
        ? [input.selection.teamId]
        : []),
    ]),
  ];
  const affectedUsers =
    affectedTeamIds.length > 0
      ? await executor
          .select({ userId: teamMembers.userId })
          .from(teamMembers)
          .where(inArray(teamMembers.teamId, affectedTeamIds))
      : [];

  await executor
    .delete(roleBindings)
    .where(
      and(
        eq(roleBindings.resourceType, "agent"),
        eq(roleBindings.resourceId, input.agentId),
        eq(roleBindings.roleId, useRole.id),
      ),
    );

  const visibility =
    input.selection.scope === "project"
      ? "workspace"
      : input.selection.scope === "organization"
        ? "organization"
        : "private";
  await executor
    .update(agents)
    .set({
      visibility,
      isGlobal:
        input.selection.scope === "project" ||
        input.selection.scope === "organization",
      sharingMode: "personal",
      shareTargetUserId: null,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, input.agentId));

  if (input.selection.scope === "team" && input.selection.teamId) {
    await executor.insert(roleBindings).values({
      principalType: "group",
      principalId: input.selection.teamId,
      roleId: useRole.id,
      resourceType: "agent",
      resourceId: input.agentId,
      createdById: input.userId,
    });
  }

  return [...new Set(affectedUsers.map(({ userId }) => userId))];
}

export async function invalidateAgentAccessCache(
  agentId: string,
  userIds: string[],
) {
  const targets = await listResourceShareTargets({
    resourceType: "agent",
    resourceId: agentId,
    includeDependencies: true,
  });
  await Promise.all(
    targets.flatMap((target) =>
      userIds.map((userId) =>
        authorization.invalidatePermissionCache(userId, target.type, target.id),
      ),
    ),
  );
}

export async function getAgentAccessSelection(
  agent: typeof agents.$inferSelect,
): Promise<AgentAccessSelection> {
  const [binding] = await db
    .select({ teamId: roleBindings.principalId })
    .from(roleBindings)
    .innerJoin(teams, eq(teams.id, roleBindings.principalId))
    .innerJoin(roles, eq(roleBindings.roleId, roles.id))
    .where(
      and(
        eq(roleBindings.resourceType, "agent"),
        eq(roleBindings.resourceId, agent.id),
        eq(roleBindings.principalType, "group"),
        inArray(roles.name, [
          "workspace.agent_user",
          standardRoleName("workspace.agent_user"),
        ]),
        eq(roles.scopeType, "workspace"),
      ),
    )
    .limit(1);
  if (binding) return { scope: "team", teamId: binding.teamId };
  if (agent.visibility === "organization") return { scope: "organization" };
  if (agent.visibility === "workspace" || agent.isGlobal)
    return { scope: "project" };
  return { scope: "private" };
}
