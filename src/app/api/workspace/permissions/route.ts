import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute, requireWorkspaceMemberAsync } from "@/lib/route-handler";
import { authorization } from "@/server/domain/services/authorization";

const WORKSPACE_SCOPE = "workspace";
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
  "knowledgeBases.manage",
  "agents.create",
  "apiKeys.manage",
  "workspaces.update",
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
      const forbidden = await requireWorkspaceMemberAsync(
        session.user.id,
        workspaceId,
      );
      if (forbidden) return forbidden;

      const ctx = {
        principalType: "user" as const,
        principalId: session.user.id,
      };

      const results = await Promise.all(
        permissionNames.map((name) =>
          authorization.hasPermission(ctx, name, WORKSPACE_SCOPE, workspaceId),
        ),
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
        canManageKnowledgeBases,
        canCreateAgent,
        canManageApiKeys,
        canManageWorkspace,
      ] = results;

      return NextResponse.json({
        canViewUsage,
        canViewAudit,
        canViewProviders,
        canManageProviders: canManageProviderSettings && canManageModels,
        canConfigureTools,
        canViewTools,
        canGetMcpServers,
        canManageKnowledgeBases,
        canCreateAgent,
        canManageApiKeys,
        canManageWorkspace,
      });
    },
    { logLabel: "Failed to read workspace permissions" },
  );
}
