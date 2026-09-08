import { hasResourcePermissionForRequest } from "@/modules/auth/workspace-access";
import {
  resolveModelId,
  resolveProviderId,
  type Tx,
} from "./install-helpers.tx";
import type { AgentMarketplaceManifest } from "./manifest-types";

export async function resolveInstalledAgentModel(
  tx: Tx,
  input: {
    workspaceId: string;
    userId: string;
    manifest: AgentMarketplaceManifest;
  },
) {
  let providerId = await resolveProviderId(
    tx,
    input.workspaceId,
    input.manifest.agent.providerId,
    input.manifest.agent.providerName,
  );
  if (
    providerId &&
    !(await hasResourcePermissionForRequest(
      input.userId,
      input.workspaceId,
      "providers.viewMetadata",
      "provider",
      providerId,
    ))
  )
    providerId = null;
  let modelId = await resolveModelId(
    tx,
    providerId,
    input.manifest.agent.modelId,
    input.manifest.agent.modelName,
  );

  if (
    modelId &&
    !(await hasResourcePermissionForRequest(
      input.userId,
      input.workspaceId,
      "models.invoke",
      "model",
      modelId,
    ))
  )
    modelId = null;

  return { providerId, modelId };
}
