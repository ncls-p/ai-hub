import { sanitizeMarketplaceManifest } from "@/modules/marketplace/manifest-sanitizer";
import type { AgentMarketplaceManifest } from "@/modules/marketplace/manifest-types";
import type { ResourcePackageManifest } from "./types";
import { sanitizeWorkflowDefinition } from "./workflow-sanitizer";

export function sanitizeResourcePackageManifest(
  manifest: ResourcePackageManifest,
): ResourcePackageManifest {
  if (manifest.type !== "workflow")
    return sanitizeMarketplaceManifest(manifest);
  const sanitized = sanitizeWorkflowDefinition(manifest.definition);
  return {
    ...manifest,
    ...sanitized,
    requiresCredentials:
      manifest.requiresCredentials || sanitized.requiresCredentials,
    agentBindings: manifest.agentBindings.map(({ ref, manifest: agent }) => ({
      ref,
      manifest: sanitizeMarketplaceManifest(agent) as AgentMarketplaceManifest,
    })),
  };
}
