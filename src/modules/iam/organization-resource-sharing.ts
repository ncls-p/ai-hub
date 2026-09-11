import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  aiModels,
  organizations,
  resourceOrganizationShares,
} from "@/server/infrastructure/db/schema";
import { findAccessResource } from "@/server/infrastructure/db/access-resource-repository";
import { audit } from "@/server/domain/services/audit";
import type { AccessResourceType } from "@/server/domain/entities/access-resource";
import { listResourceShareTargets } from "./resource-sharing";
import { DISTRIBUTED_RESOURCE_PERMISSIONS } from "./resource-availability";
import { IamOperationError } from "./use-cases.iam-operation-error";

/** Called only after platform-admin authorization at the application boundary. */
export async function setResourceOrganizations(input: {
  actorUserId: string;
  resourceType: AccessResourceType;
  resourceId: string;
  organizationIds: string[];
  includeDependencies: boolean;
}) {
  if (!DISTRIBUTED_RESOURCE_PERMISSIONS[input.resourceType])
    throw new IamOperationError("This resource cannot be distributed", 400);
  const resource = await findAccessResource(
    input.resourceType,
    input.resourceId,
  );
  if (!resource) throw new IamOperationError("Resource not found", 404);
  const ids = [...new Set(input.organizationIds)];
  const recipients = ids.length
    ? await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(inArray(organizations.id, ids))
    : [];
  if (recipients.length !== ids.length)
    throw new IamOperationError("Organization not found", 404);
  const targets = await listResourceShareTargets(input);
  if (input.resourceType === "model") {
    const [model] = await db
      .select({ providerId: aiModels.providerId })
      .from(aiModels)
      .where(eq(aiModels.id, input.resourceId));
    if (model) targets.push({ type: "provider", id: model.providerId });
  }
  await db.transaction(async (tx) => {
    await tx
      .delete(resourceOrganizationShares)
      .where(
        and(
          eq(resourceOrganizationShares.rootResourceType, input.resourceType),
          eq(resourceOrganizationShares.rootResourceId, input.resourceId),
        ),
      );
    if (ids.length)
      await tx
        .insert(resourceOrganizationShares)
        .values(
          ids.flatMap((organizationId) =>
            targets.map((target) => ({
              rootResourceType: input.resourceType,
              rootResourceId: input.resourceId,
              resourceType: target.type,
              resourceId: target.id,
              organizationId,
              createdById: input.actorUserId,
            })),
          ),
        )
        .onConflictDoNothing();
  });
  await audit.emit({
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    workspaceId: resource.workspaceId,
    action: "resource.organizations.updated",
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    outcome: "success",
    metadata: {
      organizationIds: ids,
      includeDependencies: input.includeDependencies,
    },
  });
  return { organizationIds: ids };
}
