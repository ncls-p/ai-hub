import {
  and,
  eq,
  or,
  inArray,
  sql,
  type SQL,
  type AnyColumn,
} from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  knowledgeBases,
  mcpServers,
  organizationMembers,
  resourceOrganizationShares,
  roleBindings,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { findAccessResource } from "@/server/infrastructure/db/access-resource-repository";
import type { AccessResourceType } from "@/server/domain/entities/access-resource";

export const DISTRIBUTED_RESOURCE_PERMISSIONS: Partial<
  Record<AccessResourceType, readonly string[]>
> = {
  agent: ["agents.list", "agents.get", "agents.chat"],
  provider: ["providers.viewMetadata"],
  model: ["models.view", "models.invoke"],
  knowledge_base: ["knowledgeBases.viewAllowed"],
  mcp_server: ["mcpServers.get", "tools.view", "tools.executeRestricted"],
  skill: ["tools.view"],
  custom_tool: ["tools.view", "tools.executeRestricted"],
  workflow: ["workflows.view", "workflows.execute"],
};

/** Candidate rows only; callers must still check the user's read/use permission. */
export function resourceAvailabilityCondition(input: {
  type: AccessResourceType;
  id: AnyColumn;
  workspaceId: AnyColumn;
  activeWorkspaceId: string;
  visibility?: AnyColumn;
  providerId?: AnyColumn;
}): SQL {
  const organizationId = sql`(select organization_id from workspaces where id = ${input.activeWorkspaceId})`;
  return or(
    eq(input.workspaceId, input.activeWorkspaceId),
    sql`exists (select 1 from role_bindings b where b.principal_type = 'group' and b.principal_id = ${organizationId} and b.resource_type = ${input.type} and b.resource_id = ${input.id} and b.condition_json->>'source' = 'agent_scope' and (b.expires_at is null or b.expires_at > now()) and exists(select 1 from agents root where root.id::text = b.condition_json->>'rootAgentId' and root.archived_at is null))`,
    input.visibility
      ? and(
          eq(input.visibility, "organization"),
          sql`${input.workspaceId} in (select id from workspaces where organization_id = ${organizationId})`,
        )
      : undefined,
    input.providerId
      ? sql`exists (select 1 from resource_organization_shares s where s.resource_type = 'provider' and s.root_resource_type = 'provider' and s.resource_id = ${input.providerId} and s.organization_id = ${organizationId})`
      : undefined,
    sql`exists (select 1 from resource_organization_shares s where s.resource_type = ${input.type} and s.resource_id = ${input.id} and s.organization_id = ${organizationId} and (s.root_resource_type <> 'agent' or exists(select 1 from agents root where root.id = s.root_resource_id and root.archived_at is null)) and (s.root_resource_type <> 'model' or exists(select 1 from ai_models root where root.id = s.root_resource_id)))`,
  )!;
}

export async function distributedResourcePermissions(
  userId: string,
  type: AccessResourceType,
  id: string,
  activeWorkspaceId?: string,
): Promise<string[]> {
  const permissions = DISTRIBUTED_RESOURCE_PERMISSIONS[type];
  if (!permissions) return [];
  const resource = await findAccessResource(type, id);
  if (!resource) return [];
  const memberships = await db
    .select({ id: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.status, "active"),
      ),
    );
  const orgIds = new Set(memberships.map((row) => row.id));
  if (activeWorkspaceId) {
    const [active] = await db
      .select({ id: workspaces.organizationId })
      .from(workspaces)
      .where(eq(workspaces.id, activeWorkspaceId))
      .limit(1);
    if (!active || !orgIds.has(active.id)) return [];
    for (const id of orgIds) if (id !== active.id) orgIds.delete(id);
  }
  if (orgIds.size === 0) return [];
  const visibilityTable =
    type === "agent"
      ? agents
      : type === "knowledge_base"
        ? knowledgeBases
        : type === "mcp_server"
          ? mcpServers
          : null;
  if (visibilityTable && orgIds.has(resource.organizationId)) {
    const [row] = await db
      .select({ visibility: visibilityTable.visibility })
      .from(visibilityTable)
      .where(eq(visibilityTable.id, id))
      .limit(1);
    if (row?.visibility === "organization") return [...permissions];
  }
  const [organizationGrant] = await db
    .select({ id: roleBindings.id })
    .from(roleBindings)
    .where(
      and(
        eq(roleBindings.principalType, "group"),
        inArray(roleBindings.principalId, [...orgIds]),
        eq(roleBindings.resourceType, type),
        eq(roleBindings.resourceId, id),
        sql`${roleBindings.conditionJson}->>'source' = 'agent_scope'`,
        sql`exists(select 1 from agents root where root.id::text = ${roleBindings.conditionJson}->>'rootAgentId' and root.archived_at is null)`,
        sql`(${roleBindings.expiresAt} is null or ${roleBindings.expiresAt} > now())`,
      ),
    )
    .limit(1);
  if (organizationGrant) return [...permissions];
  const shares = await db
    .select({
      organizationId: resourceOrganizationShares.organizationId,
      rootType: resourceOrganizationShares.rootResourceType,
      rootId: resourceOrganizationShares.rootResourceId,
    })
    .from(resourceOrganizationShares)
    .where(
      and(
        or(
          and(
            eq(resourceOrganizationShares.resourceType, type),
            eq(resourceOrganizationShares.resourceId, id),
          ),
          type === "model" && resource.parent?.type === "provider"
            ? and(
                eq(resourceOrganizationShares.resourceType, "provider"),
                eq(resourceOrganizationShares.rootResourceType, "provider"),
                eq(resourceOrganizationShares.resourceId, resource.parent.id),
              )
            : undefined,
        ),
      ),
    );
  for (const share of shares) {
    if (
      orgIds.has(share.organizationId) &&
      (await findAccessResource(
        share.rootType as AccessResourceType,
        share.rootId,
      ))
    )
      return [...permissions];
  }
  return [];
}
