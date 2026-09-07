import { requireTransferPermission } from "./resource-transfer.transfer-access-policies";
import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/infrastructure/db";
import {
  agentSkills,
  agents,
  aiModels,
  aiProviders,
  customTools,
  documents,
  knowledgeBases,
  mcpServers,
  organizations,
  scheduledTasks,
  toolConnections,
  workflows,
  workspaceMembers,
  workspaces,
} from "@/server/infrastructure/db/schema";

import type { TransferSecretPolicy } from "./resource-transfer";
import { IamOperationError } from "./use-cases";

export type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type WorkspaceCloneCounts = {
  providers: number;
  models: number;
  assistants: number;
  mcpServers: number;
  connections: number;
  skills: number;
  knowledgeBases: number;
  documents: number;
  tools: number;
  workflows: number;
  scheduledTasks: number;
  members: number;
};

const requireClonePermission = requireTransferPermission;

async function workspaceScope(workspaceId: string) {
  const [scope] = await db
    .select({
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      organizationId: organizations.id,
      organizationName: organizations.name,
    })
    .from(workspaces)
    .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!scope) throw new IamOperationError("Project not found", 404);
  return scope;
}

export async function previewWorkspaceClone(input: {
  actorUserId: string;
  sourceWorkspaceId: string;
  targetWorkspaceId: string;
  secretPolicy: TransferSecretPolicy;
}) {
  if (input.sourceWorkspaceId === input.targetWorkspaceId) {
    throw new IamOperationError("Choose another project", 400);
  }
  await Promise.all([
    requireClonePermission(input.actorUserId, input.sourceWorkspaceId),
    requireClonePermission(input.actorUserId, input.targetWorkspaceId),
  ]);
  const [source, destination] = await Promise.all([
    workspaceScope(input.sourceWorkspaceId),
    workspaceScope(input.targetWorkspaceId),
  ]);
  const [
    providerRows,
    modelRows,
    agentRows,
    mcpRows,
    connectionRows,
    skillRows,
    knowledgeRows,
    documentRows,
    toolRows,
    workflowRows,
    scheduledRows,
    memberRows,
  ] = await Promise.all([
    db
      .select({ id: aiProviders.id })
      .from(aiProviders)
      .where(eq(aiProviders.workspaceId, input.sourceWorkspaceId)),
    db
      .select({ id: aiModels.id })
      .from(aiModels)
      .innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
      .where(eq(aiProviders.workspaceId, input.sourceWorkspaceId)),
    db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.workspaceId, input.sourceWorkspaceId)),
    db
      .select({ id: mcpServers.id })
      .from(mcpServers)
      .where(eq(mcpServers.workspaceId, input.sourceWorkspaceId)),
    db
      .select({ id: toolConnections.id })
      .from(toolConnections)
      .where(eq(toolConnections.workspaceId, input.sourceWorkspaceId)),
    db
      .select({ id: agentSkills.id })
      .from(agentSkills)
      .where(eq(agentSkills.workspaceId, input.sourceWorkspaceId)),
    db
      .select({ id: knowledgeBases.id })
      .from(knowledgeBases)
      .where(eq(knowledgeBases.workspaceId, input.sourceWorkspaceId)),
    db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.workspaceId, input.sourceWorkspaceId)),
    db
      .select({ id: customTools.id })
      .from(customTools)
      .where(eq(customTools.workspaceId, input.sourceWorkspaceId)),
    db
      .select({ id: workflows.id })
      .from(workflows)
      .where(eq(workflows.workspaceId, input.sourceWorkspaceId)),
    db
      .select({ id: scheduledTasks.id })
      .from(scheduledTasks)
      .where(eq(scheduledTasks.workspaceId, input.sourceWorkspaceId)),
    db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, input.sourceWorkspaceId),
          eq(workspaceMembers.status, "active"),
        ),
      ),
  ]);
  const counts: WorkspaceCloneCounts = {
    providers: providerRows.length,
    models: modelRows.length,
    assistants: agentRows.length,
    mcpServers: mcpRows.length,
    connections: connectionRows.length,
    skills: skillRows.length,
    knowledgeBases: knowledgeRows.length,
    documents: documentRows.length,
    tools: toolRows.length,
    workflows: workflowRows.length,
    scheduledTasks: scheduledRows.length,
    members: memberRows.length,
  };
  return {
    source,
    destination,
    counts,
    warnings: [
      "Chats, execution history, audit logs, API keys, and pending requests stay in the source project.",
      "Marketplace publications stay with their publisher; installations are reproduced against the cloned resources.",
      input.secretPolicy === "keep"
        ? "Encrypted provider, MCP, and connection secrets will be copied."
        : "Cloned providers, MCP servers, tools, and connections will be disabled until their secrets are configured.",
      "Scheduled tasks are cloned disabled to prevent duplicate executions.",
    ],
    confirmationToken: createHash("sha256")
      .update(
        JSON.stringify({
          sourceWorkspaceId: input.sourceWorkspaceId,
          targetWorkspaceId: input.targetWorkspaceId,
          secretPolicy: input.secretPolicy,
          counts,
        }),
      )
      .digest("hex"),
  };
}

export function remapDefinition(
  value: unknown,
  mappings: Map<string, string>[],
) {
  let serialized = JSON.stringify(value);
  for (const mapping of mappings) {
    for (const [from, to] of mapping) {
      serialized = serialized.replaceAll(from, to);
    }
  }
  return JSON.parse(serialized) as unknown;
}
