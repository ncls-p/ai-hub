import { and, eq } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  organizations,
  organizationMembers,
  users,
} from "@/server/infrastructure/db/schema";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { IamOperationError } from "@/modules/iam/use-cases.iam-operation-error";
import { policyMutation } from "@/modules/iam/policy-mutation";
/** Platform administrators can grant organization membership without a project role. */
export const addOrganizationUser = policyMutation(
  async (input: {
    actorUserId: string;
    organizationId: string;
    email: string;
  }) => {
    const [actor] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, input.actorUserId))
      .limit(1);
    if (actor?.role !== "admin") throw new IamOperationError("Forbidden", 403);
    const [organization] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, input.organizationId))
      .limit(1);
    if (!organization)
      throw new IamOperationError("Organization not found", 404);
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email.trim().toLowerCase()))
      .limit(1);
    if (!user)
      throw new IamOperationError("No account matches this email", 404);
    const [existing] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, input.organizationId),
          eq(organizationMembers.userId, user.id),
        ),
      )
      .limit(1);
    if (existing && existing.status !== "active")
      throw new IamOperationError(
        "Reactivate this member through organization access management",
        409,
      );
    if (!existing)
      await db
        .insert(organizationMembers)
        .values({
          organizationId: input.organizationId,
          userId: user.id,
          status: "active",
        })
        .onConflictDoNothing();
    await authorization.invalidatePrincipalPermissionCache(user.id);
    await audit.emit({
      actorPrincipalType: "user",
      actorPrincipalId: input.actorUserId,
      organizationId: input.organizationId,
      action: "organization.member.added",
      resourceType: "organization",
      resourceId: input.organizationId,
      outcome: "success",
      metadata: { userId: user.id },
    });
    return { userId: user.id };
  },
);
