import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  agentSkills,
  customTools,
  mcpServers,
  knowledgeBases,
} from "@/server/infrastructure/db/schema";
import { authorization } from "@/server/domain/services/authorization";
import {
  hasResourcePermissionForRequest,
  hasWorkspacePermissionForRequest,
} from "@/modules/auth/workspace-access";
import type { AccessResourceType } from "@/server/domain/entities/access-resource";
import type { MarketplaceManifest } from "@/modules/marketplace/manifest-types";
import { ResourcePackageError } from "./schema";

const readPermissions: Partial<Record<AccessResourceType, string>> = {
  agent: "agents.get",
  skill: "tools.view",
  custom_tool: "tools.view",
  mcp_server: "mcpServers.get",
  knowledge_base: "knowledgeBases.viewAllowed",
  provider: "providers.viewMetadata",
  model: "models.view",
};

export async function requirePackageResourceAccess(input: {
  workspaceId: string;
  userId: string;
  resourceType: AccessResourceType;
  resourceId: string;
}) {
  const permission = readPermissions[input.resourceType];
  const visibilityTables = {
    agent: agents,
    skill: agentSkills,
    custom_tool: customTools,
    mcp_server: mcpServers,
    knowledge_base: knowledgeBases,
  };
  if (input.resourceType in visibilityTables) {
    const table =
      visibilityTables[input.resourceType as keyof typeof visibilityTables];
    const [resource] = await db
      .select({ createdById: table.createdById, isGlobal: table.isGlobal })
      .from(table)
      .where(
        and(
          eq(table.id, input.resourceId),
          eq(table.workspaceId, input.workspaceId),
          isNull(table.archivedAt),
        ),
      )
      .limit(1);
    if (
      !resource ||
      (resource.createdById !== input.userId &&
        !resource.isGlobal &&
        !(await authorization.hasDirectPermission(
          { principalType: "user", principalId: input.userId },
          permission!,
          input.resourceType,
          input.resourceId,
          input.workspaceId,
        )))
    )
      throw new ResourcePackageError(
        "A resource or dependency is not available for export",
        403,
      );
  }
  if (
    !permission ||
    !(await hasResourcePermissionForRequest(
      input.userId,
      input.workspaceId,
      permission,
      input.resourceType,
      input.resourceId,
    ))
  )
    throw new ResourcePackageError(
      "A resource or dependency is not available for export",
      403,
    );
}

export async function requirePackageInstallPermissions(
  manifest: MarketplaceManifest,
  workspaceId: string,
  userId: string,
) {
  const permissions = new Set<string>(["marketplaceItems.install"]);
  const pending = [manifest];
  while (pending.length) {
    const current = pending.pop()!;
    if (current.type === "agent") {
      permissions.add("agents.create");
      if (current.skillBindings?.some((binding) => binding.bundled))
        permissions.add("tools.configure");
      for (const specialist of current.specialists ?? [])
        pending.push(specialist.manifest);
      if (current.bundledResources?.skills.length)
        permissions.add("tools.configure");
      pending.push(
        ...(current.bundledResources?.mcpPresets ?? []),
        ...(current.bundledResources?.customTools ?? []),
      );
    } else if (current.type === "mcp_preset")
      permissions.add("mcpServers.manage");
    else permissions.add("tools.configure");
  }
  for (const permission of permissions) {
    if (
      !(await hasWorkspacePermissionForRequest(userId, workspaceId, permission))
    )
      throw new ResourcePackageError(`Missing permission: ${permission}`, 403);
  }
}
