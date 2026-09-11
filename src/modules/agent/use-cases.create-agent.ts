import { resourceAvailabilityCondition } from "@/modules/iam/resource-availability";
import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";
import { insertDelegationBindingsForVersion } from "@/modules/agent/delegation-use-cases";
import { ONBOARDING_TOOL_PRESET } from "@/modules/agent/onboarding-tools";
import { normalizeOrchestrationPolicy } from "@/modules/agent/orchestration-policy";
import { replaceKnowledgeBindingsForVersion } from "@/modules/knowledge/use-cases";
import { replaceSkillBindingsForVersion } from "@/modules/skills/use-cases";
import { insertToolBindingsForVersion } from "@/modules/tool/use-cases";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  agentVersions,
  aiModels,
  aiProviders,
} from "@/server/infrastructure/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import {
  CreateAgentInput,
  normalizeCurationLabel,
  preparePromptSuggestions,
  requireShareTargetUserId,
} from "./use-cases.agent-row";
import {
  applyAgentAccessSelection,
  invalidateAgentAccessCache,
  validateAgentAccessSelection,
} from "./access-scope";
import {
  getOnboardingToolBindings,
  stripBuiltinApprovalOverrides,
} from "./use-cases.create-available-agent-slug";

// ─── Agent CRUD ────────────────────────────────────────────────────────

export async function createAgent(input: CreateAgentInput) {
  const {
    workspaceId,
    userId,
    name,
    slug = randomUUID(),
    kind = "assistant",
    description,
    logoUrl,
    systemPrompt,
    providerId,
    modelId,
    temperature,
    topP,
    maxOutputTokens,
    maxToolCalls,
    toolPreset,
    toolBindings,
    knowledgeBindings,
    skillBindings,
    orchestrationPolicy,
    delegationBindings,
    promptSuggestions,
    sharingMode = "personal",
    shareTargetEmail,
    accessScope,
    accessTeamId,
    isGlobal,
    isRecommended,
    curationLabel,
    canAdminCurate,
  } = input;

  if (
    kind === "assistant" &&
    (orchestrationPolicy !== undefined || (delegationBindings?.length ?? 0) > 0)
  ) {
    throw new Error("Only orchestrators can configure delegation");
  }
  const normalizedOrchestrationPolicy =
    kind === "orchestrator"
      ? normalizeOrchestrationPolicy(orchestrationPolicy)
      : null;

  if (providerId) {
    const [provider] = await db
      .select({ id: aiProviders.id })
      .from(aiProviders)
      .where(
        and(
          eq(aiProviders.id, providerId),
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

  if (modelId) {
    if (!providerId) throw new Error("Model requires a provider");
    const [model] = await db
      .select({ id: aiModels.id })
      .from(aiModels)
      .innerJoin(aiProviders, eq(aiProviders.id, aiModels.providerId))
      .where(
        and(
          eq(aiModels.id, modelId),
          eq(aiModels.providerId, providerId),
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

  const shareTargetUserId =
    sharingMode === "specific_user"
      ? await requireShareTargetUserId(shareTargetEmail)
      : null;
  if (accessScope) {
    await validateAgentAccessSelection({
      userId,
      workspaceId,
      selection: { scope: accessScope, teamId: accessTeamId },
    });
  }

  if (toolPreset && toolBindings !== undefined) {
    throw new Error("toolPreset cannot be combined with toolBindings");
  }
  const normalizedToolBindings =
    toolPreset === ONBOARDING_TOOL_PRESET
      ? getOnboardingToolBindings()
      : canAdminCurate
        ? toolBindings
        : stripBuiltinApprovalOverrides(toolBindings);

  const curated = canAdminCurate
    ? {
        isGlobal: Boolean(isGlobal),
        isRecommended: Boolean(isRecommended),
        curationLabel: normalizeCurationLabel(curationLabel, isRecommended),
      }
    : {
        isGlobal: false,
        isRecommended: false,
        curationLabel: null,
      };

  const { agent, version, accessAffectedUserIds } = await db.transaction(
    async (tx) => {
      const [agent] = await tx
        .insert(agents)
        .values({
          workspaceId,
          name,
          slug,
          description: description || null,
          logoUrl: logoUrl ?? null,
          promptSuggestionsJson: preparePromptSuggestions(promptSuggestions),
          createdById: userId,
          visibility: sharingMode === "marketplace" ? "public" : "private",
          sourceType: "custom",
          kind,
          sharingMode,
          shareTargetUserId,
          ...curated,
        })
        .returning();

      const [version] = await tx
        .insert(agentVersions)
        .values({
          agentId: agent.id,
          versionNumber: 1,
          name: "Initial version",
          systemPrompt: systemPrompt || null,
          providerId: providerId || null,
          modelId: modelId || null,
          temperature: temperature || null,
          topP: topP || null,
          maxOutputTokens: maxOutputTokens ?? 0,
          maxToolCalls: maxToolCalls ?? 20,
          orchestrationPolicyJson: normalizedOrchestrationPolicy,
          createdById: userId,
        })
        .returning();

      await tx
        .update(agents)
        .set({ activeVersionId: version.id })
        .where(eq(agents.id, agent.id));

      await insertToolBindingsForVersion(
        version.id,
        normalizedToolBindings ?? [],
        workspaceId,
        { userId },
        tx,
      );
      await replaceKnowledgeBindingsForVersion(
        version.id,
        knowledgeBindings ?? [],
        workspaceId,
        { userId },
        tx,
      );
      await replaceSkillBindingsForVersion(
        version.id,
        workspaceId,
        skillBindings ?? [],
        { userId },
        tx,
      );
      if (normalizedOrchestrationPolicy) {
        await insertDelegationBindingsForVersion({
          parentAgentId: agent.id,
          agentVersionId: version.id,
          workspaceId,
          userId,
          bindings: delegationBindings ?? [],
          policy: normalizedOrchestrationPolicy,
          executor: tx,
        });
      }

      const accessAffectedUserIds = accessScope
        ? await applyAgentAccessSelection(
            {
              agentId: agent.id,
              userId,
              selection: { scope: accessScope, teamId: accessTeamId },
            },
            tx,
          )
        : [];

      const savedAgent = accessScope
        ? (
            await tx
              .select()
              .from(agents)
              .where(eq(agents.id, agent.id))
              .limit(1)
          )[0]
        : { ...agent, activeVersionId: version.id };
      return { agent: savedAgent, version, accessAffectedUserIds };
    },
  );

  await invalidateAgentAccessCache(agent.id, accessAffectedUserIds);

  await audit.emit({
    workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: userId,
    action: "agent.created",
    resourceType: "agent",
    resourceId: agent.id,
    outcome: "success",
    metadata: { name, slug, kind, sharingMode, accessScope },
  });

  logger.info("Agent created", { agentId: agent.id, userId });
  return { agent, version };
}

export async function getAgentById(
  agentId: string,
  workspaceId: string,
): Promise<typeof agents.$inferSelect | null> {
  const [agent] = await db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.id, agentId),
        eq(agents.workspaceId, workspaceId),
        isNull(agents.archivedAt),
      ),
    )
    .limit(1);

  return agent || null;
}
