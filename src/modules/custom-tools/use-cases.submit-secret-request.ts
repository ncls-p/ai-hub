import { resourceAvailabilityCondition } from "@/modules/iam/resource-availability";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { encryptValue } from "@/lib/crypto";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  customToolCredentialRefs,
  customToolSecretRequests,
  customTools,
} from "@/server/infrastructure/db/schema";
import {
  callConfiguredN8nTool,
  safeCredentialSummary,
} from "./use-cases.call-configured-n8n-tool";
import {
  CustomToolRow,
  canManageCustomTool,
  getCustomToolBuilderConfig,
  secretFieldSchema,
} from "./use-cases.custom-tool-row";

export async function submitSecretRequest(input: {
  workspaceId: string;
  userId: string;
  requestId: string;
  values: Record<string, string>;
  provider?: string;
  label?: string;
}) {
  const [request] = await db
    .select()
    .from(customToolSecretRequests)
    .where(
      and(
        eq(customToolSecretRequests.id, input.requestId),
        eq(customToolSecretRequests.workspaceId, input.workspaceId),
        eq(customToolSecretRequests.userId, input.userId),
      ),
    )
    .limit(1);
  if (!request) throw new Error("Secret request not found");
  if (request.status !== "pending")
    throw new Error("Secret request is no longer pending");
  if (request.expiresAt.getTime() < Date.now())
    throw new Error("Secret request expired");

  const fields = z.array(secretFieldSchema).parse(request.fieldsJson);
  const sanitizedValues: Record<string, string> = {};
  for (const field of fields) {
    const value = input.values[field.name]?.trim() ?? "";
    if (field.required && !value)
      throw new Error(`Missing value for ${field.label}`);
    sanitizedValues[field.name] = value;
  }

  const [credentialRef] = await db
    .insert(customToolCredentialRefs)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      provider: input.provider || request.title,
      label: input.label || request.title,
      encryptedPayload: await encryptValue(JSON.stringify(sanitizedValues)),
      metadataJson: {
        fieldNames: fields.map((field) => field.name),
        secretRequestId: request.id,
      },
    })
    .returning();

  await db
    .update(customToolSecretRequests)
    .set({
      status: "submitted",
      credentialRefId: credentialRef.id,
      submittedAt: new Date(),
    })
    .where(eq(customToolSecretRequests.id, request.id));

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "customTool.secretSubmitted",
    resourceType: "custom_tool_secret_request",
    resourceId: request.id,
    outcome: "success",
    metadata: {
      credentialRefId: credentialRef.id,
      fieldNames: fields.map((field) => field.name),
    },
  });

  return safeCredentialSummary(fields, credentialRef.id);
}

export async function listCustomTools(
  workspaceId: string,
  userId: string,
  canManageGlobal = false,
) {
  const tools = await db
    .select({
      id: customTools.id,
      name: customTools.name,
      workspaceId: customTools.workspaceId,
      description: customTools.description,
      status: customTools.status,
      n8nWorkflowId: customTools.n8nWorkflowId,
      n8nWorkflowUrl: customTools.n8nWorkflowUrl,
      metadataJson: customTools.metadataJson,
      createdById: customTools.createdById,
      isGlobal: customTools.isGlobal,
      createdAt: customTools.createdAt,
      updatedAt: customTools.updatedAt,
    })
    .from(customTools)
    .where(
      and(
        resourceAvailabilityCondition({
          type: "custom_tool",
          id: customTools.id,
          workspaceId: customTools.workspaceId,
          activeWorkspaceId: workspaceId,
        }),
        isNull(customTools.archivedAt),
      ),
    )
    .orderBy(desc(customTools.isGlobal), desc(customTools.createdAt));
  return (
    await Promise.all(
      tools.map(async (tool) => {
        const visible =
          tool.createdById === userId ||
          tool.isGlobal ||
          (await authorization.hasDirectPermission(
            { principalType: "user", principalId: userId },
            "tools.view",
            "custom_tool",
            tool.id,
            workspaceId,
          ));
        if (!visible) return null;
        return {
          ...tool,
          canEdit: await canManageCustomTool(
            tool as CustomToolRow,
            userId,
            canManageGlobal && tool.workspaceId === workspaceId,
          ),
        };
      }),
    )
  ).filter((tool) => tool !== null);
}

export async function deleteCustomTool(input: {
  workspaceId: string;
  userId: string;
  customToolId: string;
  canManageGlobal?: boolean;
}) {
  const config = await getCustomToolBuilderConfig();
  const [customTool] = await db
    .select()
    .from(customTools)
    .where(
      and(
        eq(customTools.id, input.customToolId),
        eq(customTools.workspaceId, input.workspaceId),
        isNull(customTools.archivedAt),
      ),
    )
    .limit(1);
  if (!customTool) throw new Error("Custom tool not found");
  if (
    !(await canManageCustomTool(
      customTool,
      input.userId,
      input.canManageGlobal,
    ))
  ) {
    throw new Error("Custom tool not found");
  }

  let workflowDeleted = false;
  let workflowDeleteError: string | undefined;
  if (customTool.n8nWorkflowId) {
    try {
      await callConfiguredN8nTool({
        config,
        workspaceId: input.workspaceId,
        toolName: "n8n_delete_workflow",
        arguments: { id: customTool.n8nWorkflowId },
      });
      workflowDeleted = true;
    } catch (error) {
      workflowDeleteError =
        error instanceof Error ? error.message : String(error);
    }
  }

  await db
    .update(customTools)
    .set({ archivedAt: new Date(), updatedAt: new Date(), status: "disabled" })
    .where(eq(customTools.id, customTool.id));

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "customTool.deleted",
    resourceType: "custom_tool",
    resourceId: customTool.id,
    outcome: workflowDeleteError ? "failed" : "success",
    metadata: {
      workflowId: customTool.n8nWorkflowId,
      workflowDeleted,
      workflowDeleteError,
    },
  });

  return { deleted: true, workflowDeleted, workflowDeleteError };
}

export async function executeCustomToolWorkflow(input: {
  workspaceId: string;
  userId: string;
  customToolId: string;
  toolInput: unknown;
}) {
  const config = await getCustomToolBuilderConfig();
  const [customTool] = await db
    .select()
    .from(customTools)
    .where(
      and(
        eq(customTools.id, input.customToolId),
        eq(customTools.workspaceId, input.workspaceId),
        isNull(customTools.archivedAt),
      ),
    )
    .limit(1);
  if (!customTool) throw new Error("Custom tool not found");
  if (
    customTool.createdById !== input.userId &&
    !customTool.isGlobal &&
    !(await authorization.hasDirectPermission(
      { principalType: "user", principalId: input.userId },
      "tools.view",
      "custom_tool",
      customTool.id,
      input.workspaceId,
    ))
  ) {
    throw new Error("Custom tool not found");
  }
  if (!customTool.n8nWorkflowId) {
    throw new Error("Custom tool is not linked to a workflow yet");
  }

  return callConfiguredN8nTool({
    config,
    workspaceId: input.workspaceId,
    toolName: "n8n_test_workflow",
    arguments: {
      workflowId: customTool.n8nWorkflowId,
      data:
        input.toolInput && typeof input.toolInput === "object"
          ? (input.toolInput as Record<string, unknown>)
          : {},
      timeout: 120000,
    },
  });
}
