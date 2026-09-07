import { policyMutation } from "./policy-mutation";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";

import type { TransferSecretPolicy } from "./resource-transfer";
import { IamOperationError } from "./use-cases";
import { cloneWorkspaceConfiguration } from "./workspace-clone.clone-workspace-configuration";
import { previewWorkspaceClone } from "./workspace-clone.executor";

export const executeWorkspaceClone = policyMutation(
  async function executeWorkspaceClone(input: {
    actorUserId: string;
    sourceWorkspaceId: string;
    targetWorkspaceId: string;
    secretPolicy: TransferSecretPolicy;
    confirmationToken: string;
  }) {
    const preview = await previewWorkspaceClone(input);
    if (preview.confirmationToken !== input.confirmationToken) {
      throw new IamOperationError(
        "The clone changed. Review it again before confirming.",
        409,
      );
    }
    await db.transaction((tx) =>
      cloneWorkspaceConfiguration(tx, {
        ...input,
        targetOrganizationId: preview.destination.organizationId,
        preserveGroupPrincipals:
          preview.source.organizationId === preview.destination.organizationId,
      }),
    );
    await audit.emit({
      organizationId: preview.destination.organizationId,
      workspaceId: input.targetWorkspaceId,
      actorPrincipalType: "user",
      actorPrincipalId: input.actorUserId,
      action: "workspace.cloned",
      resourceType: "workspace",
      resourceId: input.targetWorkspaceId,
      outcome: "success",
      metadata: {
        sourceWorkspaceId: input.sourceWorkspaceId,
        counts: preview.counts,
        secretPolicy: input.secretPolicy,
      },
    });
    return { cloned: preview.counts, destination: preview.destination };
  },
);
