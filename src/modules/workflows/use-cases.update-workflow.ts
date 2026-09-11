import { and, eq, sql } from "drizzle-orm";

import { db } from "@/server/infrastructure/db";
import {
  workflowRuns,
  workflows,
  workflowVersions,
} from "@/server/infrastructure/db/schema";

import { workflowDefinitionSchema } from "./contracts";
import { enqueueWorkflowRun } from "./queue";
import { compileWorkflowDefinition } from "./runtime";
import {
  errorMessage,
  findIdempotentWorkflowRun,
  getWorkflowDetail,
  requireWorkflow,
  UpdateWorkflowInput,
  WorkflowConflictError,
  WorkflowNotFoundError,
  WorkflowQueueError,
} from "./use-cases.workflow-not-found-error";

export async function updateWorkflow(input: UpdateWorkflowInput) {
  const existing = await requireWorkflow(input.workflowId, input.workspaceId);
  return db.transaction(async (tx) => {
    const [workflow] = await tx
      .update(workflows)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.definition ? { status: "draft" as const } : {}),
        ...(input.definition
          ? {
              latestVersion: sql<number>`${workflows.latestVersion} + 1`,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workflows.id, existing.id),
          eq(workflows.workspaceId, input.workspaceId),
          sql`${workflows.status} <> 'archived'`,
        ),
      )
      .returning();
    if (!workflow) throw new WorkflowNotFoundError("Workflow not found");

    if (input.definition) {
      await tx.insert(workflowVersions).values({
        workflowId: existing.id,
        version: workflow.latestVersion,
        definitionJson: input.definition,
        createdById: input.userId,
      });
    }

    let definition = input.definition;
    if (!definition) {
      const [version] = await tx
        .select({ definitionJson: workflowVersions.definitionJson })
        .from(workflowVersions)
        .where(
          and(
            eq(workflowVersions.workflowId, existing.id),
            eq(workflowVersions.version, workflow.latestVersion),
          ),
        )
        .limit(1);
      if (!version) {
        throw new WorkflowConflictError("Workflow version is missing");
      }
      definition = workflowDefinitionSchema.parse(version.definitionJson);
    }

    return {
      ...workflow,
      version: workflow.latestVersion,
      definition,
    };
  });
}

export async function publishWorkflow(workflowId: string, workspaceId: string) {
  const detail = await getWorkflowDetail(workflowId, workspaceId);
  compileWorkflowDefinition({
    workflowId,
    version: detail.latestVersion,
    definition: detail.definition,
  });
  const [workflow] = await db
    .update(workflows)
    .set({
      status: "active",
      activeVersion: detail.latestVersion,
      updatedAt: new Date(),
    })
    .where(eq(workflows.id, workflowId))
    .returning();
  return workflow;
}

export async function archiveWorkflow(workflowId: string, workspaceId: string) {
  const existing = await requireWorkflow(workflowId, workspaceId);
  const [workflow] = await db
    .update(workflows)
    .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(workflows.id, existing.id))
    .returning();
  return workflow;
}

export async function createWorkflowRun(input: {
  workflowId: string;
  workspaceId: string;
  userId: string;
  payload?: unknown;
  useLatestDraft?: boolean;
  versionNumber?: number;
  idempotencyKey?: string;
  trigger?: "api" | "agent";
}) {
  const workflow = await requireWorkflow(
    input.workflowId,
    input.workspaceId,
    true,
  );
  const versionNumber =
    input.versionNumber ??
    (input.useLatestDraft ? workflow.latestVersion : workflow.activeVersion);
  if (!versionNumber) {
    throw new WorkflowConflictError(
      "Publish the workflow before executing it through the API.",
    );
  }
  const existingRun = await findIdempotentWorkflowRun({
    workflowId: workflow.id,
    idempotencyKey: input.idempotencyKey,
  });
  if (existingRun) return existingRun;
  const [version] = await db
    .select()
    .from(workflowVersions)
    .where(
      and(
        eq(workflowVersions.workflowId, workflow.id),
        eq(workflowVersions.version, versionNumber),
      ),
    )
    .limit(1);
  if (!version) throw new WorkflowConflictError("Workflow version is missing");
  const [run] = await db
    .insert(workflowRuns)
    .values({
      workspaceId: input.workspaceId,
      workflowId: workflow.id,
      workflowVersionId: version.id,
      triggeredById: input.userId,
      trigger: input.trigger ?? "api",
      inputJson: input.payload ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    })
    .onConflictDoNothing({
      target: [workflowRuns.workflowId, workflowRuns.idempotencyKey],
    })
    .returning();
  if (!run && input.idempotencyKey) {
    const concurrentRun = await findIdempotentWorkflowRun({
      workflowId: workflow.id,
      idempotencyKey: input.idempotencyKey,
    });
    if (concurrentRun) return concurrentRun;
  }
  if (!run) throw new Error("Failed to create workflow run");
  try {
    await enqueueWorkflowRun(run.id);
  } catch (error) {
    await db
      .update(workflowRuns)
      .set({
        status: "failed",
        error: errorMessage(error),
        completedAt: new Date(),
      })
      .where(eq(workflowRuns.id, run.id));
    throw new WorkflowQueueError("Workflow queue is unavailable");
  }
  return run;
}
