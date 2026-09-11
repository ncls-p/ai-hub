import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  organizations,
  organizationMembers,
  roles,
  roleBindings,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { SYSTEM_ROLES } from "@/server/domain/entities/iam";
import { authorization } from "@/server/domain/services/authorization";
import { audit } from "@/server/domain/services/audit";
import {
  normalizedSlug,
  IamOperationError,
} from "@/modules/iam/use-cases.iam-operation-error";
import { createWorkspace } from "@/modules/workspace/use-cases";

export async function createOrganizationOnly(
  userId: string,
  name: string,
  slug?: string,
) {
  const owner = SYSTEM_ROLES.find(
    (role) => role.name === "organization.owner",
  )!;
  const organization = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(organizations)
      .values({
        name: name.trim(),
        slug:
          slug?.trim() ||
          `${normalizedSlug(name).slice(0, 80) || "organization"}-${crypto.randomUUID()}`,
      })
      .returning();
    await tx
      .insert(organizationMembers)
      .values({ organizationId: created.id, userId, status: "active" });
    await tx
      .insert(roles)
      .values({
        scopeType: owner.scopeType,
        name: owner.name,
        displayName: owner.displayName,
        description: owner.description,
        permissionsJson: owner.permissions,
        isSystem: true,
        createdById: userId,
      })
      .onConflictDoNothing();
    const [role] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.name, owner.name), eq(roles.isSystem, true)))
      .limit(1);
    await tx.insert(roleBindings).values({
      principalType: "user",
      principalId: userId,
      roleId: role.id,
      resourceType: "organization",
      resourceId: created.id,
      createdById: userId,
    });
    return created;
  });
  await authorization.invalidatePrincipalPermissionCache(userId);
  await audit.emit({
    actorPrincipalType: "user",
    actorPrincipalId: userId,
    organizationId: organization.id,
    action: "organization.created",
    resourceType: "organization",
    resourceId: organization.id,
    outcome: "success",
  });
  return organization;
}

export async function listManagedOrganizations(
  userId: string,
  platformAdmin: boolean,
) {
  const memberships = await db
    .select({ id: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.status, "active"),
      ),
    );
  if (!platformAdmin && !memberships.length) return [];
  const rows = await db
    .select()
    .from(organizations)
    .where(
      platformAdmin
        ? undefined
        : inArray(
            organizations.id,
            memberships.map((row) => row.id),
          ),
    )
    .orderBy(organizations.name);
  const projects = rows.length
    ? await db
        .select({
          id: workspaces.id,
          name: workspaces.name,
          organizationId: workspaces.organizationId,
        })
        .from(workspaces)
        .where(
          inArray(
            workspaces.organizationId,
            rows.map((row) => row.id),
          ),
        )
    : [];
  const visibleProjects = platformAdmin
    ? projects
    : (
        await Promise.all(
          projects.map(async (project) =>
            (await authorization.requireWorkspaceMember(userId, project.id))
              ? project
              : null,
          ),
        )
      ).filter((project) => project !== null);
  return Promise.all(
    rows.map(async (organization) => ({
      canManageMembers: platformAdmin,
      id: organization.id,
      name: organization.name,
      projects: visibleProjects.filter(
        (project) => project.organizationId === organization.id,
      ),
      canCreateProject:
        platformAdmin ||
        (await authorization.hasPermission(
          { principalType: "user", principalId: userId },
          "workspaces.create",
          "organization",
          organization.id,
        )),
    })),
  );
}

export async function createOrganizationProject(input: {
  userId: string;
  organizationId: string;
  name: string;
  platformAdmin: boolean;
}) {
  if (
    !input.platformAdmin &&
    !(await authorization.hasPermission(
      { principalType: "user", principalId: input.userId },
      "workspaces.create",
      "organization",
      input.organizationId,
    ))
  )
    throw new IamOperationError("Forbidden", 403);
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, input.organizationId))
    .limit(1);
  if (!organization) throw new IamOperationError("Organization not found", 404);
  return createWorkspace({
    userId: input.userId,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    workspaceName: input.name,
    workspaceSlug: `${normalizedSlug(input.name).slice(0, 80) || "project"}-${crypto.randomUUID()}`,
  });
}
