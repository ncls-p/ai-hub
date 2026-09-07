import { and, eq, ne } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import { teams } from "@/server/infrastructure/db/schema";
import { audit } from "@/server/domain/services/audit";
import { policyMutation } from "./policy-mutation";
import {
  getWorkspaceScope,
  IamOperationError,
  normalizedSlug,
  requirePermission,
} from "./use-cases.iam-operation-error";

export const updateTeam = policyMutation(async function updateTeam(input: {
  actorUserId: string;
  workspaceId: string;
  teamId: string;
  name: string;
  description?: string;
  expectedUpdatedAt?: string;
}) {
  const { organization } = await getWorkspaceScope(input.workspaceId);
  await requirePermission({
    userId: input.actorUserId,
    permission: "teams.update",
    resourceType: "organization",
    resourceId: organization.id,
    errorMessage: "You cannot edit teams in this organization",
  });
  const [team] = await db
    .select()
    .from(teams)
    .where(
      and(
        eq(teams.id, input.teamId),
        eq(teams.organizationId, organization.id),
      ),
    )
    .limit(1);
  if (!team) throw new IamOperationError("Team not found", 404);
  if (
    input.expectedUpdatedAt &&
    team.updatedAt.toISOString() !== input.expectedUpdatedAt
  )
    throw new IamOperationError(
      "This team changed. Reload access before saving.",
      409,
    );
  const slug = normalizedSlug(input.name);
  const [duplicate] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(
      and(
        eq(teams.organizationId, organization.id),
        eq(teams.slug, slug),
        ne(teams.id, team.id),
      ),
    )
    .limit(1);
  if (duplicate)
    throw new IamOperationError("A team with this name already exists", 409);
  // Renaming doesn't confer access: membership/role mutations enforce delegation separately.
  const [updated] = await db
    .update(teams)
    .set({
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(teams.id, team.id))
    .returning();
  await audit.emit({
    organizationId: organization.id,
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "team.updated",
    resourceType: "organization",
    resourceId: organization.id,
    outcome: "success",
    metadata: { teamId: team.id, teamName: updated.name },
  });
  return updated;
});
