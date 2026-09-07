import { createHash } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { getWorkspacesByUserId } from "@/modules/workspace/use-cases";
import {
  ACCESS_RESOURCE_TYPES,
  type AccessResourceType,
} from "@/server/domain/entities/access-resource";
import { db } from "@/server/infrastructure/db";
import { findAccessResource } from "@/server/infrastructure/db/access-resource-repository";
import { roleBindings, workspaces } from "@/server/infrastructure/db/schema";
import {
  MemberTransferMode,
  ProjectDestination,
  getProjectScope,
  hasPermission,
  listDestinationRoles,
} from "./member-transfer.member-transfer-modes";
import { IamOperationError } from "./use-cases";

export async function listMemberTransferDestinations(input: {
  userId: string;
  sourceWorkspaceId: string;
}): Promise<ProjectDestination[]> {
  const source = await getProjectScope(input.sourceWorkspaceId);
  if (
    !(await hasPermission(
      input.userId,
      "roles.get",
      "workspace",
      input.sourceWorkspaceId,
    ))
  ) {
    throw new IamOperationError(
      "You cannot transfer members from this project",
      403,
    );
  }
  const candidates = await getWorkspacesByUserId(input.userId);
  const destinations = await Promise.all(
    candidates
      .filter(({ workspace }) => workspace.id !== input.sourceWorkspaceId)
      .map(async ({ workspace, organization }) => {
        const crossOrganization = organization.id !== source.organization.id;
        const allowed = await hasPermission(
          input.userId,
          "roles.assign",
          "workspace",
          workspace.id,
        );
        const canAddMembers =
          !crossOrganization ||
          (await hasPermission(
            input.userId,
            "members.create",
            "organization",
            organization.id,
          ));
        if (!allowed || !canAddMembers) return null;
        return {
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          organizationId: organization.id,
          organizationName: organization.name,
          crossOrganization,
          roles: await listDestinationRoles(workspace.id, organization.id),
        };
      }),
  );
  return destinations
    .filter((item): item is ProjectDestination => Boolean(item))
    .sort(
      (a, b) =>
        a.organizationName.localeCompare(b.organizationName) ||
        a.workspaceName.localeCompare(b.workspaceName),
    );
}

export function fingerprint(input: {
  sourceWorkspaceId: string;
  targetWorkspaceId: string;
  userIds: string[];
  roleId: string;
  mode: MemberTransferMode;
  stateIds: string[];
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        sourceWorkspaceId: input.sourceWorkspaceId,
        targetWorkspaceId: input.targetWorkspaceId,
        userIds: [...input.userIds].sort(),
        roleId: input.roleId,
        mode: input.mode,
        stateIds: [...input.stateIds].sort(),
      }),
    )
    .digest("hex");
}

const accessResourceTypes = new Set<string>(ACCESS_RESOURCE_TYPES);

export async function listSourceBindings(input: {
  userIds: string[];
  sourceWorkspaceId: string;
  sourceOrganizationId: string;
  includeWholeOrganization: boolean;
}) {
  const sourceWorkspaceIds = input.includeWholeOrganization
    ? (
        await db
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.organizationId, input.sourceOrganizationId))
      ).map(({ id }) => id)
    : [input.sourceWorkspaceId];
  const sourceWorkspaceIdSet = new Set(sourceWorkspaceIds);
  const candidates = await db
    .select({
      id: roleBindings.id,
      roleId: roleBindings.roleId,
      resourceType: roleBindings.resourceType,
      resourceId: roleBindings.resourceId,
    })
    .from(roleBindings)
    .where(
      and(
        eq(roleBindings.principalType, "user"),
        inArray(roleBindings.principalId, input.userIds),
      ),
    );
  const resolved = await Promise.all(
    candidates.map(async (binding) => {
      if (binding.resourceType === "organization") {
        return input.includeWholeOrganization &&
          binding.resourceId === input.sourceOrganizationId
          ? binding
          : null;
      }
      if (binding.resourceType === "workspace") {
        return sourceWorkspaceIdSet.has(binding.resourceId) ? binding : null;
      }
      if (!accessResourceTypes.has(binding.resourceType)) return null;
      const resource = await findAccessResource(
        binding.resourceType as AccessResourceType,
        binding.resourceId,
      );
      return resource && sourceWorkspaceIdSet.has(resource.workspaceId)
        ? binding
        : null;
    }),
  );
  return resolved.filter((binding): binding is NonNullable<typeof binding> =>
    Boolean(binding),
  );
}
