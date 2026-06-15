import { logger } from "@/lib/logger";
import { SYSTEM_ROLES } from "@/server/domain/entities/iam";
import { cache } from "@/server/infrastructure/cache";
import { db } from "@/server/infrastructure/db";
import {
	roles,
	roleBindings,
	workspaceMembers,
} from "@/server/infrastructure/db/schema";
import { and, eq, gte, isNull, or } from "drizzle-orm";

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

const SYSTEM_ROLE_PERMISSIONS = new Map(
	SYSTEM_ROLES.map((role) => [role.name, role.permissions]),
);

const DOMAIN_ALIASES: Record<string, string> = {
	auditLogs: "audit",
	marketplaceItems: "marketplace",
	workspace: "workspaces",
};

const WORKSPACE_ADMIN_GRANTS = new Set(["owner", "admin"]);

const VIEW_ACTIONS = new Set([
	"get",
	"list",
	"view",
	"viewAllowed",
	"viewLimited",
	"viewMetadata",
	"viewOwn",
	"viewShared",
]);

function parsePermission(perm: string): { domain: string; action: string } {
	const [domain, action = "*"] = perm.split(".");
	return {
		domain: DOMAIN_ALIASES[domain] ?? domain,
		action,
	};
}

export function matchesPermission(
	grantedPermission: string,
	requiredPermission: string,
): boolean {
	const { domain: grantedDomain, action: grantedAction } =
		parsePermission(grantedPermission);
	const { domain: requiredDomain, action: requiredAction } =
		parsePermission(requiredPermission);

	if (
		grantedDomain === "workspaces" &&
		(grantedAction === "*" || WORKSPACE_ADMIN_GRANTS.has(grantedAction))
	) {
		return true;
	}

	if (grantedDomain !== requiredDomain) return false;
	if (grantedAction === "*" || grantedAction === "manage") return true;
	if (grantedAction === "view" && VIEW_ACTIONS.has(requiredAction)) return true;
	return grantedAction === requiredAction;
}

async function isActiveWorkspaceMember(userId: string, workspaceId: string) {
	const [member] = await db
		.select({ id: workspaceMembers.id })
		.from(workspaceMembers)
		.where(
			and(
				eq(workspaceMembers.userId, userId),
				eq(workspaceMembers.workspaceId, workspaceId),
				eq(workspaceMembers.status, "active"),
			),
		)
		.limit(1);

	return Boolean(member);
}

function addRolePermissions(
	permissions: Permission[],
	role: { name: string; permissionsJson: unknown },
) {
	const dbPermissions = Array.isArray(role.permissionsJson)
		? (role.permissionsJson as Permission[])
		: [];
	permissions.push(...dbPermissions);

	const currentSystemPermissions = SYSTEM_ROLE_PERMISSIONS.get(role.name);
	if (currentSystemPermissions) {
		permissions.push(...currentSystemPermissions);
	}
}

function uniquePermissions(permissions: Permission[]) {
	return [...new Set(permissions)];
}

async function resolvePermissions(
	ctx: AuthorizationContext,
	resourceType: ResourceType,
	resourceId: string,
): Promise<Permission[]> {
	const cacheKey = `perm:${ctx.principalType}:${ctx.principalId}:${resourceType}:${resourceId}`;
	const cached = await cache.get<Permission[]>(cacheKey);
	if (cached) return cached;

	if (
		resourceType === "workspace" &&
		ctx.principalType === "user" &&
		!(await isActiveWorkspaceMember(ctx.principalId, resourceId))
	) {
		await cache.set(cacheKey, [], PERMISSION_CACHE_TTL);
		return [];
	}

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
		addRolePermissions(permissions, binding.roles);
	}

	if (
		permissions.length === 0 &&
		resourceType === "workspace" &&
		ctx.principalType === "user"
	) {
		permissions.push(
			...(SYSTEM_ROLE_PERMISSIONS.get("workspace.member") ?? []),
		);
	}

	const resolvedPermissions = uniquePermissions(permissions);
	await cache.set(cacheKey, resolvedPermissions, PERMISSION_CACHE_TTL);
	return resolvedPermissions;
}

export const authorization = {
	async checkPermission(
		ctx: AuthorizationContext,
		permission: string,
		resourceType: ResourceType,
		resourceId: string,
	): Promise<PermissionCheckResult> {
		const permissions = await resolvePermissions(ctx, resourceType, resourceId);
		const granted = permissions.some((p) => matchesPermission(p, permission));

		return {
			granted,
			reason: granted ? undefined : `Missing permission: ${permission}`,
		};
	},

	async requirePermission(
		ctx: AuthorizationContext,
		permission: string,
		resourceType: ResourceType,
		resourceId: string,
	): Promise<PermissionCheckResult> {
		const result = await this.checkPermission(
			ctx,
			permission,
			resourceType,
			resourceId,
		);

		if (!result.granted) {
			logger.warn("Permission denied", {
				principal: ctx.principalId,
				permission,
				resourceType,
				resourceId,
			});
		}

		return result;
	},

	async hasPermission(
		ctx: AuthorizationContext,
		permission: string,
		resourceType: ResourceType,
		resourceId: string,
	): Promise<boolean> {
		const result = await this.checkPermission(
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
		return isActiveWorkspaceMember(userId, workspaceId);
	},

	async invalidatePermissionCache(
		principalId: string,
		resourceType: ResourceType,
		resourceId: string,
	): Promise<void> {
		await cache.del(`perm:user:${principalId}:${resourceType}:${resourceId}`);
	},
};
