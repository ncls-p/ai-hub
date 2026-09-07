import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { isPermissionAllowedByRequestScope } from "@/modules/auth/workspace-access";
import { getResourceAccessOptions } from "@/modules/iam/resource-access-scope";
import {
  authorization,
  matchesPermission,
} from "@/server/domain/services/authorization";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({ workspaceId: z.uuid() });

const permissionNames = [
  "usage.view",
  "audit.view",
  "providers.viewMetadata",
  "providers.update",
  "models.manage",
  "tools.configure",
  "tools.view",
  "mcpServers.get",
  "mcpServers.manage",
  "knowledgeBases.manage",
  "agents.create",
  "agents.delegate",
  "apiKeys.manage",
  "apiKeys.manageOwn",
  "workspaces.update",
  "workspaces.curate",
  "roles.get",
  "workflows.view",
] as const;

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = querySchema.safeParse({
        workspaceId: req.nextUrl.searchParams.get("workspaceId"),
      });
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }

      const { workspaceId } = parsed.data;
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        workspaceId,
        "workspaces.get",
      );
      if (forbidden) return forbidden;

      const [permissions, resourceAccessOptions] = await Promise.all([
        authorization.listPermissions(
          { principalType: "user", principalId: session.user.id },
          "workspace",
          workspaceId,
        ),
        getResourceAccessOptions(session.user.id, workspaceId),
      ]);
      const results = permissionNames.map(
        (name) =>
          isPermissionAllowedByRequestScope(workspaceId, name) &&
          permissions.some((permission) => matchesPermission(permission, name)),
      );

      const [
        canViewUsage,
        canViewAudit,
        canViewProviders,
        canManageProviderSettings,
        canManageModels,
        canConfigureTools,
        canViewTools,
        canGetMcpServers,
        canManageMcpServers,
        canManageKnowledgeBases,
        canCreateAgent,
        canDelegateAgents,
        canManageApiKeys,
        canManageOwnApiKeys,
        canManageWorkspace,
        canManageTenantGlobals,
        canReadAccess,
        canViewWorkflows,
      ] = results;

      return NextResponse.json({
        canViewUsage,
        canViewAudit,
        canViewProviders,
        canManageModels,
        canManageProviders: canManageProviderSettings && canManageModels,
        canConfigureTools,
        canViewTools,
        canGetMcpServers,
        canManageMcpServers,
        canManageKnowledgeBases,
        canCreateAgent,
        canDelegateAgents,
        canManageApiKeys: canManageApiKeys || canManageOwnApiKeys,
        canManageWorkspace,
        canManageTenantGlobals,
        canManageAccess: canReadAccess,
        canViewWorkflows,
        resourceAccessOptions,
      });
    },
    { logLabel: "Failed to read workspace permissions" },
  );
}
