import {
  marketplaceInstalls,
  organizationMembers,
  roleBindings,
  roles,
  scheduledTasks,
  workflowVersions,
  workflows,
  workspaceMembers,
} from "@/server/infrastructure/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { WorkspaceCloneContext } from "./workspace-clone.context";
import { remapDefinition } from "./workspace-clone.executor";

export async function cloneWorkflowsAndAccess(context: WorkspaceCloneContext) {
  const {
    tx,
    input,
    suffix,
    providerMap,
    modelMap,
    mcpMap,
    mcpToolMap,
    connectorMap,
    connectionMap,
    skillMap,
    knowledgeMap,
    customToolMap,
    agentMap,
    workflowMap,
    scheduledTaskMap,
    roleMap,
  } = context;
  const sourceWorkflows = await tx
    .select()
    .from(workflows)
    .where(eq(workflows.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceWorkflows) {
    const id = randomUUID();
    workflowMap.set(source.id, id);
    await tx.insert(workflows).values({
      ...source,
      id,
      workspaceId: input.targetWorkspaceId,
      status: "draft",
      activeVersion: null,
      createdById: input.actorUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  if (sourceWorkflows.length > 0) {
    const versions = await tx
      .select()
      .from(workflowVersions)
      .where(
        inArray(
          workflowVersions.workflowId,
          sourceWorkflows.map(({ id }) => id),
        ),
      );
    for (const source of versions) {
      await tx.insert(workflowVersions).values({
        ...source,
        id: randomUUID(),
        workflowId: workflowMap.get(source.workflowId)!,
        definitionJson: remapDefinition(source.definitionJson, [
          providerMap,
          modelMap,
          mcpMap,
          mcpToolMap,
          connectorMap,
          connectionMap,
          skillMap,
          knowledgeMap,
          customToolMap,
          agentMap,
        ]),
        createdById: input.actorUserId,
        createdAt: new Date(),
      });
    }
  }

  const sourceTasks = await tx
    .select()
    .from(scheduledTasks)
    .where(eq(scheduledTasks.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceTasks) {
    const agentId = agentMap.get(source.agentId);
    if (!agentId) continue;
    const id = randomUUID();
    scheduledTaskMap.set(source.id, id);
    await tx.insert(scheduledTasks).values({
      ...source,
      id,
      workspaceId: input.targetWorkspaceId,
      agentId,
      conversationId: null,
      enabled: false,
      lastRunAt: null,
      lastStatus: "idle",
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const sourceCustomRoles = await tx
    .select()
    .from(roles)
    .where(
      and(
        eq(roles.isSystem, false),
        eq(roles.ownerResourceType, "workspace"),
        eq(roles.ownerResourceId, input.sourceWorkspaceId),
      ),
    );
  for (const source of sourceCustomRoles) {
    const id = randomUUID();
    roleMap.set(source.id, id);
    await tx.insert(roles).values({
      ...source,
      id,
      ownerResourceId: input.targetWorkspaceId,
      name: `${source.name}-${suffix}`,
      createdById: input.actorUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  const resourceMaps = new Map([
    [
      "workspace",
      new Map([[input.sourceWorkspaceId, input.targetWorkspaceId]]),
    ],
    ["agent", agentMap],
    ["provider", providerMap],
    ["model", modelMap],
    ["mcp_server", mcpMap],
    ["tool_connector", connectorMap],
    ["tool_connection", connectionMap],
    ["custom_tool", customToolMap],
    ["knowledge_base", knowledgeMap],
    ["skill", skillMap],
    ["workflow", workflowMap],
    ["scheduled_task", scheduledTaskMap],
  ]);
  const sourceBindings = await tx
    .select()
    .from(roleBindings)
    .where(eq(roleBindings.resourceId, input.sourceWorkspaceId));
  const resourceBindings = await tx
    .select()
    .from(roleBindings)
    .where(
      inArray(roleBindings.resourceId, [
        ...agentMap.keys(),
        ...providerMap.keys(),
        ...modelMap.keys(),
        ...mcpMap.keys(),
        ...connectorMap.keys(),
        ...connectionMap.keys(),
        ...customToolMap.keys(),
        ...knowledgeMap.keys(),
        ...skillMap.keys(),
        ...workflowMap.keys(),
        ...scheduledTaskMap.keys(),
      ]),
    );
  for (const source of [...sourceBindings, ...resourceBindings]) {
    const principalId =
      source.principalType === "user"
        ? source.principalId
        : source.principalType === "group"
          ? (input.groupPrincipalMap?.get(source.principalId) ??
            (input.preserveGroupPrincipals ? source.principalId : null))
          : null;
    if (!principalId) continue;
    const mappedResourceId = resourceMaps
      .get(source.resourceType)
      ?.get(source.resourceId);
    if (!mappedResourceId) continue;
    let conditionJson = source.conditionJson;
    let grantSource = source.grantSource;
    const condition = conditionJson as {
      source?: string;
      rootAgentId?: string;
    } | null;
    if (condition?.source === "agent_direct_share" && condition.rootAgentId) {
      const rootAgentId = agentMap.get(condition.rootAgentId);
      // A dependency grant must remain attached to its cloned root, never the source project.
      if (!rootAgentId) continue;
      conditionJson = { ...condition, rootAgentId };
      if (grantSource !== "direct") grantSource = `agent:${rootAgentId}`;
    }
    await tx
      .insert(roleBindings)
      .values({
        ...source,
        id: randomUUID(),
        principalId,
        roleId: roleMap.get(source.roleId) ?? source.roleId,
        resourceId: mappedResourceId,
        conditionJson,
        grantSource,
        createdById: input.actorUserId,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  }
  const sourceInstalls = await tx
    .select()
    .from(marketplaceInstalls)
    .where(eq(marketplaceInstalls.workspaceId, input.sourceWorkspaceId));
  for (const source of sourceInstalls) {
    const mappedResourceId = source.installedResourceType
      ? resourceMaps
          .get(source.installedResourceType)
          ?.get(source.installedResourceId ?? "")
      : null;
    if (source.installedResourceId && !mappedResourceId) continue;
    await tx.insert(marketplaceInstalls).values({
      ...source,
      id: randomUUID(),
      workspaceId: input.targetWorkspaceId,
      installedResourceId: mappedResourceId ?? null,
      installedByUserId: input.actorUserId,
      createdAt: new Date(),
    });
  }

  const sourceMembers = await tx
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, input.sourceWorkspaceId),
        eq(workspaceMembers.status, "active"),
      ),
    );
  const memberRole = await tx
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.isSystem, true), eq(roles.name, "workspace.member")))
    .limit(1);
  for (const source of sourceMembers) {
    await tx
      .insert(organizationMembers)
      .values({
        organizationId: input.targetOrganizationId,
        userId: source.userId,
        status: "active",
      })
      .onConflictDoUpdate({
        target: [
          organizationMembers.organizationId,
          organizationMembers.userId,
        ],
        set: { status: "active", updatedAt: new Date() },
      });
    await tx
      .insert(workspaceMembers)
      .values({
        workspaceId: input.targetWorkspaceId,
        userId: source.userId,
        status: "active",
      })
      .onConflictDoUpdate({
        target: [workspaceMembers.workspaceId, workspaceMembers.userId],
        set: { status: "active", updatedAt: new Date() },
      });
    if (memberRole[0])
      await tx
        .insert(roleBindings)
        .values({
          principalType: "user",
          principalId: source.userId,
          roleId: memberRole[0].id,
          resourceType: "workspace",
          resourceId: input.targetWorkspaceId,
          createdById: input.actorUserId,
        })
        .onConflictDoNothing();
  }
}
