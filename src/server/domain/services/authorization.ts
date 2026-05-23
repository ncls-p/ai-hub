import { db } from "@/server/infrastructure/db";
import {
    roles,
    roleBindings,
    workspaceMembers,
} from "@/server/infrastructure/db/schema";
import { eq, and, or, isNull, gte } from "drizzle-orm";
import { cache } from "@/server/infrastructure/cache";
import { logger } from "@/lib/logger";

const PERMISSION_CACHE_TTL = 60; // 60 seconds

export type Permission = string;
export type PrincipalType = "user" | "group" | "service_account" | "api_key";
export type ResourceType =
    | "organization"
    | "workspace"
    | "agent"
    | "provider"
    | "mcp_server"
    | "knowledge_base"
    | "marketplace_item";

export interface AuthorizationContext {
    principalType: PrincipalType;
    principalId: string;
}

export interface PermissionCheckResult {
    granted: boolean;
    reason?: string;
}

function parsePermission(perm: string): { domain: string; action: string } {
    const [domain, action = "*"] = perm.split(".");
    return { domain, action };
}

export function matchesPermission(
    grantedPermission: string,
    requiredPermission: string,
): boolean {
    const { domain: grantedDomain, action: grantedAction } =
        parsePermission(grantedPermission);
    const { domain: requiredDomain, action: requiredAction } =
        parsePermission(requiredPermission);

    if (grantedDomain !== requiredDomain) return false;
    if (grantedAction === "*" || grantedAction === "manage") return true;
    return grantedAction === requiredAction;
}

async function resolvePermissions(
    ctx: AuthorizationContext,
    resourceType: ResourceType,
    resourceId: string,
): Promise<Permission[]> {
    const cacheKey = `perm:${ctx.principalType}:${ctx.principalId}:${resourceType}:${resourceId}`;
    const cached = await cache.get<Permission[]>(cacheKey);
    if (cached) return cached;

    const bindings = await db
        .select()
        .from(roleBindings)
        .innerJoin(roles, eq(roleBindings.roleId, roles.id))
        .where(
            and(
                eq(roleBindings.principalType, ctx.principalType),
                eq(roleBindings.principalId, ctx.principalId),
                eq(roleBindings.resourceType, resourceType),
                eq(roleBindings.resourceId, resourceId),
                or(
                    isNull(roleBindings.expiresAt),
                    gte(roleBindings.expiresAt, new Date()),
                ),
            ),
        );

    const permissions: Permission[] = [];
    for (const binding of bindings) {
        const perms = binding.roles.permissionsJson as Permission[];
        permissions.push(...perms);
    }

    await cache.set(cacheKey, permissions, PERMISSION_CACHE_TTL);
    return permissions;
}

export const authorization = {
    async requirePermission(
        ctx: AuthorizationContext,
        permission: string,
        resourceType: ResourceType,
        resourceId: string,
    ): Promise<PermissionCheckResult> {
        const permissions = await resolvePermissions(
            ctx,
            resourceType,
            resourceId,
        );
        const granted = permissions.some((p) =>
            matchesPermission(p, permission),
        );

        if (!granted) {
            logger.warn("Permission denied", {
                principal: ctx.principalId,
                permission,
                resourceType,
                resourceId,
            });
        }

        return {
            granted,
            reason: granted ? undefined : `Missing permission: ${permission}`,
        };
    },

    async hasPermission(
        ctx: AuthorizationContext,
        permission: string,
        resourceType: ResourceType,
        resourceId: string,
    ): Promise<boolean> {
        const result = await this.requirePermission(
            ctx,
            permission,
            resourceType,
            resourceId,
        );
        return result.granted;
    },

    async requireWorkspaceMember(
        userId: string,
        workspaceId: string,
    ): Promise<boolean> {
        const members = await db
            .select()
            .from(workspaceMembers)
            .where(
                and(
                    eq(workspaceMembers.userId, userId),
                    eq(workspaceMembers.workspaceId, workspaceId),
                    eq(workspaceMembers.status, "active"),
                ),
            );

        return members.length > 0;
    },

    async invalidatePermissionCache(
        principalId: string,
        resourceType: ResourceType,
        resourceId: string,
    ): Promise<void> {
        await cache.del(
            `perm:user:${principalId}:${resourceType}:${resourceId}`,
        );
    },
};
