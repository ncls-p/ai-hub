import { resourceAvailabilityCondition } from "@/modules/iam/resource-availability";
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/server/infrastructure/db";
import {
  workflowRuns,
  workflows,
  workflowVersions,
} from "@/server/infrastructure/db/schema";

import {
  createStarterDefinition,
  workflowDefinitionSchema,
  type WorkflowDefinition,
} from "./contracts";

export class WorkflowNotFoundError extends Error {}
export class WorkflowConflictError extends Error {}
export class WorkflowQueueError extends Error {}

type CreateWorkflowInput = {
  workspaceId: string;
  userId: string;
  name: string;
  description?: string | null;
};

export type UpdateWorkflowInput = {
  workflowId: string;
  workspaceId: string;
  userId: string;
  name?: string;
  description?: string | null;
  definition?: WorkflowDefinition;
};

function boundedErrorMessage(value: string, maxChars = 8_000) {
  if (value.length <= maxChars) return value;
  const separator = "\n… error truncated …\n";
  const headLength = Math.min(1_500, Math.floor(maxChars / 3));
  const tailLength = maxChars - headLength - separator.length;
  return `${value.slice(0, headLength)}${separator}${value.slice(-tailLength)}`;
}

export function errorMessage(error: unknown) {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current !== undefined && current !== null && !seen.has(current)) {
    seen.add(current);
    const message =
      current instanceof Error ? current.message : String(current);
    if (message && !messages.includes(message)) messages.push(message);
    current =
      typeof current === "object" && "cause" in current
        ? (current as { cause?: unknown }).cause
        : undefined;
  }
  return boundedErrorMessage(messages.join("\nCaused by: "));
}

export async function findIdempotentWorkflowRun(input: {
  workflowId: string;
  idempotencyKey?: string;
}) {
  if (!input.idempotencyKey) return null;
  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.workflowId, input.workflowId),
        eq(workflowRuns.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  return run ?? null;
}

export async function requireWorkflow(
  workflowId: string,
  workspaceId: string,
  includeShared = false,
) {
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(
      and(
        eq(workflows.id, workflowId),
        includeShared
          ? resourceAvailabilityCondition({
              type: "workflow",
              id: workflows.id,
              workspaceId: workflows.workspaceId,
              activeWorkspaceId: workspaceId,
            })
          : eq(workflows.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!workflow || workflow.status === "archived") {
    throw new WorkflowNotFoundError("Workflow not found");
  }
  return workflow;
}

export async function listWorkflows(workspaceId: string) {
  return db
    .select()
    .from(workflows)
    .where(
      and(
        resourceAvailabilityCondition({
          type: "workflow",
          id: workflows.id,
          workspaceId: workflows.workspaceId,
          activeWorkspaceId: workspaceId,
        }),
        sql`${workflows.status} <> 'archived'`,
      ),
    )
    .orderBy(desc(workflows.updatedAt));
}

export async function getWorkflowDetail(
  workflowId: string,
  workspaceId: string,
) {
  const workflow = await requireWorkflow(workflowId, workspaceId, true);
  const [version] = await db
    .select()
    .from(workflowVersions)
    .where(
      and(
        eq(workflowVersions.workflowId, workflow.id),
        eq(workflowVersions.version, workflow.latestVersion),
      ),
    )
    .limit(1);
  if (!version) throw new WorkflowConflictError("Workflow version is missing");
  return {
    ...workflow,
    version: version.version,
    definition: workflowDefinitionSchema.parse(version.definitionJson),
  };
}

export async function createWorkflow(input: CreateWorkflowInput) {
  const definition = createStarterDefinition();
  return db.transaction(async (tx) => {
    const [workflow] = await tx
      .insert(workflows)
      .values({
        workspaceId: input.workspaceId,
        createdById: input.userId,
        name: input.name,
        description: input.description ?? null,
      })
      .returning();
    if (!workflow) throw new Error("Failed to create workflow");
    await tx.insert(workflowVersions).values({
      workflowId: workflow.id,
      version: 1,
      definitionJson: definition,
      createdById: input.userId,
    });
    return { ...workflow, version: 1, definition };
  });
}
