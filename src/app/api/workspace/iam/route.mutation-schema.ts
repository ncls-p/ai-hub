import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute } from "@/lib/route-handler";
import {
  getAccessConsoleSnapshot,
  IamOperationError,
} from "@/modules/iam/use-cases";
import { ACCESS_RESOURCE_TYPES } from "@/server/domain/entities/access-resource";

const workspaceQuerySchema = z.object({
  workspaceId: z.uuid(),
});

export const mutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("createAccount"),
    workspaceId: z.uuid(),
    name: z.string().trim().min(1).max(255),
    email: z.email(),
    password: z.string().min(8).max(128),
    projectRoleId: z.uuid().optional(),
  }),
  z.object({
    action: z.literal("updateTeam"),
    workspaceId: z.uuid(),
    teamId: z.uuid(),
    name: z.string().trim().min(2).max(255),
    description: z.string().trim().max(500).optional(),
    expectedUpdatedAt: z.iso.datetime().optional(),
  }),
  z.object({
    action: z.literal("createOrganization"),
    organizationName: z.string().trim().min(2).max(255),
    organizationSlug: z.string().trim().max(128).optional(),
    projectName: z
      .string()
      .trim()
      .max(255)
      .refine((value) => !value || value.length >= 2)
      .optional(),
    projectSlug: z.string().trim().max(128).optional(),
  }),
  z.object({
    action: z.literal("createProject"),
    workspaceId: z.uuid(),
    name: z.string().trim().min(2).max(255),
    slug: z.string().trim().max(128).optional(),
  }),
  z.object({
    action: z.literal("renameProject"),
    workspaceId: z.uuid(),
    name: z.string().trim().min(2).max(255),
    slug: z.string().trim().min(1).max(128).optional(),
  }),
  z.object({
    action: z.literal("renameOrganization"),
    workspaceId: z.uuid(),
    name: z.string().trim().min(2).max(255),
    slug: z.string().trim().min(1).max(128).optional(),
  }),
  z.object({
    action: z.literal("deleteProject"),
    workspaceId: z.uuid(),
    confirmationName: z.string().trim().min(1).max(255),
  }),
  z.object({
    action: z.literal("deleteOrganization"),
    workspaceId: z.uuid(),
    confirmationName: z.string().trim().min(1).max(255),
  }),
  z.object({
    action: z.literal("addMember"),
    workspaceId: z.uuid(),
    email: z.email(),
    projectRoleId: z.uuid().optional(),
  }),
  z.object({
    action: z.literal("removeMember"),
    workspaceId: z.uuid(),
    userId: z.uuid(),
  }),
  z.object({
    action: z.literal("createTeam"),
    workspaceId: z.uuid(),
    name: z.string().trim().min(2).max(255),
    description: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal("addTeamMember"),
    workspaceId: z.uuid(),
    teamId: z.uuid(),
    userId: z.uuid(),
  }),
  z.object({
    action: z.literal("removeTeamMember"),
    workspaceId: z.uuid(),
    teamId: z.uuid(),
    userId: z.uuid(),
  }),
  z.object({
    action: z.literal("deleteTeam"),
    workspaceId: z.uuid(),
    teamId: z.uuid(),
  }),
  z.object({
    action: z.literal("createRole"),
    workspaceId: z.uuid(),
    displayName: z.string().trim().min(2).max(255),
    description: z.string().trim().max(500).optional(),
    scopeType: z.enum(["organization", "workspace"]),
    permissions: z.array(z.string().trim().min(1)).min(1).max(100),
  }),
  z.object({
    action: z.literal("assignRole"),
    replaceExisting: z.boolean().optional(),
    workspaceId: z.uuid(),
    principalType: z.enum(["user", "group"]),
    principalId: z.uuid(),
    roleId: z.uuid(),
    scopeType: z.enum(["organization", "workspace"]),
  }),
  z.object({
    action: z.literal("assignRoleBulk"),
    workspaceId: z.uuid(),
    principalIds: z.array(z.uuid()).min(1).max(100),
    roleId: z.uuid(),
    scopeType: z.enum(["organization", "workspace"]),
  }),
  z.object({
    action: z.literal("assignResourceRole"),
    workspaceId: z.uuid(),
    principalType: z.enum(["user", "group"]),
    principalId: z.uuid(),
    roleId: z.uuid(),
    resourceType: z.enum(ACCESS_RESOURCE_TYPES),
    resourceId: z.uuid(),
    includeDependencies: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("assignResourceRoleBulk"),
    workspaceId: z.uuid(),
    principalType: z.enum(["user", "group"]),
    principalIds: z.array(z.uuid()).min(1).max(100),
    roleId: z.uuid(),
    resourceType: z.enum(ACCESS_RESOURCE_TYPES),
    resourceId: z.uuid(),
    includeDependencies: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("removeAssignment"),
    workspaceId: z.uuid(),
    bindingId: z.uuid(),
  }),
  z.object({
    action: z.literal("deleteRole"),
    workspaceId: z.uuid(),
    roleId: z.uuid(),
  }),
  z.object({
    action: z.literal("updateRole"),
    workspaceId: z.uuid(),
    roleId: z.uuid(),
    expectedUpdatedAt: z.iso.datetime().optional(),
    displayName: z.string().trim().min(2).max(255),
    description: z.string().trim().max(500).optional(),
    permissions: z.array(z.string().trim().min(1)).min(1).max(100),
  }),
]);

export function expectedIamError(error: unknown) {
  if (error instanceof IamOperationError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  return null;
}

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = workspaceQuerySchema.safeParse({
        workspaceId: req.nextUrl.searchParams.get("workspaceId"),
      });
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid project", details: parsed.error.issues },
          { status: 400 },
        );
      }

      const snapshot = await getAccessConsoleSnapshot({
        userId: session.user.id,
        workspaceId: parsed.data.workspaceId,
      });
      return NextResponse.json(snapshot);
    },
    {
      allowApiKey: false,
      logLabel: "Failed to load access console",
      expectedError: expectedIamError,
    },
  );
}
