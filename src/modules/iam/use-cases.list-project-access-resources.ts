import { and, eq } from "drizzle-orm";

import {
  ACCESS_RESOURCE_DEFINITIONS,
  type AccessResourceType,
} from "@/server/domain/entities/access-resource";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  findAccessResource,
  listAccessResources,
} from "@/server/infrastructure/db/access-resource-repository";
import { roleBindings, roles } from "@/server/infrastructure/db/schema";
import { getAccessConsoleSnapshot } from "./use-cases.get-access-console-snapshot";
import { IamOperationError } from "./use-cases.iam-operation-error";

export async function listProjectAccessResources(input: {
  userId: string;
  workspaceId: string;
  resourceType: AccessResourceType;
  search?: string;
  offset?: number;
  limit?: number;
}) {
  const access = await authorization.checkPermission(
    { principalType: "user", principalId: input.userId },
    "roles.get",
    "workspace",
    input.workspaceId,
  );
  if (!access.granted) {
    throw new IamOperationError(
      "You cannot manage resource access in this project",
      403,
    );
  }
  const result = await listAccessResources({
    workspaceId: input.workspaceId,
    type: input.resourceType,
    search: input.search,
    offset: input.offset,
    limit: input.limit,
  });
  return {
    ...result,
    resourceDefinitions: ACCESS_RESOURCE_DEFINITIONS,
  };
}

export async function getResourceAccessSnapshot(input: {
  userId: string;
  workspaceId: string;
  resourceType: AccessResourceType;
  resourceId: string;
}) {
  const [snapshot, resource] = await Promise.all([
    getAccessConsoleSnapshot({
      userId: input.userId,
      workspaceId: input.workspaceId,
    }),
    findAccessResource(input.resourceType, input.resourceId),
  ]);
  if (!resource || resource.workspaceId !== input.workspaceId) {
    throw new IamOperationError("Resource not found in this project", 404);
  }

  const directBindings = await db
    .select({ binding: roleBindings, role: roles })
    .from(roleBindings)
    .innerJoin(roles, eq(roleBindings.roleId, roles.id))
    .where(
      and(
        eq(roleBindings.resourceType, input.resourceType),
        eq(roleBindings.resourceId, input.resourceId),
      ),
    );
  const memberNames = new Map(
    snapshot.members.map((member) => [
      member.userId,
      { name: member.name, email: member.email },
    ]),
  );
  const teamNames = new Map(
    snapshot.teams.map((team) => [team.id, { name: team.name }]),
  );
  const directAssignments = directBindings.map(({ binding, role }) => {
    const member =
      binding.principalType === "user"
        ? memberNames.get(binding.principalId)
        : undefined;
    const team =
      binding.principalType === "group"
        ? teamNames.get(binding.principalId)
        : undefined;
    return {
      id: binding.id,
      principalType:
        binding.principalType === "group"
          ? ("team" as const)
          : binding.principalType,
      principalId: binding.principalId,
      principalName: member?.name ?? team?.name ?? "Unknown principal",
      principalDetail: member?.email,
      roleId: role.id,
      roleName: role.displayName,
      roleKey: role.name,
      scope: "resource" as const,
      inherited: false,
    };
  });
  const permissionDomains =
    ACCESS_RESOURCE_DEFINITIONS.find(
      (definition) => definition.type === input.resourceType,
    )?.permissionDomains ?? [];

  return {
    resource,
    organization: snapshot.organization,
    activeProject: snapshot.activeProject,
    members: snapshot.members,
    teams: snapshot.teams,
    roles: snapshot.roles.filter(
      (role) =>
        role.scopeType === "workspace" &&
        snapshot.assignableRoleIds.includes(role.id) &&
        role.permissions.some((permission) =>
          permissionDomains.includes(permission.split(".")[0]),
        ),
    ),
    assignments: [...snapshot.assignments, ...directAssignments],
    capabilities: {
      canManageResourceAccess: snapshot.capabilities.canManageProjectAccess,
    },
  };
}
