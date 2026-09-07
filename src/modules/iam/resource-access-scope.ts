import { resolveStandardRole, standardRoleName } from "./standard-role";
import { findAccessResource } from "@/server/infrastructure/db/access-resource-repository";
import { requireResourceSharePermissions } from "./resource-share-permissions";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  knowledgeBases,
  mcpServers,
  roleBindings,
  roles,
  teamMembers,
} from "@/server/infrastructure/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  getAgentAccessOptions,
  validateAgentAccessSelection,
  type AgentAccessOptions,
  type AgentAccessScope,
  type AgentAccessSelection,
} from "@/modules/agent/access-scope";

export type ResourceAccessScope = AgentAccessScope;
export type ResourceAccessOptions = AgentAccessOptions;
export type ResourceAccessSelection = AgentAccessSelection;
export type ScopedResourceType = "knowledge_base" | "mcp_server";

export const getResourceAccessOptions = getAgentAccessOptions;
export const validateResourceAccessSelection = validateAgentAccessSelection;

export async function getResourceAccessSelection(input: {
  resourceType: ScopedResourceType;
  resourceId: string;
  visibility?: string | null;
  isGlobal?: boolean;
}): Promise<ResourceAccessSelection> {
  const [binding] = await db
    .select({ teamId: roleBindings.principalId })
    .from(roleBindings)
    .innerJoin(roles, eq(roleBindings.roleId, roles.id))
    .where(
      and(
        eq(roleBindings.resourceType, input.resourceType),
        eq(roleBindings.resourceId, input.resourceId),
        eq(roleBindings.principalType, "group"),
        inArray(roles.name, [
          "workspace.viewer",
          standardRoleName("workspace.viewer"),
        ]),
        eq(roles.scopeType, "workspace"),
      ),
    )
    .limit(1);
  if (binding) return { scope: "team", teamId: binding.teamId };
  if (input.visibility === "organization") return { scope: "organization" };
  if (input.visibility === "workspace" || input.isGlobal)
    return { scope: "project" };
  return { scope: "private" };
}

export async function applyResourceAccessSelection(input: {
  resourceType: ScopedResourceType;
  resourceId: string;
  userId: string;
  selection: ResourceAccessSelection;
}) {
  if (input.selection.scope !== "private")
    await requireResourceSharePermissions({
      ...input,
      actorUserId: input.userId,
    });
  const [defaultViewerRole] = await db
    .select()
    .from(roles)
    .where(
      and(
        eq(roles.name, "workspace.viewer"),
        eq(roles.scopeType, "workspace"),
        eq(roles.isSystem, true),
      ),
    )
    .limit(1);
  const resource = await findAccessResource(
    input.resourceType,
    input.resourceId,
  );
  const viewerRole =
    defaultViewerRole && resource
      ? await resolveStandardRole(
          defaultViewerRole,
          "workspace",
          resource.workspaceId,
        )
      : undefined;
  if (!viewerRole) throw new Error("Resource access role is unavailable");

  const previousTeams = await db
    .select({ teamId: roleBindings.principalId })
    .from(roleBindings)
    .where(
      and(
        eq(roleBindings.resourceType, input.resourceType),
        eq(roleBindings.resourceId, input.resourceId),
        eq(roleBindings.roleId, viewerRole.id),
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
      ? await db
          .select({ userId: teamMembers.userId })
          .from(teamMembers)
          .where(inArray(teamMembers.teamId, affectedTeamIds))
      : [];

  await db
    .delete(roleBindings)
    .where(
      and(
        eq(roleBindings.resourceType, input.resourceType),
        eq(roleBindings.resourceId, input.resourceId),
        eq(roleBindings.roleId, viewerRole.id),
        eq(roleBindings.principalType, "group"),
      ),
    );

  const isGlobal =
    input.selection.scope === "project" ||
    input.selection.scope === "organization";
  const visibility =
    input.selection.scope === "project"
      ? "workspace"
      : input.selection.scope === "organization"
        ? "organization"
        : "private";
  const table =
    input.resourceType === "knowledge_base" ? knowledgeBases : mcpServers;
  await db
    .update(table)
    .set({ isGlobal, visibility, updatedAt: new Date() })
    .where(eq(table.id, input.resourceId));

  if (input.selection.scope === "team" && input.selection.teamId) {
    await db.insert(roleBindings).values({
      principalType: "group",
      principalId: input.selection.teamId,
      roleId: viewerRole.id,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      createdById: input.userId,
    });
  }

  await Promise.all(
    [...new Set(affectedUsers.map(({ userId }) => userId))].map((userId) =>
      authorization.invalidatePermissionCache(
        userId,
        input.resourceType,
        input.resourceId,
      ),
    ),
  );
}
