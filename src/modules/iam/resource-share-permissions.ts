import {
  resourceDefinition,
  type AccessResourceType,
} from "@/server/domain/entities/access-resource";
import {
  findSystemRole,
  rolePermissions,
} from "./use-cases.iam-operation-error";
import { findAccessResource } from "@/server/infrastructure/db/access-resource-repository";
import { withFreshAuthorization } from "@/server/domain/services/authorization.fresh-context";
import { expandPermissionGrants } from "./permission-matching";
import { requireDelegablePermissions } from "./use-cases.iam-operation-error";

/** Publishing visibility must not manufacture usage rights the publisher lacks. */
export async function requireResourceSharePermissions(input: {
  actorUserId: string;
  resourceType: AccessResourceType;
  resourceId: string;
  workspaceId?: string;
}) {
  const name =
    input.resourceType === "agent"
      ? "workspace.agent_user"
      : "workspace.viewer";
  const workspaceId =
    input.workspaceId ??
    (await findAccessResource(input.resourceType, input.resourceId))
      ?.workspaceId;
  const role = await findSystemRole(name, workspaceId);
  const domains = resourceDefinition(input.resourceType)!.permissionDomains;
  const permissions = expandPermissionGrants(rolePermissions(role)).filter(
    (permission) => domains.includes(permission.split(".")[0]),
  );
  await withFreshAuthorization(() =>
    requireDelegablePermissions({
      ...input,
      resourceType: input.workspaceId ? "workspace" : input.resourceType,
      resourceId: input.workspaceId ?? input.resourceId,
      permissions,
    }),
  );
}
