import { auth } from "@/lib/auth";
import { audit } from "@/server/domain/services/audit";
import { policyMutation } from "./policy-mutation";
import { requireDelegableMembership } from "./membership-grants";
import { validateInitialProjectRole } from "./member-access";
import {
  getWorkspaceScope,
  requirePermission,
} from "./use-cases.iam-operation-error";

export const createMemberAccount = policyMutation(
  async function createMemberAccount(input: {
    actorUserId: string;
    workspaceId: string;
    name: string;
    email: string;
    password: string;
    projectRoleId?: string;
  }) {
    const { organization } = await getWorkspaceScope(input.workspaceId);
    await requirePermission({
      userId: input.actorUserId,
      permission: "members.create",
      resourceType: "organization",
      resourceId: organization.id,
      errorMessage: "You cannot create accounts in this organization",
    });
    await requireDelegableMembership({
      ...input,
      organizationId: organization.id,
    });
    await validateInitialProjectRole({ ...input, userId: crypto.randomUUID() });
    // Trusted server provisioning after tenant authorization; never accepts a platform role.
    const { user } = await auth.api.createUser({
      body: {
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        password: input.password,
        role: "user",
      },
    });
    await audit.emit({
      organizationId: organization.id,
      workspaceId: input.workspaceId,
      actorPrincipalType: "user",
      actorPrincipalId: input.actorUserId,
      action: "organization.account.created",
      resourceType: "organization",
      resourceId: organization.id,
      outcome: "success",
      metadata: { memberUserId: user.id },
    });
    return { id: user.id };
  },
);
