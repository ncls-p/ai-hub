import { resourceAvailabilityCondition } from "@/modules/iam/resource-availability";
import { logger } from "@/lib/logger";
import {
  cloneDelegationBindings,
  insertDelegationBindingsForVersion,
} from "@/modules/agent/delegation-use-cases";
import { normalizeOrchestrationPolicy } from "@/modules/agent/orchestration-policy";
import {
  cloneKnowledgeBindings,
  replaceKnowledgeBindingsForVersion,
} from "@/modules/knowledge/use-cases";
import {
  cloneSkillBindings,
  replaceSkillBindingsForVersion,
} from "@/modules/skills/use-cases";
import {
  cloneToolBindings,
  insertToolBindingsForVersion,
} from "@/modules/tool/use-cases";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  agentVersions,
  aiModels,
  aiProviders,
} from "@/server/infrastructure/db/schema";
import { and, eq, isNull, max, sql } from "drizzle-orm";
import {
  AgentVersionConflictError,
  normalizeCurationLabel,
  preparePromptSuggestions,
  requireShareTargetUserId,
  UpdateAgentInput,
} from "./use-cases.agent-row";
import { preserveBuiltinApprovalOverrides } from "./use-cases.create-available-agent-slug";
import { canEditAgentForScope } from "./use-cases.get-visible-agent-by-id";
import { getActiveVersionConfig } from "./use-cases.reorder-organization-agents";
import {
  applyAgentAccessSelection,
  invalidateAgentAccessCache,
  validateAgentAccessSelection,
} from "./access-scope";

export async function updateAgentUnlocked(input: UpdateAgentInput) {
  const {
    agentId,
    workspaceId,
    userId,
    baseVersionId,
    name,
    slug,
    description,
    logoUrl,
    systemPrompt,
    providerId,
    modelId,
    temperature,
    topP,
    maxOutputTokens,
    maxToolCalls,
    toolBindings,
    knowledgeBindings,
    skillBindings,
    orchestrationPolicy,
    delegationBindings,
    sharingMode,
    shareTargetEmail,
    accessScope,
    accessTeamId,
    isGlobal,
    isRecommended,
    curationLabel,
    canAdminCurate,
    toolChoice,
    generationSettings,
    responseFormat,
    memoryPolicy,
    guardrails,
    approvalPolicy,
    promptSuggestions,
  } = input;

  const [existing] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
    .limit(1);

  if (!existing) {
    throw new Error("Agent not found");
  }

  if (
    !(await canEditAgentForScope(existing, userId, Boolean(canAdminCurate)))
  ) {
    throw new Error("Only the creator or an admin can update this agent");
  }
  if (existing.activeVersionId !== baseVersionId) {
    throw new AgentVersionConflictError(existing.activeVersionId);
  }
  if (
    existing.kind === "assistant" &&
    (orchestrationPolicy !== undefined || (delegationBindings?.length ?? 0) > 0)
  ) {
    throw new Error("Only orchestrators can configure delegation");
  }
  if (accessScope) {
    await validateAgentAccessSelection({
      userId,
      workspaceId,
      selection: { scope: accessScope, teamId: accessTeamId },
    });
  }

  const normalizedToolBindings = canAdminCurate
    ? toolBindings
    : await preserveBuiltinApprovalOverrides(
        toolBindings,
        existing.activeVersionId,
        {
          workspaceId,
          userId,
        },
      );

  const nextShareTargetUserId =
    sharingMode === "specific_user"
      ? await requireShareTargetUserId(shareTargetEmail)
      : sharingMode
        ? null
        : existing.shareTargetUserId;

  const { agent, version, accessAffectedUserIds } = await db.transaction(
    async (tx) => {
      const activeVersionPredicate = baseVersionId
        ? eq(agents.activeVersionId, baseVersionId)
        : isNull(agents.activeVersionId);
      const [lockedAgent] = await tx
        .update(agents)
        .set({ updatedAt: sql`${agents.updatedAt}` })
        .where(
          and(
            eq(agents.id, agentId),
            eq(agents.workspaceId, workspaceId),
            activeVersionPredicate,
          ),
        )
        .returning();
      if (!lockedAgent) {
        const [current] = await tx
          .select({ activeVersionId: agents.activeVersionId })
          .from(agents)
          .where(
            and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)),
          )
          .limit(1);
        if (!current) throw new Error("Agent not found");
        throw new AgentVersionConflictError(current.activeVersionId);
      }

      const agentUpdates: Record<string, unknown> = { updatedAt: new Date() };
      if (name !== undefined) agentUpdates.name = name;
      if (slug !== undefined) agentUpdates.slug = slug;
      if (description !== undefined) agentUpdates.description = description;
      if (logoUrl !== undefined) agentUpdates.logoUrl = logoUrl ?? null;
      if (promptSuggestions !== undefined) {
        agentUpdates.promptSuggestionsJson =
          preparePromptSuggestions(promptSuggestions);
      }
      if (sharingMode !== undefined) {
        agentUpdates.sharingMode = sharingMode;
        agentUpdates.shareTargetUserId = nextShareTargetUserId;
        agentUpdates.visibility =
          sharingMode === "marketplace" ? "public" : "private";
      }
      if (canAdminCurate) {
        if (isGlobal !== undefined) agentUpdates.isGlobal = isGlobal;
        if (isRecommended !== undefined) {
          agentUpdates.isRecommended = isRecommended;
        }
        if (curationLabel !== undefined || isRecommended !== undefined) {
          agentUpdates.curationLabel = normalizeCurationLabel(
            curationLabel,
            isRecommended ?? existing.isRecommended,
          );
        }
      }

      if (Object.keys(agentUpdates).length > 1) {
        await tx.update(agents).set(agentUpdates).where(eq(agents.id, agentId));
      }

      // Get active version config for inheritance
      const activeConfig = await getActiveVersionConfig(tx, baseVersionId);

      const nextProviderId =
        providerId !== undefined
          ? providerId
          : (activeConfig?.providerId ?? null);
      const nextModelId =
        modelId !== undefined
          ? modelId
          : providerId !== undefined
            ? null
            : (activeConfig?.modelId ?? null);
      const nextOrchestrationPolicy =
        existing.kind === "orchestrator"
          ? normalizeOrchestrationPolicy(
              orchestrationPolicy ?? activeConfig?.orchestrationPolicyJson,
            )
          : null;

      if (nextProviderId) {
        const [provider] = await tx
          .select({ id: aiProviders.id })
          .from(aiProviders)
          .where(
            and(
              eq(aiProviders.id, nextProviderId),
              resourceAvailabilityCondition({
                type: "provider",
                id: aiProviders.id,
                workspaceId: aiProviders.workspaceId,
                activeWorkspaceId: workspaceId,
              }),
              isNull(aiProviders.archivedAt),
            ),
          )
          .limit(1);
        if (!provider) throw new Error("Provider not found");
      }

      if (nextModelId) {
        if (!nextProviderId) throw new Error("Model requires a provider");
        const [model] = await tx
          .select({ id: aiModels.id })
          .from(aiModels)
          .innerJoin(aiProviders, eq(aiProviders.id, aiModels.providerId))
          .where(
            and(
              eq(aiModels.id, nextModelId),
              eq(aiModels.providerId, nextProviderId),
              eq(aiModels.enabled, true),
              resourceAvailabilityCondition({
                type: "model",
                id: aiModels.id,
                workspaceId: aiProviders.workspaceId,
                activeWorkspaceId: workspaceId,
                providerId: aiModels.providerId,
              }),
            ),
          )
          .limit(1);
        if (!model) throw new Error("Model not found");
      }

      // Get next version number
      const [row] = await tx
        .select({ maxVersion: max(agentVersions.versionNumber) })
        .from(agentVersions)
        .where(eq(agentVersions.agentId, agentId));

      const nextVersion = (row?.maxVersion ?? 0) + 1;

      const [version] = await tx
        .insert(agentVersions)
        .values({
          agentId,
          versionNumber: nextVersion,
          name: `Version ${nextVersion}`,
          systemPrompt:
            systemPrompt !== undefined
              ? systemPrompt
              : (activeConfig?.systemPrompt ?? null),
          providerId: nextProviderId,
          modelId: nextModelId,
          temperature:
            temperature !== undefined
              ? temperature
              : (activeConfig?.temperature ?? null),
          topP: topP !== undefined ? topP : (activeConfig?.topP ?? null),
          maxOutputTokens:
            maxOutputTokens !== undefined
              ? maxOutputTokens
              : (activeConfig?.maxOutputTokens ?? null),
          maxToolCalls:
            maxToolCalls !== undefined
              ? maxToolCalls
              : (activeConfig?.maxToolCalls ?? 20),
          toolChoice:
            toolChoice !== undefined
              ? toolChoice
              : (activeConfig?.toolChoice ?? null),
          generationSettingsJson:
            generationSettings !== undefined
              ? generationSettings
              : (activeConfig?.generationSettingsJson ?? null),
          responseFormatJson:
            responseFormat !== undefined
              ? { type: responseFormat }
              : (activeConfig?.responseFormatJson ?? null),
          memoryPolicyJson:
            memoryPolicy !== undefined
              ? memoryPolicy
              : (activeConfig?.memoryPolicyJson ?? null),
          guardrailsJson:
            guardrails !== undefined
              ? guardrails
              : (activeConfig?.guardrailsJson ?? null),
          approvalPolicyJson:
            approvalPolicy !== undefined
              ? approvalPolicy
              : (activeConfig?.approvalPolicyJson ?? null),
          orchestrationPolicyJson: nextOrchestrationPolicy,
          createdById: userId,
        })
        .returning();

      if (normalizedToolBindings !== undefined) {
        await insertToolBindingsForVersion(
          version.id,
          normalizedToolBindings,
          workspaceId,
          { userId },
          tx,
        );
      } else {
        await cloneToolBindings(
          baseVersionId,
          version.id,
          workspaceId,
          {
            userId,
          },
          tx,
        );
      }

      if (knowledgeBindings !== undefined) {
        await replaceKnowledgeBindingsForVersion(
          version.id,
          knowledgeBindings,
          workspaceId,
          { userId },
          tx,
        );
      } else {
        await cloneKnowledgeBindings(
          baseVersionId,
          version.id,
          workspaceId,
          { userId },
          tx,
        );
      }

      if (skillBindings !== undefined) {
        await replaceSkillBindingsForVersion(
          version.id,
          workspaceId,
          skillBindings,
          { userId },
          tx,
        );
      } else {
        await cloneSkillBindings(
          baseVersionId,
          version.id,
          workspaceId,
          { userId },
          tx,
        );
      }

      if (nextOrchestrationPolicy) {
        if (delegationBindings !== undefined) {
          await insertDelegationBindingsForVersion({
            parentAgentId: agentId,
            agentVersionId: version.id,
            workspaceId,
            userId,
            bindings: delegationBindings,
            policy: nextOrchestrationPolicy,
            executor: tx,
          });
        } else {
          await cloneDelegationBindings({
            fromAgentVersionId: baseVersionId,
            toAgentVersionId: version.id,
            parentAgentId: agentId,
            workspaceId,
            userId,
            policy: nextOrchestrationPolicy,
            executor: tx,
          });
        }
      }

      await tx
        .update(agents)
        .set({ activeVersionId: version.id, updatedAt: new Date() })
        .where(eq(agents.id, agentId));

      const accessAffectedUserIds = accessScope
        ? await applyAgentAccessSelection(
            {
              agentId,
              userId,
              selection: { scope: accessScope, teamId: accessTeamId },
            },
            tx,
          )
        : [];

      const [updatedAgent] = await tx
        .select()
        .from(agents)
        .where(eq(agents.id, agentId))
        .limit(1);

      return { agent: updatedAgent, version, accessAffectedUserIds };
    },
  );

  await invalidateAgentAccessCache(agentId, accessAffectedUserIds);

  await audit.emit({
    workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: userId,
    action: "agent.updated",
    resourceType: "agent",
    resourceId: agentId,
    outcome: "success",
    metadata: {
      versionNumber: version.versionNumber,
      sharingMode: sharingMode ?? existing.sharingMode,
      accessScope,
    },
  });

  logger.info("Agent updated", {
    agentId,
    versionNumber: version.versionNumber,
    userId,
  });
  return { agent, version };
}
