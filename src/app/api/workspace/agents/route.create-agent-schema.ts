import { ONBOARDING_TOOL_PRESET } from "@/modules/agent/onboarding-tools";
import { AGENT_ACCESS_SCOPES } from "@/modules/agent/access-scope";
import {
  delegationBindingInputSchema,
  orchestrationPolicySchema,
} from "@/modules/agent/orchestration-policy";
import { db } from "@/server/infrastructure/db";
import { agentVersions, aiModels } from "@/server/infrastructure/db/schema";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { MAX_GENERATION_OUTPUT_TOKENS } from "@/modules/chat/conversation-context-policy";

const slugSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9-]+$/);
const agentLogoUrlSchema = z
  .string()
  .max(350_000)
  .regex(
    /^data:image\/(?!svg\+xml)[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/,
  )
  .nullable();

const promptSuggestionsSchema = z
  .array(z.string().trim().min(1).max(240))
  .max(12);

export const createAgentSchema = z
  .object({
    name: z.string().min(1).max(255),
    slug: slugSchema,
    kind: z.enum(["assistant", "orchestrator"]).default("assistant"),
    description: z.string().max(2048).optional(),
    logoUrl: agentLogoUrlSchema.optional(),
    workspaceId: z.uuid(),
    systemPrompt: z.string().max(64_000).optional(),
    promptSuggestions: promptSuggestionsSchema.optional(),
    providerId: z.uuid().optional(),
    modelId: z.uuid().optional(),
    temperature: z.string().optional(),
    topP: z.string().optional(),
    maxOutputTokens: z
      .number()
      .int()
      .min(0)
      .max(MAX_GENERATION_OUTPUT_TOKENS)
      .optional(),
    maxToolCalls: z.number().int().min(0).optional(),
    sharingMode: z
      .enum(["personal", "marketplace", "specific_user"])
      .default("personal"),
    shareTargetEmail: z.email().optional(),
    accessScope: z.enum(AGENT_ACCESS_SCOPES).optional(),
    accessTeamId: z.uuid().optional(),
    isGlobal: z.boolean().optional(),
    isRecommended: z.boolean().optional(),
    curationLabel: z
      .enum(["none", "recommended", "organization_created"])
      .optional(),
    toolPreset: z.literal(ONBOARDING_TOOL_PRESET).optional(),
    toolBindings: z
      .array(
        z.object({
          toolSource: z.literal("builtin").default("builtin"),
          toolId: z.uuid(),
          requireApproval: z.boolean().optional(),
        }),
      )
      .optional(),
    knowledgeBindings: z.array(z.uuid()).optional(),
    skillBindings: z.array(z.uuid()).optional(),
    orchestrationPolicy: orchestrationPolicySchema.optional(),
    delegationBindings: z.array(delegationBindingInputSchema).optional(),
  })
  .superRefine((input, context) => {
    if (input.toolPreset && input.toolBindings !== undefined) {
      context.addIssue({
        code: "custom",
        message: "toolPreset cannot be combined with toolBindings",
        path: ["toolBindings"],
      });
    }
    if (input.accessScope === "team" && !input.accessTeamId) {
      context.addIssue({
        code: "custom",
        message: "A team is required",
        path: ["accessTeamId"],
      });
    }
  });

export const listAgentsSchema = z.object({
  workspaceId: z.uuid(),
  includeModelMeta: z.boolean().optional(),
});

export { isUniqueConstraintError } from "@/lib/database-errors";

export async function getModelMetaByVersionId(
  versionIds: Array<string | null | undefined>,
) {
  const ids = Array.from(
    new Set(versionIds.filter((id): id is string => Boolean(id))),
  );
  const meta = new Map<
    string,
    { displayName: string | null; logoUrl: string | null }
  >();
  if (ids.length === 0) return meta;

  const versions = await db
    .select({ id: agentVersions.id, modelId: agentVersions.modelId })
    .from(agentVersions)
    .where(inArray(agentVersions.id, ids));
  const modelIds = Array.from(
    new Set(
      versions
        .map((version) => version.modelId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const modelRows = modelIds.length
    ? await db
        .select({
          id: aiModels.id,
          modelId: aiModels.modelId,
          displayName: aiModels.displayName,
          logoUrl: aiModels.logoUrl,
        })
        .from(aiModels)
        .where(inArray(aiModels.id, modelIds))
    : [];
  const modelsById = new Map(modelRows.map((model) => [model.id, model]));

  for (const version of versions) {
    const model = version.modelId ? modelsById.get(version.modelId) : null;
    meta.set(version.id, {
      displayName: model?.displayName || model?.modelId || null,
      logoUrl: model?.logoUrl ?? null,
    });
  }

  return meta;
}
