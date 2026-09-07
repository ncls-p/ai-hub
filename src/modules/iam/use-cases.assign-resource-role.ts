import { resolveStandardRole } from "./standard-role";
import { policyMutation } from "./policy-mutation";
import { requireSubordinatePrincipal } from "./delegation";
import { eq } from "drizzle-orm";

import { type AccessResourceType } from "@/server/domain/entities/access-resource";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { findAccessResource } from "@/server/infrastructure/db/access-resource-repository";
import {
  roleBindings,
  roles,
  teamMembers,
} from "@/server/infrastructure/db/schema";
import { listResourceShareTargets } from "./resource-sharing";
import {
  AssignmentPrincipalType,
  getWorkspaceScope,
  IamOperationError,
  requireDelegablePermissions,
  requirePermission,
  rolePermissions,
} from "./use-cases.iam-operation-error";
import { validateAssignmentPrincipal } from "./use-cases.validate-assignment-principal";

export async function assignResourceRole(input: {
  actorUserId: string;
  workspaceId: string;
  principalType: AssignmentPrincipalType;
  principalId: string;
  roleId: string;
  resourceType: AccessResourceType;
  resourceId: string;
  includeDependencies?: boolean;
}) {
  return assignResourceRoleToPrincipals({
    ...input,
    principalIds: [input.principalId],
  });
}

export const assignResourceRoleToPrincipals = policyMutation(
  async function assignResourceRoleToPrincipals(input: {
    actorUserId: string;
    workspaceId: string;
    principalType: AssignmentPrincipalType;
    principalIds: string[];
    roleId: string;
    resourceType: AccessResourceType;
    resourceId: string;
    includeDependencies?: boolean;
  }) {
    const principalIds = [...new Set(input.principalIds)];
    if (principalIds.length === 0) {
      throw new IamOperationError("Select at least one member or team");
    }

    const { organization } = await getWorkspaceScope(input.workspaceId);
    const [resource, foundRole] = await Promise.all([
      findAccessResource(input.resourceType, input.resourceId),
      db.select().from(roles).where(eq(roles.id, input.roleId)).limit(1),
    ]).then(
      ([foundResource, roleRows]) => [foundResource, roleRows[0]] as const,
    );
    const role = foundRole
      ? await resolveStandardRole(foundRole, "workspace", input.workspaceId)
      : undefined;
    if (!resource || resource.workspaceId !== input.workspaceId) {
      throw new IamOperationError("Resource not found in this project", 404);
    }
    if (
      !role ||
      role.scopeType !== "workspace" ||
      (!role.isSystem &&
        !(
          role.ownerResourceType === "workspace" &&
          role.ownerResourceId === input.workspaceId
        ))
    ) {
      throw new IamOperationError(
        "Only a project role can be assigned to a resource",
      );
    }

    await requirePermission({
      userId: input.actorUserId,
      permission: "roles.assign",
      resourceType: "workspace",
      resourceId: input.workspaceId,
      errorMessage: "You do not have permission to share project resources",
    });
    await requireDelegablePermissions({
      actorUserId: input.actorUserId,
      resourceType: "workspace",
      resourceId: input.workspaceId,
      permissions: rolePermissions(role),
    });

    const validPrincipals = await Promise.all(
      principalIds.map((principalId) =>
        validateAssignmentPrincipal({
          organizationId: organization.id,
          principalType: input.principalType,
          principalId,
        }),
      ),
    );
    if (validPrincipals.some((valid) => !valid)) {
      throw new IamOperationError(
        "A selected member or team is outside this organization",
      );
    }

    const targets = await listResourceShareTargets({
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      includeDependencies: input.includeDependencies,
    });
    let dependencyRole = role;
    if (targets.length > 1) {
      const [viewerRole] = await db
        .select()
        .from(roles)
        .where(eq(roles.name, "workspace.viewer"))
        .limit(1);
      if (
        !viewerRole ||
        !viewerRole.isSystem ||
        viewerRole.scopeType !== "workspace"
      ) {
        throw new IamOperationError(
          "The project viewer role required for dependency sharing is missing",
          409,
        );
      }
      const scopedViewerRole = await resolveStandardRole(
        viewerRole,
        "workspace",
        input.workspaceId,
      );
      await requireDelegablePermissions({
        actorUserId: input.actorUserId,
        resourceType: "workspace",
        resourceId: input.workspaceId,
        permissions: rolePermissions(scopedViewerRole),
      });
      dependencyRole = scopedViewerRole;
    }

    const targetScopes = await Promise.all(
      targets.map(async (target) => ({
        target,
        resource: await findAccessResource(target.type, target.id),
      })),
    );
    if (
      targetScopes.some(
        ({ resource: targetResource }) =>
          !targetResource || targetResource.workspaceId !== input.workspaceId,
      )
    ) {
      throw new IamOperationError(
        "A resource dependency is outside this project",
        409,
      );
    }

    for (const target of targets) {
      for (const principalId of principalIds) {
        await requireSubordinatePrincipal({
          ...input,
          principalId,
          resourceType: target.type,
          resourceId: target.id,
        });
      }
    }

    await db
      .insert(roleBindings)
      .values(
        principalIds.flatMap((principalId) =>
          targets.map((target) => ({
            principalType: input.principalType,
            principalId,
            roleId:
              target.type === input.resourceType &&
              target.id === input.resourceId
                ? role.id
                : dependencyRole.id,
            resourceType: target.type,
            resourceId: target.id,
            createdById: input.actorUserId,
          })),
        ),
      )
      .onConflictDoNothing();

    const affectedUserIds =
      input.principalType === "user"
        ? principalIds
        : (
            await Promise.all(
              principalIds.map((teamId) =>
                db
                  .select({ userId: teamMembers.userId })
                  .from(teamMembers)
                  .where(eq(teamMembers.teamId, teamId)),
              ),
            )
          )
            .flat()
            .map(({ userId }) => userId);
    await Promise.all(
      [...new Set(affectedUserIds)].flatMap((userId) =>
        targets.map((target) =>
          authorization.invalidatePermissionCache(
            userId,
            target.type,
            target.id,
          ),
        ),
      ),
    );
    await audit.emit({
      organizationId: organization.id,
      workspaceId: input.workspaceId,
      actorPrincipalType: "user",
      actorPrincipalId: input.actorUserId,
      action: "iam.resource_role.assigned",
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      outcome: "success",
      metadata: {
        roleId: role.id,
        dependencyRoleId: targets.length > 1 ? dependencyRole.id : undefined,
        principalType: input.principalType,
        principalIds,
        includeDependencies: Boolean(input.includeDependencies),
        sharedResourceCount: targets.length,
      },
    });

    return {
      principalCount: principalIds.length,
      resourceCount: targets.length,
    };
  },
);
