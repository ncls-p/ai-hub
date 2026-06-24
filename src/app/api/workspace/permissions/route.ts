import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";

const WORKSPACE_SCOPE = "workspace";

const querySchema = z.object({
  workspaceId: z.uuid(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
    const isMember = await authorization.requireWorkspaceMember(
      session.user.id,
      workspaceId,
    );
    if (!isMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ctx = {
      principalType: "user" as const,
      principalId: session.user.id,
    };

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
    ] = await Promise.all([
      authorization.hasPermission(
        ctx,
        "usage.view",
        WORKSPACE_SCOPE,
        workspaceId,
      ),
      authorization.hasPermission(
        ctx,
        "audit.view",
        WORKSPACE_SCOPE,
        workspaceId,
      ),
      authorization.hasPermission(
        ctx,
        "providers.viewMetadata",
        WORKSPACE_SCOPE,
        workspaceId,
      ),
      authorization.hasPermission(
        ctx,
        "providers.update",
        WORKSPACE_SCOPE,
        workspaceId,
      ),
      authorization.hasPermission(
        ctx,
        "models.manage",
        WORKSPACE_SCOPE,
        workspaceId,
      ),
      authorization.hasPermission(
        ctx,
        "tools.configure",
        WORKSPACE_SCOPE,
        workspaceId,
      ),
      authorization.hasPermission(
        ctx,
        "tools.view",
        WORKSPACE_SCOPE,
        workspaceId,
      ),
      authorization.hasPermission(
        ctx,
        "mcpServers.get",
        WORKSPACE_SCOPE,
        workspaceId,
      ),
      authorization.hasPermission(
        ctx,
        "knowledgeBases.manage",
        WORKSPACE_SCOPE,
        workspaceId,
      ),
      authorization.hasPermission(
        ctx,
        "agents.create",
        WORKSPACE_SCOPE,
        workspaceId,
      ),
      authorization.hasPermission(
        ctx,
        "apiKeys.manage",
        WORKSPACE_SCOPE,
        workspaceId,
      ),
      authorization.hasPermission(
        ctx,
        "workspaces.update",
        WORKSPACE_SCOPE,
        workspaceId,
      ),
    ]);

    const canManageProviders = canManageProviderSettings && canManageModels;

    return NextResponse.json({
      canViewUsage,
      canViewAudit,
      canViewProviders,
      canManageProviders,
      canConfigureTools,
      canViewTools,
      canGetMcpServers,
      canManageKnowledgeBases,
      canCreateAgent,
      canManageApiKeys,
      canManageWorkspace,
    });
  } catch (error) {
    logHandledError("Failed to read workspace permissions", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
