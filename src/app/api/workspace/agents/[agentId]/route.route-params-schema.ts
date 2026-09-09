import {
  handleRoute,
  requireResourcePermissionAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import {
  delegationBindingInputSchema,
  orchestrationPolicySchema,
} from "@/modules/agent/orchestration-policy";
import {
  REASONING_PRESETS,
  reasoningPresetSchema,
} from "@/modules/agent/reasoning-presets";
import {
  canEditAgentForScope,
  getVisibleAgentById,
  normalizePromptSuggestions,
} from "@/modules/agent/use-cases";
import {
  AGENT_ACCESS_SCOPES,
  getAgentAccessOptions,
  getAgentAccessSelection,
} from "@/modules/agent/access-scope";
import { hasWorkspacePermissionForRequest } from "@/modules/auth/workspace-access";
import { withResourceProvenance } from "@/modules/iam/resource-provenance";
import { toolBindingInputSchema } from "@/modules/tool/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { users } from "@/server/infrastructure/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MAX_GENERATION_OUTPUT_TOKENS } from "@/modules/chat/conversation-context-policy";

export const routeParamsSchema = z.object({ agentId: z.uuid() });
export const workspaceQuerySchema = z.object({ workspaceId: z.uuid() });

export async function parseAgentRouteQuery(
  req: NextRequest,
  params: Promise<{ agentId: string }>,
) {
  const { searchParams } = req.nextUrl;
  return z.object({ agentId: z.uuid(), workspaceId: z.uuid() }).safeParse({
    ...(await params),
    workspaceId: searchParams.get("workspaceId"),
  });
}

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

export const updateAgentSchema = z.object({
  workspaceId: z.uuid(),
  baseVersionId: z.uuid().nullable(),
  name: z.string().min(1).max(255).optional(),
  slug: slugSchema.optional(),
  description: z.string().max(2048).optional().or(z.literal("")),
  logoUrl: agentLogoUrlSchema.optional(),
  systemPrompt: z.string().max(64_000).optional().or(z.literal("")),
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
  sharingMode: z.enum(["personal", "marketplace", "specific_user"]).optional(),
  shareTargetEmail: z.email().optional().or(z.literal("")),
  accessScope: z.enum(AGENT_ACCESS_SCOPES).optional(),
  accessTeamId: z.uuid().nullable().optional(),
  isGlobal: z.boolean().optional(),
  isRecommended: z.boolean().optional(),
  curationLabel: z
    .enum(["none", "recommended", "organization_created"])
    .optional(),
  toolBindings: z.array(toolBindingInputSchema).optional(),
  knowledgeBindings: z.array(z.uuid()).optional(),
  skillBindings: z.array(z.uuid()).optional(),
  orchestrationPolicy: orchestrationPolicySchema.optional(),
  delegationBindings: z.array(delegationBindingInputSchema).optional(),
  toolChoice: z.enum(["auto", "required", "none"]).optional(),
  generationSettings: z
    .object({
      topK: z.number().int().positive().optional(),
      presencePenalty: z.number().optional(),
      frequencyPenalty: z.number().optional(),
      seed: z.number().int().optional(),
      maxRetries: z.number().int().min(0).optional(),
      stopSequences: z.array(z.string()).optional(),
      reasoningPresets: z
        .array(reasoningPresetSchema)
        .max(REASONING_PRESETS.length)
        .optional(),
    })
    .optional(),
  responseFormat: z.enum(["text", "json_object"]).optional(),
  memoryPolicy: z
    .object({
      enabled: z.boolean().optional(),
      summaryThresholdTokens: z.number().int().min(1_000).optional(),
      summaryMaxTokens: z.number().int().min(128).optional(),
      contextWindowTokens: z
        .union([z.literal(0), z.number().int().min(2_000)])
        .optional(),
      maxMessages: z.number().int().min(2).optional(),
      maxInputCharacters: z.number().int().min(1).max(200_000).optional(),
    })
    .optional(),
  guardrails: z
    .object({
      enabled: z.boolean().optional(),
      blockedTopics: z.array(z.string()).optional(),
    })
    .optional(),
  approvalPolicy: z
    .object({
      requireApprovalForAllTools: z.boolean().optional(),
      defaultDecision: z.enum(["allow", "deny", "require_approval"]).optional(),
      requireApprovalRiskLevels: z
        .array(z.enum(["low", "medium", "high", "critical"]))
        .optional(),
      requireApprovalToolNames: z.array(z.string().min(1)).optional(),
      denyToolNames: z.array(z.string().min(1)).optional(),
      requireApprovalSources: z
        .enum(["builtin", "custom", "mcp"])
        .array()
        .optional(),
    })
    .optional(),
});

export { isUniqueConstraintError } from "@/lib/database-errors";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedRequest = await parseAgentRouteQuery(req, params);
      if (!parsedRequest.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const { agentId, workspaceId } = parsedRequest.data;
      const forbidden = await requireResourcePermissionAsync(
        session.user.id,
        workspaceId,
        "agents.get",
        "agent",
        agentId,
      );
      if (forbidden) return forbidden;
      const canAdminCurate = await canManageTenantGlobals(session, workspaceId);
      const agent = await getVisibleAgentById(
        agentId,
        workspaceId,
        session.user.id,
        canAdminCurate,
      );
      if (!agent) {
        return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      }
      let shareTargetEmail: string | null = null;
      if (agent.shareTargetUserId) {
        const [target] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, agent.shareTargetUserId))
          .limit(1);
        shareTargetEmail = target?.email ?? null;
      }
      const [canCreateAgent, canUpdateAgents] = await Promise.all([
        hasWorkspacePermissionForRequest(
          session.user.id,
          workspaceId,
          "agents.create",
        ),
        hasWorkspacePermissionForRequest(
          session.user.id,
          workspaceId,
          "agents.update",
        ),
      ]);
      const canDirectlyUpdate = await authorization.hasDirectPermission(
        { principalType: "user", principalId: session.user.id },
        "agents.update",
        "agent",
        agent.id,
        workspaceId,
      );
      const [agentWithProvenance] = await withResourceProvenance(
        [agent],
        workspaceId,
        session.user.id,
      );
      const [access, accessOptions] = await Promise.all([
        getAgentAccessSelection(agent),
        getAgentAccessOptions(session.user.id, workspaceId),
      ]);
      if (!accessOptions.scopes.includes(access.scope)) {
        accessOptions.scopes.push(access.scope);
      }
      return NextResponse.json({
        ...agentWithProvenance,
        promptSuggestions: normalizePromptSuggestions(
          agent.promptSuggestionsJson,
        ),
        canAdminCurate,
        canEdit:
          (canUpdateAgents &&
            (await canEditAgentForScope(
              agent,
              session.user.id,
              canAdminCurate,
            ))) ||
          canDirectlyUpdate,
        canClone: canCreateAgent,
        shareTargetEmail,
        access,
        accessOptions,
      });
    },
    { logLabel: "Failed to get agent" },
  );
}
