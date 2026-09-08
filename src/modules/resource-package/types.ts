import type {
  AgentMarketplaceManifest,
  MarketplaceManifest,
  SourceResourceType,
} from "@/modules/marketplace/manifest-types";
import type { WorkflowDefinition } from "@/modules/workflows/contracts";

export type WorkflowResourceManifest = {
  type: "workflow";
  name: string;
  description?: string;
  definition: WorkflowDefinition;
  agentBindings: Array<{ ref: string; manifest: AgentMarketplaceManifest }>;
  requiresCredentials: boolean;
};

export type ResourcePackageManifest =
  | MarketplaceManifest
  | WorkflowResourceManifest;
export type ResourcePackageSource =
  | SourceResourceType
  | "marketplace_item"
  | "workflow";
