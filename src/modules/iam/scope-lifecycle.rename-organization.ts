import { policyMutation } from "./policy-mutation";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";

import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
  organizations,
  roleBindings,
  roles,
  workspaces,
} from "@/server/infrastructure/db/schema";

import {
  invalidateOrganizationMembers,
  listAllResourceIds,
  normalizedSlug,
  requirePermission,
  scopeForWorkspace,
} from "./scope-lifecycle.normalized-slug";
import { IamOperationError } from "./use-cases";

export async function renameOrganization(input: {
  actorUserId: string;
  workspaceId: string;
  name: string;
  slug?: string;
}) {
  const { workspace, organization } = await scopeForWorkspace(
    input.workspaceId,
  );
  await requirePermission({
    actorUserId: input.actorUserId,
    permission: "organization.update",
    resourceType: "organization",
    resourceId: organization.id,
  });
  const slug = normalizedSlug(input.slug ?? input.name);
  if (!slug) throw new IamOperationError("Enter a valid organization URL", 400);
  const [conflict] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(eq(organizations.slug, slug), ne(organizations.id, organization.id)),
    )
    .limit(1);
  if (conflict) {
    throw new IamOperationError("This organization URL is already in use", 409);
  }
  const [updated] = await db
    .update(organizations)
    .set({ name: input.name.trim(), slug, updatedAt: new Date() })
    .where(eq(organizations.id, organization.id))
    .returning();
  await audit.emit({
    organizationId: organization.id,
    workspaceId: workspace.id,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "organization.updated",
    resourceType: "organization",
    resourceId: organization.id,
    outcome: "success",
    metadata: {
      previousName: organization.name,
      previousSlug: organization.slug,
      name: updated.name,
      slug: updated.slug,
    },
  });
  return updated;
}

export const deleteProject = policyMutation(
  async function deleteProject(input: {
    actorUserId: string;
    workspaceId: string;
    confirmationName: string;
  }) {
    const { workspace, organization } = await scopeForWorkspace(
      input.workspaceId,
    );
    await requirePermission({
      actorUserId: input.actorUserId,
      permission: "workspaces.delete",
      resourceType: "workspace",
      resourceId: workspace.id,
    });
    if (input.confirmationName.trim() !== workspace.name) {
      throw new IamOperationError(
        "Type the exact project name to confirm",
        400,
      );
    }
    const activeProjects = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(
        and(
          eq(workspaces.organizationId, organization.id),
          isNull(workspaces.archivedAt),
        ),
      );
    if (activeProjects.length === 1) {
      throw new IamOperationError(
        "This is the organization’s last project. Delete the organization instead.",
        409,
      );
    }
    const [resourceIds, customRoles] = await Promise.all([
      listAllResourceIds([workspace.id]),
      db
        .select({ id: roles.id })
        .from(roles)
        .where(
          and(
            eq(roles.isSystem, false),
            eq(roles.ownerResourceType, "workspace"),
            eq(roles.ownerResourceId, workspace.id),
          ),
        ),
    ]);
    const customRoleIds = customRoles.map(({ id }) => id);
    await db.transaction(async (tx) => {
      if (customRoleIds.length > 0) {
        await tx
          .delete(roleBindings)
          .where(inArray(roleBindings.roleId, customRoleIds));
        await tx.delete(roles).where(inArray(roles.id, customRoleIds));
      }
      const boundResourceIds = [workspace.id, ...resourceIds];
      if (boundResourceIds.length > 0) {
        await tx
          .delete(roleBindings)
          .where(inArray(roleBindings.resourceId, boundResourceIds));
      }
      await tx.delete(workspaces).where(eq(workspaces.id, workspace.id));
    });
    await invalidateOrganizationMembers(organization.id);
    await audit.emit({
      organizationId: organization.id,
      actorPrincipalType: "user",
      actorPrincipalId: input.actorUserId,
      action: "workspace.deleted",
      resourceType: "workspace",
      resourceId: workspace.id,
      outcome: "success",
      metadata: { name: workspace.name, slug: workspace.slug },
    });
    return {
      nextWorkspaceId:
        activeProjects.find(({ id }) => id !== workspace.id)?.id ?? null,
    };
  },
);
