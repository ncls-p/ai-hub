import { resourceAvailabilityCondition } from "@/modules/iam/resource-availability";
import { applyResourceAccessSelection } from "@/modules/iam/resource-access-scope";
import {
  getDefaultRagConfig,
  hasSameRagModelSelection,
  inheritRagConfigDefaults,
  parseRagConfig,
  ragConfigSchema,
  type RagConfig,
} from "@/modules/knowledge/rag-config";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { knowledgeBases } from "@/server/infrastructure/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  KnowledgeBaseRow,
  RagModelConfigurationPermissionError,
  assertCanManageKnowledgeBase,
  canManageKnowledgeBase,
  canViewKnowledgeBase,
  effectiveRagConfig,
} from "./use-cases.create-knowledge-base-input";

export async function listKnowledgeBases(
  workspaceId: string,
  userId?: string,
  canManageGlobal = false,
) {
  const rows = await db
    .select()
    .from(knowledgeBases)
    .where(
      and(
        resourceAvailabilityCondition({
          type: "knowledge_base",
          id: knowledgeBases.id,
          workspaceId: knowledgeBases.workspaceId,
          activeWorkspaceId: workspaceId,
          visibility: knowledgeBases.visibility,
        }),
        isNull(knowledgeBases.archivedAt),
      ),
    )
    .orderBy(
      sql`${knowledgeBases.isGlobal} DESC`,
      sql`${knowledgeBases.createdAt} DESC`,
    );
  const defaultRagConfig = await getDefaultRagConfig();
  const withRagConfig = (knowledgeBase: KnowledgeBaseRow) => ({
    ...knowledgeBase,
    effectiveRagConfig:
      knowledgeBase.ragConfigJson === null
        ? defaultRagConfig
        : inheritRagConfigDefaults(
            parseRagConfig(knowledgeBase.ragConfigJson),
            defaultRagConfig,
          ),
    usesDefaultRagConfig: knowledgeBase.ragConfigJson === null,
  });
  if (!userId) {
    return rows.map((knowledgeBase) => ({
      ...withRagConfig(knowledgeBase),
      canEdit: true,
    }));
  }
  return (
    await Promise.all(
      rows.map(async (knowledgeBase) => {
        const visible = await canViewKnowledgeBase(knowledgeBase, userId);
        if (!visible) return null;
        const canEdit =
          canManageKnowledgeBase(
            knowledgeBase,
            userId,
            canManageGlobal && knowledgeBase.workspaceId === workspaceId,
          ) ||
          (await authorization.hasDirectPermission(
            { principalType: "user", principalId: userId },
            "knowledgeBases.manage",
            "knowledge_base",
            knowledgeBase.id,
            workspaceId,
          ));
        return { ...withRagConfig(knowledgeBase), canEdit };
      }),
    )
  ).filter((knowledgeBase) => knowledgeBase !== null);
}

export async function getKnowledgeBase(
  knowledgeBaseId: string,
  workspaceId: string,
  userId?: string,
) {
  const [knowledgeBase] = await db
    .select()
    .from(knowledgeBases)
    .where(
      and(
        eq(knowledgeBases.id, knowledgeBaseId),
        resourceAvailabilityCondition({
          type: "knowledge_base",
          id: knowledgeBases.id,
          workspaceId: knowledgeBases.workspaceId,
          activeWorkspaceId: workspaceId,
          visibility: knowledgeBases.visibility,
        }),
        isNull(knowledgeBases.archivedAt),
      ),
    )
    .limit(1);
  if (
    knowledgeBase &&
    userId &&
    knowledgeBase.createdById !== userId &&
    !knowledgeBase.isGlobal &&
    !(await authorization.hasDirectPermission(
      { principalType: "user", principalId: userId },
      "knowledgeBases.viewAllowed",
      "knowledge_base",
      knowledgeBase.id,
      workspaceId,
    ))
  ) {
    return null;
  }
  return knowledgeBase ?? null;
}

export async function updateKnowledgeBase(input: {
  knowledgeBaseId: string;
  workspaceId: string;
  userId: string;
  canManageGlobal?: boolean;
  name?: string;
  description?: string;
  isGlobal?: boolean;
  accessScope?: "private" | "project" | "organization" | "team";
  accessTeamId?: string;
  ragConfig?: RagConfig | null;
  canManageModels?: boolean;
}) {
  const existing = await getKnowledgeBase(
    input.knowledgeBaseId,
    input.workspaceId,
  );
  if (!existing) throw new Error("Knowledge base not found");
  await assertCanManageKnowledgeBase(
    existing,
    input.userId,
    input.canManageGlobal && existing.workspaceId === input.workspaceId,
  );
  if (input.isGlobal && !input.canManageGlobal) {
    throw new Error("Only admins can make knowledge bases global");
  }
  if (input.ragConfig && !input.canManageModels) {
    const currentConfig = await effectiveRagConfig(existing.ragConfigJson);
    // Compare after default inheritance on both sides so a form submitted
    // with untouched (empty) model sections doesn't read as a model change.
    const requestedConfig = inheritRagConfigDefaults(
      input.ragConfig,
      await getDefaultRagConfig(),
    );
    if (!hasSameRagModelSelection(requestedConfig, currentConfig)) {
      throw new RagModelConfigurationPermissionError();
    }
  }

  if (input.accessScope) {
    await applyResourceAccessSelection({
      resourceType: "knowledge_base",
      resourceId: input.knowledgeBaseId,
      userId: input.userId,
      selection: { scope: input.accessScope, teamId: input.accessTeamId },
    });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined)
    updates.description = input.description || null;
  if (input.isGlobal !== undefined) {
    updates.isGlobal = input.isGlobal;
    updates.visibility = input.isGlobal ? "organization" : "private";
  }
  if (input.ragConfig !== undefined) {
    updates.ragConfigJson = input.ragConfig
      ? ragConfigSchema.parse(input.ragConfig)
      : null;
  }

  const [knowledgeBase] = await db
    .update(knowledgeBases)
    .set(updates)
    .where(eq(knowledgeBases.id, input.knowledgeBaseId))
    .returning();

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "knowledgeBase.updated",
    resourceType: "knowledge_base",
    resourceId: input.knowledgeBaseId,
    outcome: "success",
  });

  return knowledgeBase;
}

export async function archiveKnowledgeBase(
  knowledgeBaseId: string,
  workspaceId: string,
  userId: string,
  canManageGlobal = false,
) {
  const existing = await getKnowledgeBase(knowledgeBaseId, workspaceId);
  if (!existing) throw new Error("Knowledge base not found");
  await assertCanManageKnowledgeBase(
    existing,
    userId,
    canManageGlobal && existing.workspaceId === workspaceId,
  );
  await db
    .update(knowledgeBases)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(knowledgeBases.id, knowledgeBaseId));
  await audit.emit({
    workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: userId,
    action: "knowledgeBase.archived",
    resourceType: "knowledge_base",
    resourceId: knowledgeBaseId,
    outcome: "success",
  });
}
