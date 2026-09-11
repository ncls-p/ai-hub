import { eq, or } from "drizzle-orm";
import {
  aiModels,
  aiProviders,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { resourceAvailabilityCondition } from "@/modules/iam/resource-availability";

export function automationModelAvailability(organizationId: string) {
  return or(
    eq(workspaces.organizationId, organizationId),
    resourceAvailabilityCondition({
      type: "model",
      id: aiModels.id,
      workspaceId: aiProviders.workspaceId,
      providerId: aiProviders.id,
      activeWorkspaceId: "00000000-0000-0000-0000-000000000000",
      activeOrganizationId: organizationId,
    }),
  );
}
export function automationProviderAvailability(organizationId: string) {
  return or(
    eq(workspaces.organizationId, organizationId),
    resourceAvailabilityCondition({
      type: "provider",
      id: aiProviders.id,
      workspaceId: aiProviders.workspaceId,
      activeWorkspaceId: "00000000-0000-0000-0000-000000000000",
      activeOrganizationId: organizationId,
    }),
  );
}
