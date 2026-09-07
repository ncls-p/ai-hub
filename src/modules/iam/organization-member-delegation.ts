import { and, eq } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  teamMembers,
  teams,
  workspaces,
} from "@/server/infrastructure/db/schema";
import {
  requireManageableTeam,
  requireSubordinatePrincipal,
} from "./delegation";
import { listSourceBindings } from "./member-transfer.list-member-transfer-destinations";

/** Removing membership also revokes descendant and team access. Check every scope. */
export async function requireManageableOrganizationMember(input: {
  actorUserId: string;
  userId: string;
  workspaceId: string;
  organizationId: string;
}) {
  const [projects, bindings, memberships] = await Promise.all([
    db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.organizationId, input.organizationId)),
    listSourceBindings({
      userIds: [input.userId],
      sourceWorkspaceId: input.workspaceId,
      sourceOrganizationId: input.organizationId,
      includeWholeOrganization: true,
    }),
    db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(
        and(
          eq(teamMembers.userId, input.userId),
          eq(teams.organizationId, input.organizationId),
        ),
      ),
  ]);
  const scopes = [
    { resourceType: "organization" as const, resourceId: input.organizationId },
    ...projects.map(({ id }) => ({
      resourceType: "workspace" as const,
      resourceId: id,
    })),
    ...bindings,
  ];
  const checked = new Set<string>();
  for (const scope of scopes) {
    const key = `${scope.resourceType}:${scope.resourceId}`;
    if (checked.has(key)) continue;
    checked.add(key);
    await requireSubordinatePrincipal({
      ...input,
      ...scope,
      principalType: "user",
      principalId: input.userId,
    });
  }
  for (const { teamId } of memberships)
    await requireManageableTeam({ ...input, teamId });
  return bindings;
}
