import {
  handleRoute,
  requireRequestPermissionScopeAsync,
  requireWorkspaceMemberAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import {
  canEditAgentForScope,
  getAgentDefaultPreferences,
  listAgents,
  normalizePromptSuggestions,
} from "@/modules/agent/use-cases";
import { getAgentAccessOptions } from "@/modules/agent/access-scope";
import { hasWorkspacePermissionForRequest } from "@/modules/auth/workspace-access";
import { withResourceProvenance } from "@/modules/iam/resource-provenance";
import { getToolBindingsForVersion } from "@/modules/tool/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { NextRequest, NextResponse } from "next/server";
import {
  getModelMetaByVersionId,
  listAgentsSchema,
} from "./route.create-agent-schema";

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const { searchParams } = req.nextUrl;
      const parsed = listAgentsSchema.safeParse({
        workspaceId: searchParams.get("workspaceId"),
        includeModelMeta: searchParams.get("includeModelMeta") === "true",
      });
      if (!parsed.success) {
        return NextResponse.json(
          { error: "workspaceId must be a valid UUID" },
          { status: 400 },
        );
      }
      const { workspaceId, includeModelMeta } = parsed.data;
      const scopeForbidden = await requireRequestPermissionScopeAsync(
        session.user.id,
        workspaceId,
        "agents.list",
      );
      if (scopeForbidden) return scopeForbidden;
      const forbidden = await requireWorkspaceMemberAsync(
        session.user.id,
        workspaceId,
      );
      if (forbidden) return forbidden;
      const canAdminCurate = await canManageTenantGlobals(session, workspaceId);
      const [
        canCreateAgent,
        canUpdateAgents,
        canManageProviderSettings,
        canManageModels,
        canExportResources,
        canImportResources,
        accessOptions,
      ] = await Promise.all([
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
        hasWorkspacePermissionForRequest(
          session.user.id,
          workspaceId,
          "providers.update",
        ),
        hasWorkspacePermissionForRequest(
          session.user.id,
          workspaceId,
          "models.manage",
        ),
        hasWorkspacePermissionForRequest(
          session.user.id,
          workspaceId,
          "marketplaceItems.publish",
        ),
        hasWorkspacePermissionForRequest(
          session.user.id,
          workspaceId,
          "marketplaceItems.install",
        ),
        getAgentAccessOptions(session.user.id, workspaceId),
      ]);
      const canManageProviders = canManageProviderSettings && canManageModels;
      const list = await listAgents(
        workspaceId,
        session.user.id,
        canAdminCurate,
      );
      const defaultPreferences = await getAgentDefaultPreferences(
        workspaceId,
        session.user.id,
        new Set(list.map((agent) => agent.id)),
      );
      const modelMetaByVersionId = includeModelMeta
        ? await getModelMetaByVersionId(
            list.map((agent) => agent.activeVersionId).filter(Boolean),
          )
        : new Map<
            string,
            { displayName: string | null; logoUrl: string | null }
          >();
      const toolCountByVersionId = new Map<string, number>();
      if (includeModelMeta) {
        await Promise.all(
          list
            .map((agent) => agent.activeVersionId)
            .filter((versionId): versionId is string => Boolean(versionId))
            .map(async (versionId) => {
              const bindings = await getToolBindingsForVersion(versionId, {
                workspaceId,
                userId: session.user.id,
              });
              toolCountByVersionId.set(versionId, bindings.length);
            }),
        );
      }
      const directlyEditableAgentIds =
        await authorization.listDirectlyAuthorizedResourceIds(
          { principalType: "user", principalId: session.user.id },
          "agents.update",
          "agent",
          list.map(({ id }) => id),
          workspaceId,
        );
      const agentsWithAccess = await Promise.all(
        list.map(async (agent) => ({
          ...agent,
          hiddenInChat: defaultPreferences.hiddenAgentIds.includes(agent.id),
          promptSuggestions: normalizePromptSuggestions(
            agent.promptSuggestionsJson,
          ),
          ...(agent.activeVersionId
            ? {
                modelDisplayName: modelMetaByVersionId.get(
                  agent.activeVersionId,
                )?.displayName,
                modelLogoUrl: modelMetaByVersionId.get(agent.activeVersionId)
                  ?.logoUrl,
                toolCount: toolCountByVersionId.get(agent.activeVersionId) ?? 0,
              }
            : {}),
          canEdit:
            (canUpdateAgents &&
              (await canEditAgentForScope(
                agent,
                session.user.id,
                canAdminCurate,
              ))) ||
            directlyEditableAgentIds.has(agent.id),
          canClone: canCreateAgent,
        })),
      );
      const agentsWithProvenance = await withResourceProvenance(
        agentsWithAccess,
        workspaceId,
        session.user.id,
      );
      return NextResponse.json({
        agents: agentsWithProvenance,
        canAdminCurate,
        canCreateAgent,
        canManageProviders,
        canExportResources,
        canImportResources,
        accessOptions,
        ...defaultPreferences,
      });
    },
    { logLabel: "Failed to list agents" },
  );
}
