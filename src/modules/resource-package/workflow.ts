import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import { workflows, workflowVersions } from "@/server/infrastructure/db/schema";
import { workflowDefinitionSchema } from "@/modules/workflows/contracts";
import { buildAgentManifest } from "@/modules/marketplace/manifest-builders";
import { installAgentManifest } from "@/modules/marketplace/install-helpers";
import type { Tx } from "@/modules/marketplace/install-helpers.tx";
import { requirePackageResourceAccess } from "./permissions";
import { ResourcePackageError } from "./schema";
import type { WorkflowResourceManifest } from "./types";

export async function exportWorkflowManifest(input: {
  workspaceId: string;
  userId: string;
  resourceId: string;
}): Promise<WorkflowResourceManifest> {
  await requirePackageResourceAccess({ ...input, resourceType: "workflow" });
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(
      and(
        eq(workflows.id, input.resourceId),
        eq(workflows.workspaceId, input.workspaceId),
        isNull(workflows.archivedAt),
      ),
    )
    .limit(1);
  if (!workflow || workflow.status === "archived")
    throw new ResourcePackageError("Workflow not found", 404);
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
  if (!version)
    throw new ResourcePackageError("Workflow version is missing", 409);
  const definition = workflowDefinitionSchema.parse(version.definitionJson);
  const bindings: WorkflowResourceManifest["agentBindings"] = [];
  const refs = new Map<string, string>();
  const budget = { agents: 0 };
  for (const node of definition.nodes) {
    if (node.type !== "agent.run") continue;
    const id = node.parameters.agentId;
    if (typeof id !== "string" || !z.uuid().safeParse(id).success)
      throw new ResourcePackageError(
        `Choose an assistant for workflow node: ${node.label}`,
      );
    let ref = refs.get(id);
    if (!ref) {
      ref = randomUUID();
      refs.set(id, ref);
      bindings.push({
        ref,
        manifest: await buildAgentManifest(
          id,
          input.workspaceId,
          "",
          undefined,
          undefined,
          undefined,
          input.userId,
          budget,
        ),
      });
    }
    node.parameters.agentId = ref;
  }
  return {
    type: "workflow",
    name: workflow.name,
    description: workflow.description ?? undefined,
    definition,
    agentBindings: bindings,
    requiresCredentials: false,
  };
}

export async function installWorkflowManifest(
  tx: Tx,
  input: {
    workspaceId: string;
    userId: string;
    manifest: WorkflowResourceManifest;
  },
) {
  const definition = structuredClone(input.manifest.definition);
  const agentsByRef = new Map<string, string>();
  for (const binding of input.manifest.agentBindings) {
    const agent = await installAgentManifest(tx, {
      workspaceId: input.workspaceId,
      userId: input.userId,
      manifest: binding.manifest,
      versionLabel: "JSON v1",
    });
    agentsByRef.set(binding.ref, agent.id);
  }
  for (const node of definition.nodes) {
    if (node.type !== "agent.run") continue;
    const agentId = agentsByRef.get(String(node.parameters.agentId));
    if (!agentId)
      throw new ResourcePackageError(
        `Missing assistant for workflow node: ${node.label}`,
      );
    node.parameters.agentId = agentId;
  }
  const [workflow] = await tx
    .insert(workflows)
    .values({
      workspaceId: input.workspaceId,
      createdById: input.userId,
      name: input.manifest.name,
      description: input.manifest.description,
      status: "draft",
    })
    .returning();
  await tx.insert(workflowVersions).values({
    workflowId: workflow.id,
    version: 1,
    createdById: input.userId,
    definitionJson: definition,
  });
  return workflow;
}
