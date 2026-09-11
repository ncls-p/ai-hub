import { createOrganizationOnly } from "@/modules/organization/organization-management";
import { createMemberAccount } from "@/modules/iam/use-cases.create-member-account";
import { updateTeam } from "@/modules/iam/use-cases.update-team";
import { NextRequest, NextResponse } from "next/server";

import { handleRoute } from "@/lib/route-handler";
import {
  deleteOrganization,
  deleteProject,
  renameOrganization,
  renameProject,
} from "@/modules/iam/scope-lifecycle";
import {
  addOrganizationMember,
  addTeamMember,
  assignResourceRole,
  assignResourceRoleToPrincipals,
  assignRole,
  createCustomRole,
  createOrganizationWithProject,
  createProject,
  createTeam,
  deleteCustomRole,
  deleteTeam,
  removeOrganizationMember,
  removeRoleAssignment,
  removeTeamMember,
  updateCustomRole,
} from "@/modules/iam/use-cases";
import { expectedIamError, mutationSchema } from "./route.mutation-schema";

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = mutationSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }

      const input = parsed.data;
      switch (input.action) {
        case "createAccount":
          return NextResponse.json(
            {
              user: await createMemberAccount({
                ...input,
                actorUserId: session.user.id,
              }),
            },
            { status: 201 },
          );
        case "updateTeam":
          await updateTeam({ ...input, actorUserId: session.user.id });
          break;
        case "createOrganization": {
          if (!input.projectName)
            return NextResponse.json(
              {
                organization: await createOrganizationOnly(
                  session.user.id,
                  input.organizationName,
                  input.organizationSlug,
                ),
                project: null,
              },
              { status: 201 },
            );
          const project = await createOrganizationWithProject({
            userId: session.user.id,
            organizationName: input.organizationName,
            organizationSlug: input.organizationSlug,
            projectName: input.projectName,
            projectSlug: input.projectSlug,
          });
          return NextResponse.json({ project }, { status: 201 });
        }
        case "createProject": {
          const project = await createProject({
            userId: session.user.id,
            workspaceId: input.workspaceId,
            name: input.name,
            slug: input.slug,
          });
          return NextResponse.json({ project }, { status: 201 });
        }
        case "renameProject": {
          const project = await renameProject({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            name: input.name,
            slug: input.slug,
          });
          return NextResponse.json({ project });
        }
        case "renameOrganization": {
          const organization = await renameOrganization({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            name: input.name,
            slug: input.slug,
          });
          return NextResponse.json({ organization });
        }
        case "deleteProject":
          return NextResponse.json(
            await deleteProject({
              actorUserId: session.user.id,
              workspaceId: input.workspaceId,
              confirmationName: input.confirmationName,
            }),
          );
        case "deleteOrganization":
          return NextResponse.json(
            await deleteOrganization({
              actorUserId: session.user.id,
              workspaceId: input.workspaceId,
              confirmationName: input.confirmationName,
            }),
          );
        case "addMember":
          await addOrganizationMember({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            email: input.email,
            projectRoleId: input.projectRoleId,
          });
          break;
        case "removeMember":
          await removeOrganizationMember({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            userId: input.userId,
          });
          break;
        case "createTeam":
          await createTeam({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            name: input.name,
            description: input.description,
          });
          break;
        case "addTeamMember":
          await addTeamMember({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            teamId: input.teamId,
            userId: input.userId,
          });
          break;
        case "removeTeamMember":
          await removeTeamMember({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            teamId: input.teamId,
            userId: input.userId,
          });
          break;
        case "deleteTeam":
          await deleteTeam({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            teamId: input.teamId,
          });
          break;
        case "createRole":
          await createCustomRole({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            displayName: input.displayName,
            description: input.description,
            scopeType: input.scopeType,
            permissions: input.permissions,
          });
          break;
        case "assignRole":
          await assignRole({
            replaceExisting: input.replaceExisting,
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            principalType: input.principalType,
            principalId: input.principalId,
            roleId: input.roleId,
            scopeType: input.scopeType,
          });
          break;
        case "assignRoleBulk":
          for (const principalId of [...new Set(input.principalIds)]) {
            await assignRole({
              actorUserId: session.user.id,
              workspaceId: input.workspaceId,
              principalType: "user",
              principalId,
              roleId: input.roleId,
              scopeType: input.scopeType,
            });
          }
          break;
        case "assignResourceRole":
          await assignResourceRole({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            principalType: input.principalType,
            principalId: input.principalId,
            roleId: input.roleId,
            resourceType: input.resourceType,
            resourceId: input.resourceId,
            includeDependencies: input.includeDependencies,
          });
          break;
        case "assignResourceRoleBulk":
          await assignResourceRoleToPrincipals({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            principalType: input.principalType,
            principalIds: input.principalIds,
            roleId: input.roleId,
            resourceType: input.resourceType,
            resourceId: input.resourceId,
            includeDependencies: input.includeDependencies,
          });
          break;
        case "removeAssignment":
          await removeRoleAssignment({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            bindingId: input.bindingId,
          });
          break;
        case "deleteRole":
          await deleteCustomRole({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            roleId: input.roleId,
          });
          break;
        case "updateRole":
          await updateCustomRole({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            roleId: input.roleId,
            expectedUpdatedAt: input.expectedUpdatedAt,
            displayName: input.displayName,
            description: input.description,
            permissions: input.permissions,
          });
          break;
      }

      return NextResponse.json({ ok: true });
    },
    {
      allowApiKey: false,
      logLabel: "Failed to update access",
      expectedError: expectedIamError,
    },
  );
}
