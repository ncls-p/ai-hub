import { and, eq, isNull, ne } from "drizzle-orm";

import { getWorkspacesByUserId } from "@/modules/workspace/use-cases";
import { ACCESS_RESOURCE_TYPES } from "@/server/domain/entities/access-resource";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { listAccessResources } from "@/server/infrastructure/db/access-resource-repository";
import {
  organizationMembers,
  organizations,
  workspaces,
} from "@/server/infrastructure/db/schema";

import { IamOperationError } from "./use-cases";

export function normalizedSlug(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128);
}

export async function scopeForWorkspace(workspaceId: string) {
  const [scope] = await db
    .select({ workspace: workspaces, organization: organizations })
    .from(workspaces)
    .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
    .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.archivedAt)))
    .limit(1);
  if (!scope) throw new IamOperationError("Project not found", 404);
  return scope;
}

export async function requirePermission(input: {
  actorUserId: string;
  permission:
    | "organization.update"
    | "workspaces.update"
    | "organization.delete"
    | "workspaces.delete";
  resourceType: "organization" | "workspace";
  resourceId: string;
}) {
  const allowed = await authorization.hasPermission(
    { principalType: "user", principalId: input.actorUserId },
    input.permission,
    input.resourceType,
    input.resourceId,
  );
  if (!allowed) {
    throw new IamOperationError(
      "You do not have permission to manage this scope",
      403,
    );
  }
}

export async function listAllResourceIds(workspaceIds: string[]) {
  const ids: string[] = [];
  for (const workspaceId of workspaceIds) {
    for (const type of ACCESS_RESOURCE_TYPES) {
      let offset = 0;
      while (true) {
        const page = await listAccessResources({
          workspaceId,
          type,
          offset,
          limit: 100,
        });
        ids.push(...page.resources.map(({ id }) => id));
        if (!page.hasMore) break;
        offset = page.nextOffset ?? offset + page.resources.length;
      }
    }
  }
  return ids;
}

export async function nextWorkspaceOutsideOrganization(
  actorUserId: string,
  organizationId: string,
) {
  const candidates = await getWorkspacesByUserId(actorUserId);
  return (
    candidates.find(
      ({ workspace }) => workspace.organizationId !== organizationId,
    )?.workspace.id ?? null
  );
}

export async function invalidateOrganizationMembers(organizationId: string) {
  const members = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, organizationId));
  await Promise.all(
    members.map(({ userId }) =>
      authorization.invalidatePrincipalPermissionCache(userId),
    ),
  );
}

export async function renameProject(input: {
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
    permission: "workspaces.update",
    resourceType: "workspace",
    resourceId: workspace.id,
  });
  const slug = normalizedSlug(input.slug ?? input.name);
  if (!slug) throw new IamOperationError("Enter a valid project URL", 400);
  const [conflict] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.organizationId, organization.id),
        eq(workspaces.slug, slug),
        ne(workspaces.id, workspace.id),
        isNull(workspaces.archivedAt),
      ),
    )
    .limit(1);
  if (conflict) {
    throw new IamOperationError(
      "A project with this URL already exists in the organization",
      409,
    );
  }
  const [updated] = await db
    .update(workspaces)
    .set({ name: input.name.trim(), slug, updatedAt: new Date() })
    .where(eq(workspaces.id, workspace.id))
    .returning();
  await audit.emit({
    organizationId: organization.id,
    workspaceId: workspace.id,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "workspace.updated",
    resourceType: "workspace",
    resourceId: workspace.id,
    outcome: "success",
    metadata: {
      previousName: workspace.name,
      previousSlug: workspace.slug,
      name: updated.name,
      slug: updated.slug,
    },
  });
  return updated;
}
