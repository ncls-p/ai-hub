import { createHash } from "node:crypto";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  organizations,
  workspaces,
  workspaceMembers,
  organizationMembers,
  roleBindings,
  roles,
  teams,
  teamMembers,
} from "@/server/infrastructure/db/schema";
import { authorization } from "@/server/domain/services/authorization";
import { SYSTEM_ROLES } from "@/server/domain/entities/iam";
import { requireDelegablePermissions } from "./use-cases.iam-operation-error";
import { IamOperationError } from "./use-cases";
import { requireTransferPermission } from "./resource-transfer.transfer-access-policies";
import { scopeForWorkspace } from "./organization-transfer.organization-transfer-destination";
import { expandTransferGraph } from "./resource-transfer.expand-transfer-graph";
import { hydrateItems } from "./resource-transfer.hydrate-items";
import { planConflictResolutions } from "./organization-transfer.plan-conflict-resolutions";

export type ProjectTransferInput = {
  actorUserId: string;
  sourceWorkspaceId: string;
  targetOrganizationId: string;
};
async function requireOrganizationPermission(
  actorUserId: string,
  organizationId: string,
) {
  const result = await authorization.checkPermission(
    { principalType: "user", principalId: actorUserId },
    "organization.transfer",
    "organization",
    organizationId,
  );
  if (!result.granted)
    throw new IamOperationError(
      "Organization transfer permission is required on both sides",
      403,
    );
  await requireDelegablePermissions({
    actorUserId,
    resourceType: "organization",
    resourceId: organizationId,
    permissions: SYSTEM_ROLES.find((r) => r.name === "organization.owner")!
      .permissions,
  });
}
export async function listProjectTransferDestinations(
  input: Omit<ProjectTransferInput, "targetOrganizationId">,
) {
  const source = await scopeForWorkspace(input.sourceWorkspaceId);
  await requireTransferPermission(input.actorUserId, input.sourceWorkspaceId);
  await requireOrganizationPermission(input.actorUserId, source.organizationId);
  const rows = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .orderBy(asc(organizations.name));
  const allowed = [];
  for (const row of rows) {
    if (row.id === source.organizationId) continue;
    try {
      await requireOrganizationPermission(input.actorUserId, row.id);
      allowed.push(row);
    } catch (error) {
      if (!(error instanceof IamOperationError) || error.status !== 403)
        throw error;
    }
  }
  return allowed;
}
export async function planProjectTransfer(input: ProjectTransferInput) {
  const source = await scopeForWorkspace(input.sourceWorkspaceId);
  await requireTransferPermission(input.actorUserId, input.sourceWorkspaceId);
  await requireOrganizationPermission(input.actorUserId, source.organizationId);
  await requireOrganizationPermission(
    input.actorUserId,
    input.targetOrganizationId,
  );
  const [destination] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, input.targetOrganizationId));
  if (!destination)
    throw new IamOperationError("Destination organization not found", 404);
  if (destination.id === source.organizationId)
    throw new IamOperationError("Choose another organization", 400);
  const [project] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, input.sourceWorkspaceId));
  const items = await hydrateItems(
    await expandTransferGraph(project.id, {
      type: "workspace",
      id: project.id,
      reason: "selected",
    }),
    project.id,
  );
  const filters = [{ type: "workspace" as const, id: project.id }, ...items];
  const bindings = await db
    .select()
    .from(roleBindings)
    .where(
      or(
        ...filters.map((item) =>
          and(
            eq(roleBindings.resourceType, item.type),
            eq(roleBindings.resourceId, item.id),
          ),
        ),
      ),
    )
    .orderBy(asc(roleBindings.id));
  const groupIds = bindings
    .filter((b) => b.principalType === "group")
    .map((b) => b.principalId);
  const linkedTeams = groupIds.length
    ? await db
        .select()
        .from(teams)
        .where(
          and(
            eq(teams.organizationId, source.organizationId),
            inArray(teams.id, groupIds),
          ),
        )
        .orderBy(asc(teams.id))
    : [];
  const memberships = linkedTeams.length
    ? await db
        .select()
        .from(teamMembers)
        .where(
          inArray(
            teamMembers.teamId,
            linkedTeams.map((t) => t.id),
          ),
        )
        .orderBy(asc(teamMembers.id))
    : [];
  const activeMembers = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, project.id),
        eq(workspaceMembers.status, "active"),
      ),
    );
  const sourceMembers = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, source.organizationId),
        eq(organizationMembers.status, "active"),
      ),
    );
  const activeIds = new Set(sourceMembers.map((m) => m.userId));
  const memberIds = [
    ...new Set([
      ...activeMembers.map((m) => m.userId),
      ...memberships.map((m) => m.userId),
      ...bindings
        .filter((b) => b.principalType === "user")
        .map((b) => b.principalId),
    ]),
  ]
    .filter((id) => activeIds.has(id))
    .sort();
  if (memberIds.length) {
    const targetMembers = await db
      .select({ status: organizationMembers.status })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, destination.id),
          inArray(organizationMembers.userId, memberIds),
        ),
      );
    if (targetMembers.some((member) => member.status !== "active"))
      throw new IamOperationError(
        "A project member is suspended or removed in the destination organization. Review their membership before transferring.",
        409,
      );
  }
  const roleIds = [...new Set(bindings.map((b) => b.roleId))];
  const customRoles = roleIds.length
    ? await db
        .select()
        .from(roles)
        .where(
          and(
            inArray(roles.id, roleIds),
            eq(roles.isSystem, false),
            eq(roles.ownerResourceType, "organization"),
            eq(roles.ownerResourceId, source.organizationId),
          ),
        )
        .orderBy(asc(roles.id))
    : [];
  const targetProjects = await db
    .select({ slug: workspaces.slug })
    .from(workspaces)
    .where(eq(workspaces.organizationId, destination.id));
  const targetTeams = await db
    .select({ slug: teams.slug })
    .from(teams)
    .where(eq(teams.organizationId, destination.id));
  const projectRoles = await db
    .select({ name: roles.name })
    .from(roles)
    .where(
      and(
        eq(roles.ownerResourceType, "workspace"),
        eq(roles.ownerResourceId, project.id),
      ),
    );
  const conflictResolutions = [
    ...planConflictResolutions({
      resourceType: "project",
      maxLength: 128,
      source: [{ id: project.id, value: project.slug, label: project.name }],
      targetValues: targetProjects.map((p) => p.slug),
    }),
    ...planConflictResolutions({
      resourceType: "team",
      maxLength: 128,
      source: linkedTeams.map((t) => ({
        id: t.id,
        value: t.slug,
        label: t.name,
      })),
      targetValues: targetTeams.map((t) => t.slug),
    }),
    ...planConflictResolutions({
      resourceType: "role",
      maxLength: 128,
      source: customRoles.map((r) => ({
        id: r.id,
        value: r.name,
        label: r.displayName,
      })),
      targetValues: projectRoles.map((r) => r.name),
    }),
  ];
  const counts = {
    projects: 1,
    resources: items.length,
    members: memberIds.length,
    teams: linkedTeams.length,
    roles: customRoles.length,
  };
  const confirmationToken = createHash("sha256")
    .update(
      JSON.stringify({
        source,
        project,
        destination,
        items,
        bindings,
        linkedTeams,
        memberships,
        memberIds,
        customRoles,
        conflictResolutions,
      }),
    )
    .digest("hex");
  return {
    source,
    destination,
    project,
    items,
    bindings,
    linkedTeams,
    memberships,
    memberIds,
    customRoles,
    conflictResolutions,
    counts,
    confirmationToken,
  };
}
export async function previewProjectTransfer(input: ProjectTransferInput) {
  const plan = await planProjectTransfer(input);
  return {
    source: plan.source,
    destination: plan.destination,
    counts: plan.counts,
    conflictResolutions: plan.conflictResolutions,
    confirmationToken: plan.confirmationToken,
  };
}
