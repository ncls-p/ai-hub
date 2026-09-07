import { and, eq, inArray } from "drizzle-orm";

import type { AccessResourceType } from "@/server/domain/entities/access-resource";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { findAccessResource } from "@/server/infrastructure/db/access-resource-repository";
import {
  agentSkills,
  agentVersions,
  agents,
  aiModels,
  aiProviders,
  conversations,
  customTools,
  knowledgeBases,
  marketplaceItems,
  mcpServers,
  organizationMembers,
  roleBindings,
  scheduledTasks,
  teamMembers,
  toolConnections,
  toolConnectors,
  workflows,
} from "@/server/infrastructure/db/schema";

import { IamOperationError } from "./use-cases";

async function requireResourceDeletionPermission(
  userId: string,
  workspaceId: string,
) {
  const permission = await authorization.checkPermission(
    { principalType: "user", principalId: userId },
    "workspaces.delete",
    "workspace",
    workspaceId,
  );
  if (!permission.granted) {
    throw new IamOperationError(
      "You do not have permission to delete project resources",
      403,
    );
  }
}

async function affectedUsers(
  organizationId: string,
  resourceType: AccessResourceType,
  resourceId: string,
) {
  const [members, principals] = await Promise.all([
    db
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, organizationId)),
    db
      .select({
        principalType: roleBindings.principalType,
        principalId: roleBindings.principalId,
      })
      .from(roleBindings)
      .where(
        and(
          eq(roleBindings.resourceType, resourceType),
          eq(roleBindings.resourceId, resourceId),
        ),
      ),
  ]);
  const teamIds = principals
    .filter(({ principalType }) => principalType === "group")
    .map(({ principalId }) => principalId);
  const teamUsers =
    teamIds.length > 0
      ? await db
          .select({ userId: teamMembers.userId })
          .from(teamMembers)
          .where(inArray(teamMembers.teamId, teamIds))
      : [];

  return new Set([
    ...members.map(({ userId }) => userId),
    ...principals
      .filter(({ principalType }) => principalType === "user")
      .map(({ principalId }) => principalId),
    ...teamUsers.map(({ userId }) => userId),
  ]);
}

export async function deleteProjectAccessResource(input: {
  actorUserId: string;
  workspaceId: string;
  resourceType: AccessResourceType;
  resourceId: string;
}) {
  await requireResourceDeletionPermission(input.actorUserId, input.workspaceId);
  const resource = await findAccessResource(
    input.resourceType,
    input.resourceId,
  );
  if (!resource || resource.workspaceId !== input.workspaceId) {
    throw new IamOperationError("Resource not found in this project", 404);
  }

  if (input.resourceType === "model") {
    const [consumer] = await db
      .select({ id: agentVersions.id })
      .from(agentVersions)
      .where(eq(agentVersions.modelId, input.resourceId))
      .limit(1);
    if (consumer) {
      throw new IamOperationError(
        "Move or delete assistants using this model before deleting it",
        409,
      );
    }
  }

  const now = new Date();
  const usersToInvalidate = await affectedUsers(
    resource.organizationId,
    input.resourceType,
    input.resourceId,
  );

  await db.transaction(async (tx) => {
    await tx
      .delete(roleBindings)
      .where(
        and(
          eq(roleBindings.resourceType, input.resourceType),
          eq(roleBindings.resourceId, input.resourceId),
        ),
      );

    switch (input.resourceType) {
      case "agent":
        await tx
          .update(agents)
          .set({ archivedAt: now, updatedAt: now })
          .where(eq(agents.id, input.resourceId));
        break;
      case "provider":
        await tx
          .update(aiProviders)
          .set({ archivedAt: now, updatedAt: now, enabled: false })
          .where(eq(aiProviders.id, input.resourceId));
        break;
      case "model":
        await tx.delete(aiModels).where(eq(aiModels.id, input.resourceId));
        break;
      case "mcp_server": {
        const connectorRows = await tx
          .select({ id: toolConnectors.id })
          .from(toolConnectors)
          .where(eq(toolConnectors.mcpServerId, input.resourceId));
        const connectorIds = connectorRows.map(({ id }) => id);
        await tx
          .update(mcpServers)
          .set({
            archivedAt: now,
            updatedAt: now,
            enabled: false,
            encryptedHeadersJson: null,
            encryptedEnvJson: null,
          })
          .where(eq(mcpServers.id, input.resourceId));
        if (connectorIds.length > 0) {
          await tx
            .update(toolConnectors)
            .set({ archivedAt: now, updatedAt: now, enabled: false })
            .where(inArray(toolConnectors.id, connectorIds));
          await tx
            .update(toolConnections)
            .set({
              archivedAt: now,
              updatedAt: now,
              status: "disabled",
              isDefault: false,
            })
            .where(inArray(toolConnections.connectorId, connectorIds));
        }
        break;
      }
      case "tool_connector":
        await tx
          .update(toolConnectors)
          .set({ archivedAt: now, updatedAt: now, enabled: false })
          .where(eq(toolConnectors.id, input.resourceId));
        await tx
          .update(toolConnections)
          .set({
            archivedAt: now,
            updatedAt: now,
            status: "disabled",
            isDefault: false,
          })
          .where(eq(toolConnections.connectorId, input.resourceId));
        break;
      case "tool_connection":
        await tx
          .update(toolConnections)
          .set({
            archivedAt: now,
            updatedAt: now,
            status: "disabled",
            isDefault: false,
            encryptedSecretsJson: null,
          })
          .where(eq(toolConnections.id, input.resourceId));
        break;
      case "custom_tool":
        await tx
          .update(customTools)
          .set({ archivedAt: now, updatedAt: now, status: "disabled" })
          .where(eq(customTools.id, input.resourceId));
        break;
      case "knowledge_base":
        await tx
          .update(knowledgeBases)
          .set({ archivedAt: now, updatedAt: now })
          .where(eq(knowledgeBases.id, input.resourceId));
        break;
      case "skill":
        await tx
          .update(agentSkills)
          .set({ archivedAt: now, updatedAt: now })
          .where(eq(agentSkills.id, input.resourceId));
        break;
      case "workflow":
        await tx
          .update(workflows)
          .set({ archivedAt: now, updatedAt: now, status: "archived" })
          .where(eq(workflows.id, input.resourceId));
        break;
      case "scheduled_task":
        await tx
          .delete(scheduledTasks)
          .where(eq(scheduledTasks.id, input.resourceId));
        break;
      case "conversation":
        await tx
          .update(conversations)
          .set({
            archivedAt: now,
            updatedAt: now,
            status: "archived",
          })
          .where(eq(conversations.id, input.resourceId));
        break;
      case "marketplace_item":
        await tx
          .update(marketplaceItems)
          .set({ updatedAt: now, status: "archived" })
          .where(eq(marketplaceItems.id, input.resourceId));
        break;
    }
  });

  await Promise.all(
    [...usersToInvalidate].map((userId) =>
      authorization.invalidatePrincipalPermissionCache(userId),
    ),
  );
  await audit.emit({
    organizationId: resource.organizationId,
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "resource.deleted",
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    outcome: "success",
    metadata: { name: resource.name },
  });

  return { deleted: true, resource };
}
