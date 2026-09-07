import { findSystemRole } from "./use-cases.iam-operation-error";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  roleBindings,
  roles,
  workspaces,
} from "@/server/infrastructure/db/schema";
import {
  requireDelegablePermissions,
  rolePermissions,
} from "./use-cases.iam-operation-error";

/** Membership confers virtual-group grants even without an explicit role selection. */
export async function requireDelegableMembership(input: {
  actorUserId: string;
  organizationId: string;
}) {
  await requireDelegablePermissions({
    actorUserId: input.actorUserId,
    resourceType: "organization",
    resourceId: input.organizationId,
    permissions: rolePermissions(
      await findSystemRole("organization.user", input.organizationId),
    ),
  });
  const projects = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.organizationId, input.organizationId));
  const bindings = await db
    .select({ binding: roleBindings, role: roles })
    .from(roleBindings)
    .innerJoin(roles, eq(roles.id, roleBindings.roleId))
    .where(
      and(
        eq(roleBindings.principalType, "group"),
        inArray(roleBindings.principalId, [
          input.organizationId,
          ...projects.map(({ id }) => id),
        ]),
      ),
    );
  for (const { binding, role } of bindings)
    await requireDelegablePermissions({
      ...input,
      resourceType: binding.resourceType,
      resourceId: binding.resourceId,
      permissions: rolePermissions(role),
    });
}
