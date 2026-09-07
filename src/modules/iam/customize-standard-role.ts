import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import { roleBindings, roles } from "@/server/infrastructure/db/schema";
import { findAccessResource } from "@/server/infrastructure/db/access-resource-repository";
import { isOrganizationOwner } from "./organization-owner";
import { IamOperationError } from "./use-cases.iam-operation-error";
import { standardRoleName } from "./standard-role";

/** Editing a preset replaces it in this tenant scope, preserving assignments atomically. */
export async function customizeStandardRole(input: {
  actorUserId: string;
  workspaceId: string;
  organizationId: string;
  role: typeof roles.$inferSelect;
  displayName: string;
  description?: string;
  permissions: string[];
}) {
  const { role } = input;
  if (role.name === "organization.owner")
    throw new IamOperationError(
      "The owner always retains full control. Assign another owner before leaving.",
      409,
    );
  if (
    !(await isOrganizationOwner(
      input.actorUserId,
      "organization",
      input.organizationId,
    ))
  )
    throw new IamOperationError(
      "Only an organization owner can customize a standard role",
      403,
    );
  const scopeType =
    role.scopeType === "organization" ? "organization" : "workspace";
  const scopeId =
    scopeType === "organization" ? input.organizationId : input.workspaceId;
  const name = standardRoleName(role.name);
  const [existing] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(
      and(
        eq(roles.name, name),
        eq(roles.ownerResourceType, scopeType),
        eq(roles.ownerResourceId, scopeId),
      ),
    )
    .limit(1);
  if (existing)
    throw new IamOperationError(
      "This role changed. Reload access before saving.",
      409,
    );
  const bindings = await db
    .select()
    .from(roleBindings)
    .where(eq(roleBindings.roleId, role.id));
  const scopedBindings: typeof bindings = [];
  for (const binding of bindings) {
    if (binding.resourceType === scopeType && binding.resourceId === scopeId)
      scopedBindings.push(binding);
    else if (
      scopeType === "workspace" &&
      binding.resourceType !== "workspace" &&
      binding.resourceType !== "organization" &&
      (await findAccessResource(binding.resourceType, binding.resourceId))
        ?.workspaceId === scopeId
    )
      scopedBindings.push(binding);
  }
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .insert(roles)
      .values({
        scopeType,
        ownerResourceType: scopeType,
        ownerResourceId: scopeId,
        name,
        displayName: input.displayName.trim(),
        description: input.description?.trim() || null,
        permissionsJson: input.permissions,
        isSystem: false,
        createdById: input.actorUserId,
      })
      .returning();
    if (scopedBindings.length)
      await tx
        .update(roleBindings)
        .set({ roleId: updated.id })
        .where(
          inArray(
            roleBindings.id,
            scopedBindings.map(({ id }) => id),
          ),
        );
    return updated;
  });
}
