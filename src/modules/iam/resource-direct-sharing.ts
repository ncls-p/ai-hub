import { resolveStandardRole } from "./standard-role";
import { resourceDefinition } from "@/server/domain/entities/access-resource";
import { expandPermissionGrants } from "./permission-matching";
import { requireSubordinatePrincipal } from "./delegation";
import {
  requireDelegablePermissions,
  rolePermissions,
} from "./use-cases.iam-operation-error";
import { policyMutation } from "./policy-mutation";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { findAccessResource } from "@/server/infrastructure/db/access-resource-repository";
import {
  organizationMembers,
  roleBindings,
  roles,
  users,
} from "@/server/infrastructure/db/schema";
import type { AccessResourceType } from "@/server/domain/entities/access-resource";
import { SYSTEM_ROLES } from "@/server/domain/entities/iam";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { listResourceShareTargets } from "./resource-sharing";
import {
  getWorkspaceScope,
  IamOperationError,
} from "./use-cases.iam-operation-error";

const SHARE_PERMISSIONS = {
  agent: "agents.update",
  knowledge_base: "knowledgeBases.manage",
  mcp_server: "mcpServers.manage",
} as const satisfies Partial<Record<AccessResourceType, string>>;

export type DirectlyShareableResourceType = keyof typeof SHARE_PERMISSIONS;

export type DirectShareAccess = "view" | "edit";

export interface DirectShare {
  userId: string;
  access: DirectShareAccess;
}

const KNOWLEDGE_EDITOR_ROLE_NAME = "workspace.knowledge_editor";

async function sharingContext(
  input: {
    actorUserId: string;
    workspaceId: string;
    resourceType: DirectlyShareableResourceType;
    resourceId: string;
  },
  write = false,
) {
  const [{ organization }, resource, canManageProject, canManageResource] =
    await Promise.all([
      getWorkspaceScope(input.workspaceId),
      findAccessResource(input.resourceType, input.resourceId),
      Promise.all(
        (write ? ["roles.assign", "roles.revoke"] : ["roles.get"]).map(
          (permission) =>
            authorization.hasPermission(
              { principalType: "user", principalId: input.actorUserId },
              permission,
              "workspace",
              input.workspaceId,
            ),
        ),
      ).then((grants) => grants.every(Boolean)),
      authorization.hasDirectPermission(
        { principalType: "user", principalId: input.actorUserId },
        SHARE_PERMISSIONS[input.resourceType],
        input.resourceType,
        input.resourceId,
        input.workspaceId,
      ),
    ]);
  if (!resource || resource.workspaceId !== input.workspaceId) {
    throw new IamOperationError("Resource not found in this project", 404);
  }
  if (!canManageProject && !canManageResource) {
    throw new IamOperationError("You cannot share this resource", 403);
  }
  return { organization, resource };
}

async function ensureKnowledgeEditorRole(actorUserId: string) {
  const definition = SYSTEM_ROLES.find(
    ({ name }) => name === KNOWLEDGE_EDITOR_ROLE_NAME,
  );
  if (!definition) {
    throw new IamOperationError(
      "The project roles required for sharing are missing",
      409,
    );
  }
  // Existing databases were seeded before this role existed, so create it on
  // first use (same onConflictDoNothing + reselect pattern as seedSystemRoles).
  const [insertedRole] = await db
    .insert(roles)
    .values({
      scopeType: definition.scopeType,
      ownerResourceType: null,
      ownerResourceId: null,
      name: definition.name,
      displayName: definition.displayName,
      description: definition.description,
      permissionsJson: definition.permissions,
      isSystem: true,
      createdById: actorUserId,
    })
    .onConflictDoNothing()
    .returning();
  if (insertedRole) return insertedRole;
  const [existingRole] = await db
    .select()
    .from(roles)
    .where(
      and(
        eq(roles.scopeType, definition.scopeType),
        eq(roles.name, definition.name),
        eq(roles.isSystem, true),
      ),
    )
    .limit(1);
  if (!existingRole) {
    throw new IamOperationError(
      "The project roles required for sharing are missing",
      409,
    );
  }
  return existingRole;
}

async function sharingRoles(
  resourceType: DirectlyShareableResourceType,
  actorUserId: string,
  workspaceId: string,
) {
  const roleRows = await db
    .select()
    .from(roles)
    .where(
      and(
        inArray(roles.name, [
          "workspace.agent_user",
          "workspace.viewer",
          KNOWLEDGE_EDITOR_ROLE_NAME,
        ]),
        eq(roles.scopeType, "workspace"),
        eq(roles.isSystem, true),
      ),
    );
  const viewerRole = roleRows.find(({ name }) => name === "workspace.viewer");
  const rootRole =
    resourceType === "agent"
      ? roleRows.find(({ name }) => name === "workspace.agent_user")
      : viewerRole;
  if (!rootRole || !viewerRole) {
    throw new IamOperationError(
      "The project roles required for sharing are missing",
      409,
    );
  }
  const editorRole =
    resourceType === "knowledge_base"
      ? (roleRows.find(({ name }) => name === KNOWLEDGE_EDITOR_ROLE_NAME) ??
        (await ensureKnowledgeEditorRole(actorUserId)))
      : undefined;
  return {
    rootRole: await resolveStandardRole(rootRole, "workspace", workspaceId),
    viewerRole: await resolveStandardRole(viewerRole, "workspace", workspaceId),
    editorRole: editorRole
      ? await resolveStandardRole(editorRole, "workspace", workspaceId)
      : undefined,
  };
}

function directShareRoleIds(
  resourceType: DirectlyShareableResourceType,
  sharing: {
    rootRole: { id: string };
    viewerRole: { id: string };
    editorRole?: { id: string };
  },
) {
  if (resourceType === "agent") {
    return [sharing.rootRole.id, sharing.viewerRole.id];
  }
  if (resourceType === "knowledge_base" && sharing.editorRole) {
    return [sharing.rootRole.id, sharing.editorRole.id];
  }
  return [sharing.rootRole.id];
}

export async function getDirectResourceSharing(input: {
  actorUserId: string;
  workspaceId: string;
  resourceType: DirectlyShareableResourceType;
  resourceId: string;
}) {
  const { organization } = await sharingContext(input);
  const sharing = await sharingRoles(
    input.resourceType,
    input.actorUserId,
    input.workspaceId,
  );
  const [members, bindings] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .where(
        and(
          eq(organizationMembers.organizationId, organization.id),
          eq(organizationMembers.status, "active"),
        ),
      )
      .orderBy(asc(users.name), asc(users.email)),
    db
      .select({
        userId: roleBindings.principalId,
        roleId: roleBindings.roleId,
      })
      .from(roleBindings)
      .where(
        and(
          eq(roleBindings.resourceType, input.resourceType),
          eq(roleBindings.resourceId, input.resourceId),
          eq(roleBindings.grantSource, "direct"),
          eq(roleBindings.principalType, "user"),
          inArray(
            roleBindings.roleId,
            directShareRoleIds(input.resourceType, sharing),
          ),
        ),
      ),
  ]);
  const accessByUserId = new Map<string, DirectShareAccess>();
  for (const binding of bindings) {
    const access: DirectShareAccess =
      sharing.editorRole && binding.roleId === sharing.editorRole.id
        ? "edit"
        : "view";
    // A user bound to both roles keeps the strongest access.
    if (access === "edit" || !accessByUserId.has(binding.userId)) {
      accessByUserId.set(binding.userId, access);
    }
  }
  const candidateMembers = members.filter(({ id }) => id !== input.actorUserId);
  const projectAccess = await Promise.all(
    candidateMembers.map(({ id }) =>
      authorization.hasPermission(
        { principalType: "user", principalId: id },
        "workspaces.get",
        "workspace",
        input.workspaceId,
      ),
    ),
  );
  return {
    members: candidateMembers.filter((_, index) => projectAccess[index]),
    sharedUserIds: [...accessByUserId.keys()],
    shares: [...accessByUserId.entries()].map(([userId, access]) => ({
      userId,
      access,
    })),
  };
}

export const replaceDirectResourceSharing = policyMutation(
  async function replaceDirectResourceSharing(input: {
    actorUserId: string;
    workspaceId: string;
    resourceType: DirectlyShareableResourceType;
    resourceId: string;
    userIds?: string[];
    shares?: DirectShare[];
    includeDependencies?: boolean;
  }) {
    const requestedShares: DirectShare[] =
      input.shares ??
      (input.userIds ?? []).map((userId) => ({ userId, access: "view" }));
    const sharesByUserId = new Map<string, DirectShareAccess>();
    for (const { userId, access } of requestedShares) {
      if (userId === input.actorUserId) continue;
      // "edit" only applies to knowledge bases; other resources keep view-only shares.
      const effectiveAccess =
        input.resourceType === "knowledge_base" ? access : "view";
      if (effectiveAccess === "edit" || !sharesByUserId.has(userId)) {
        sharesByUserId.set(userId, effectiveAccess);
      }
    }
    const shares = [...sharesByUserId.entries()].map(([userId, access]) => ({
      userId,
      access,
    }));
    const userIds = shares.map(({ userId }) => userId);
    const { organization } = await sharingContext(input, true);
    const sharing = await sharingRoles(
      input.resourceType,
      input.actorUserId,
      input.workspaceId,
    );
    const { rootRole, viewerRole, editorRole } = sharing;
    if (userIds.length > 0) {
      const validMembers = await db
        .select({ userId: organizationMembers.userId })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, organization.id),
            eq(organizationMembers.status, "active"),
            inArray(organizationMembers.userId, userIds),
          ),
        );
      if (validMembers.length !== userIds.length) {
        throw new IamOperationError(
          "A selected member is outside this organization",
          400,
        );
      }
      const projectAccess = await Promise.all(
        userIds.map((userId) =>
          authorization.hasPermission(
            { principalType: "user", principalId: userId },
            "workspaces.get",
            "workspace",
            input.workspaceId,
          ),
        ),
      );
      if (projectAccess.some((granted) => !granted)) {
        throw new IamOperationError(
          "A selected member does not have access to this project",
          400,
        );
      }
    }

    const previousBindings = await db
      .select({ userId: roleBindings.principalId, roleId: roleBindings.roleId })
      .from(roleBindings)
      .where(
        and(
          eq(roleBindings.resourceType, input.resourceType),
          eq(roleBindings.resourceId, input.resourceId),
          eq(roleBindings.grantSource, "direct"),
          eq(roleBindings.principalType, "user"),
          inArray(
            roleBindings.roleId,
            directShareRoleIds(input.resourceType, sharing),
          ),
        ),
      );
    const targets = await listResourceShareTargets({
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      includeDependencies:
        input.resourceType === "agent" && input.includeDependencies !== false,
    });
    const affectedUserIds = [
      ...new Set([...previousBindings.map(({ userId }) => userId), ...userIds]),
    ];
    for (const target of targets) {
      const resource = await findAccessResource(target.type, target.id);
      if (!resource || resource.workspaceId !== input.workspaceId)
        throw new IamOperationError(
          "A dependency is outside this project",
          409,
        );
      const domains = resourceDefinition(target.type)?.permissionDomains ?? [];
      const candidateRoles =
        target.type === input.resourceType && target.id === input.resourceId
          ? [
              rootRole,
              ...(editorRole &&
              (shares.some(({ access }) => access === "edit") ||
                previousBindings.some(({ roleId }) => roleId === editorRole.id))
                ? [editorRole]
                : []),
            ]
          : [viewerRole];
      for (const role of candidateRoles) {
        await requireDelegablePermissions({
          actorUserId: input.actorUserId,
          resourceType: target.type,
          resourceId: target.id,
          permissions: expandPermissionGrants(rolePermissions(role)).filter(
            (permission) => domains.includes(permission.split(".")[0]),
          ),
        });
      }
      for (const userId of affectedUserIds) {
        await requireSubordinatePrincipal({
          actorUserId: input.actorUserId,
          principalType: "user",
          principalId: userId,
          resourceType: target.type,
          resourceId: target.id,
        });
      }
    }
    await db.transaction(async (tx) => {
      await tx
        .delete(roleBindings)
        .where(
          and(
            eq(roleBindings.principalType, "user"),
            or(
              and(
                eq(roleBindings.resourceType, input.resourceType),
                eq(roleBindings.resourceId, input.resourceId),
                eq(roleBindings.grantSource, "direct"),
                inArray(
                  roleBindings.roleId,
                  directShareRoleIds(input.resourceType, sharing),
                ),
              ),
              input.resourceType === "agent"
                ? and(
                    sql`${roleBindings.conditionJson}->>'source' = 'agent_direct_share'`,
                    sql`${roleBindings.conditionJson}->>'rootAgentId' = ${input.resourceId}`,
                  )
                : undefined,
            ),
          ),
        );

      if (shares.length > 0) {
        await tx
          .insert(roleBindings)
          .values(
            shares.flatMap(({ userId, access }) =>
              targets.map((target) => ({
                principalType: "user" as const,
                principalId: userId,
                roleId:
                  target.type === input.resourceType &&
                  target.id === input.resourceId
                    ? access === "edit" && editorRole
                      ? editorRole.id
                      : rootRole.id
                    : viewerRole.id,
                resourceType: target.type,
                resourceId: target.id,
                grantSource:
                  target.type === input.resourceType &&
                  target.id === input.resourceId
                    ? "direct"
                    : `agent:${input.resourceId}`,
                conditionJson:
                  input.resourceType === "agent"
                    ? {
                        source: "agent_direct_share",
                        rootAgentId: input.resourceId,
                      }
                    : undefined,
                createdById: input.actorUserId,
              })),
            ),
          )
          .onConflictDoNothing();
      }
    });

    await Promise.all(
      affectedUserIds.map((userId) =>
        authorization.invalidatePrincipalPermissionCache(userId),
      ),
    );
    await audit.emit({
      organizationId: organization.id,
      workspaceId: input.workspaceId,
      actorPrincipalType: "user",
      actorPrincipalId: input.actorUserId,
      action: "iam.resource_direct_sharing.replaced",
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      outcome: "success",
      metadata: {
        userIds,
        ...(input.resourceType === "knowledge_base"
          ? {
              access: {
                view: shares
                  .filter(({ access }) => access === "view")
                  .map(({ userId }) => userId),
                edit: shares
                  .filter(({ access }) => access === "edit")
                  .map(({ userId }) => userId),
              },
            }
          : {}),
        includeDependencies:
          input.resourceType === "agent" && input.includeDependencies !== false,
        sharedResourceCount: targets.length,
      },
    });
    return { userIds, resourceCount: targets.length };
  },
);
