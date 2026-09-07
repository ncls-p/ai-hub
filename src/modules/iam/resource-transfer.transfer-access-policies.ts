import { SYSTEM_ROLES } from "@/server/domain/entities/iam";
import { requireDelegablePermissions } from "./use-cases.iam-operation-error";
import { getWorkspacesByUserId } from "@/modules/workspace/use-cases";
import {
  ACCESS_RESOURCE_TYPES,
  type AccessResourceType,
} from "@/server/domain/entities/access-resource";
import { authorization } from "@/server/domain/services/authorization";

import { IamOperationError } from "./use-cases";

export const TRANSFER_ACCESS_POLICIES = ["compatible", "remove_all"] as const;
export const TRANSFER_OWNERSHIP_POLICIES = ["preserve", "actor"] as const;
export const TRANSFER_SECRET_POLICIES = ["keep", "disable"] as const;

export type TransferAccessPolicy = (typeof TRANSFER_ACCESS_POLICIES)[number];
export type TransferOwnershipPolicy =
  (typeof TRANSFER_OWNERSHIP_POLICIES)[number];
export type TransferSecretPolicy = (typeof TRANSFER_SECRET_POLICIES)[number];
export const RESOURCE_TRANSFER_ROOT_TYPES = [
  ...ACCESS_RESOURCE_TYPES,
  "workspace",
] as const;
export type ResourceTransferRootType =
  (typeof RESOURCE_TRANSFER_ROOT_TYPES)[number];

export type ResourceTransferOptions = {
  includeDependencies: boolean;
  accessPolicy: TransferAccessPolicy;
  ownershipPolicy: TransferOwnershipPolicy;
  secretPolicy: TransferSecretPolicy;
};

export type ResourceTransferItem = {
  type: AccessResourceType;
  id: string;
  name: string;
  reason: "selected" | "parent" | "dependency" | "dependent" | "history";
};

export type ResourceTransferPreview = {
  source: {
    workspaceId: string;
    workspaceName: string;
    organizationId: string;
    organizationName: string;
  };
  destination: {
    workspaceId: string;
    workspaceName: string;
    organizationId: string;
    organizationName: string;
  };
  crossOrganization: boolean;
  items: ResourceTransferItem[];
  warnings: string[];
  blockers: string[];
  directAssignments: { kept: number; removed: number };
  members: { moved: number };
  secrets: { affected: number; policy: TransferSecretPolicy };
  confirmationToken: string;
};

export type TransferSeed = {
  type: AccessResourceType;
  id: string;
  reason: ResourceTransferItem["reason"];
};

export type TransferSets = Record<
  AccessResourceType,
  Map<string, TransferSeed["reason"]>
>;

export const RESOURCE_TYPES: AccessResourceType[] = [
  "agent",
  "provider",
  "model",
  "mcp_server",
  "tool_connector",
  "tool_connection",
  "custom_tool",
  "knowledge_base",
  "skill",
  "workflow",
  "scheduled_task",
  "conversation",
  "marketplace_item",
];

export function emptyTransferSets(): TransferSets {
  return Object.fromEntries(
    RESOURCE_TYPES.map((type) => [type, new Map()]),
  ) as TransferSets;
}

export function addResource(
  sets: TransferSets,
  type: AccessResourceType,
  id: string | null | undefined,
  reason: TransferSeed["reason"],
) {
  if (!id || sets[type].has(id)) return false;
  sets[type].set(id, reason);
  return true;
}

export function ids(sets: TransferSets, type: AccessResourceType) {
  return [...sets[type].keys()];
}

export async function requireTransferPermission(
  userId: string,
  workspaceId: string,
) {
  const result = await authorization.checkPermission(
    { principalType: "user", principalId: userId },
    "workspaces.transfer",
    "workspace",
    workspaceId,
  );
  if (!result.granted) {
    throw new IamOperationError(
      "You need project access administration rights to transfer resources",
      403,
    );
  }
  await requireDelegablePermissions({
    actorUserId: userId,
    resourceType: "workspace",
    resourceId: workspaceId,
    permissions: SYSTEM_ROLES.find((role) => role.name === "workspace.admin")!
      .permissions,
  });
}

export async function listResourceTransferDestinations(input: {
  userId: string;
  sourceWorkspaceId: string;
}) {
  await requireTransferPermission(input.userId, input.sourceWorkspaceId);
  const candidates = await getWorkspacesByUserId(input.userId);
  const manageable = await Promise.all(
    candidates.map(async ({ workspace, organization }) => ({
      workspace,
      organization,
      allowed:
        workspace.id !== input.sourceWorkspaceId &&
        (
          await authorization.checkPermission(
            { principalType: "user", principalId: input.userId },
            "workspaces.transfer",
            "workspace",
            workspace.id,
          )
        ).granted,
    })),
  );

  return manageable
    .filter(({ allowed }) => allowed)
    .map(({ workspace, organization }) => ({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      organizationId: organization.id,
      organizationName: organization.name,
    }))
    .sort(
      (a, b) =>
        a.organizationName.localeCompare(b.organizationName) ||
        a.workspaceName.localeCompare(b.workspaceName),
    );
}
