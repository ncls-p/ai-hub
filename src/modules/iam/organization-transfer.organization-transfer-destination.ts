import { SYSTEM_ROLES } from "@/server/domain/entities/iam";
import { requireDelegablePermissions } from "./use-cases.iam-operation-error";
import { createHash } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { getWorkspacesByUserId } from "@/modules/workspace/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { organizations, workspaces } from "@/server/infrastructure/db/schema";

import { IamOperationError } from "./use-cases";

export type OrganizationTransferDestination = {
  organizationId: string;
  organizationName: string;
  workspaceId: string;
  workspaceName: string;
};

export type OrganizationTransferPreview = {
  source: {
    organizationId: string;
    organizationName: string;
  };
  destination: OrganizationTransferDestination;
  counts: {
    projects: number;
    members: number;
    teams: number;
    roles: number;
    resources: number;
  };
  conflictResolutions: Array<{
    resourceType: "project" | "team" | "role";
    resourceId: string;
    label: string;
    from: string;
    to: string;
  }>;
  blockers: string[];
  warnings: string[];
  confirmationToken: string;
};

export async function scopeForWorkspace(workspaceId: string) {
  const [scope] = await db
    .select({
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      organizationId: organizations.id,
      organizationName: organizations.name,
    })
    .from(workspaces)
    .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
    .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.archivedAt)))
    .limit(1);
  if (!scope) throw new IamOperationError("Project not found", 404);
  return scope;
}

async function hasPermission(
  userId: string,
  permission: string,
  resourceType: "organization" | "workspace",
  resourceId: string,
) {
  return (
    await authorization.checkPermission(
      { principalType: "user", principalId: userId },
      permission,
      resourceType,
      resourceId,
    )
  ).granted;
}

export async function requireOrganizationTransferPermissions(input: {
  actorUserId: string;
  sourceWorkspaceId: string;
  sourceOrganizationId: string;
  targetWorkspaceId: string;
  targetOrganizationId: string;
}) {
  const checks = await Promise.all([
    hasPermission(
      input.actorUserId,
      "workspaces.transfer",
      "workspace",
      input.sourceWorkspaceId,
    ),
    hasPermission(
      input.actorUserId,
      "organization.transfer",
      "organization",
      input.sourceOrganizationId,
    ),
    hasPermission(
      input.actorUserId,
      "workspaces.transfer",
      "workspace",
      input.targetWorkspaceId,
    ),
    hasPermission(
      input.actorUserId,
      "organization.transfer",
      "organization",
      input.targetOrganizationId,
    ),
  ]);
  if (checks.some((allowed) => !allowed)) {
    throw new IamOperationError(
      "You need organization and project access administration rights on both sides",
      403,
    );
  }
  for (const resourceId of [
    input.sourceOrganizationId,
    input.targetOrganizationId,
  ]) {
    await requireDelegablePermissions({
      actorUserId: input.actorUserId,
      resourceType: "organization",
      resourceId,
      permissions: SYSTEM_ROLES.find(
        (role) => role.name === "organization.owner",
      )!.permissions,
    });
  }
}

export async function listOrganizationTransferDestinations(input: {
  actorUserId: string;
  sourceWorkspaceId: string;
}) {
  const source = await scopeForWorkspace(input.sourceWorkspaceId);
  const candidates = await getWorkspacesByUserId(input.actorUserId);
  const byOrganization = new Map<string, OrganizationTransferDestination>();
  for (const { workspace, organization } of candidates) {
    if (
      organization.id === source.organizationId ||
      byOrganization.has(organization.id)
    ) {
      continue;
    }
    const allowed = await Promise.all([
      hasPermission(
        input.actorUserId,
        "workspaces.transfer",
        "workspace",
        workspace.id,
      ),
      hasPermission(
        input.actorUserId,
        "organization.transfer",
        "organization",
        organization.id,
      ),
    ]);
    if (allowed.every(Boolean)) {
      byOrganization.set(organization.id, {
        organizationId: organization.id,
        organizationName: organization.name,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
      });
    }
  }
  return [...byOrganization.values()].sort((a, b) =>
    a.organizationName.localeCompare(b.organizationName),
  );
}

export function transferFingerprint(input: {
  sourceOrganizationId: string;
  targetOrganizationId: string;
  counts: OrganizationTransferPreview["counts"];
  blockers: string[];
  conflictResolutions: OrganizationTransferPreview["conflictResolutions"];
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        sourceOrganizationId: input.sourceOrganizationId,
        targetOrganizationId: input.targetOrganizationId,
        counts: input.counts,
        blockers: [...input.blockers].sort(),
        conflictResolutions: [...input.conflictResolutions].sort((a, b) =>
          `${a.resourceType}:${a.resourceId}`.localeCompare(
            `${b.resourceType}:${b.resourceId}`,
          ),
        ),
      }),
    )
    .digest("hex");
}

export function withNumericSuffix(
  value: string,
  suffix: number,
  maxLength: number,
) {
  const ending = `-${suffix}`;
  return `${value.slice(0, Math.max(1, maxLength - ending.length))}${ending}`;
}
