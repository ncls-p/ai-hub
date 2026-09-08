import { requirePackageInstallPermissions } from "@/modules/resource-package/permissions";
import { logHandledError } from "@/lib/logger";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
  agentSkills,
  marketplaceInstalls,
  marketplaceItems,
} from "@/server/infrastructure/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  installAgentManifest,
  installCustomTool,
  installMcpPreset,
  installPostInstallFlags,
} from "./install-helpers";
import { sanitizeMarketplaceManifest } from "./manifest-sanitizer";
import {
  canUserInstallMarketplaceItem,
  getLatestVersion,
} from "./use-cases.get-marketplace-item-detail";
import { getMarketplaceItem } from "./use-cases.marketplace-visibility";

// ─── Install ───────────────────────────────────────────────────────────

export async function installMarketplaceItem(input: {
  workspaceId: string;
  userId: string;
  itemId: string;
}) {
  try {
    const item = await getMarketplaceItem(input.itemId);
    if (!item) throw new Error("Marketplace item not found");
    if (!(await canUserInstallMarketplaceItem(item, input.userId)))
      throw new Error("Marketplace item not available");
    const version = await getLatestVersion(item.id);
    if (!version) throw new Error("Marketplace item has no version");

    const manifest = sanitizeMarketplaceManifest(version.manifestJson);
    await requirePackageInstallPermissions(
      manifest,
      input.workspaceId,
      input.userId,
    );
    const postInstall = installPostInstallFlags(manifest);

    const { installedResource, install } = await db.transaction(async (tx) => {
      let installedResource: { id: string } | null = null;
      let resourceType: string;

      switch (manifest.type) {
        case "agent": {
          installedResource = await installAgentManifest(tx, {
            workspaceId: input.workspaceId,
            userId: input.userId,
            itemId: item.id,
            versionId: version.id,
            versionLabel: version.version,
            manifest,
            itemDescription: item.description,
          });
          resourceType = "agent";
          break;
        }

        case "skill": {
          const [installedSkill] = await tx
            .insert(agentSkills)
            .values({
              workspaceId: input.workspaceId,
              createdById: input.userId,
              name: manifest.name,
              description: manifest.description ?? item.description,
              sourcePackage: manifest.skill.sourcePackage ?? null,
              sourceSkillName: manifest.skill.sourceSkillName ?? null,
              installCommand: manifest.skill.installCommand ?? null,
              markdownFilesJson: manifest.skill.markdownFiles,
              metadataJson: manifest.skill.metadata ?? null,
            })
            .returning();

          installedResource = installedSkill;
          resourceType = "skill";
          break;
        }

        case "custom_tool": {
          const { tool } = await installCustomTool(tx, {
            workspaceId: input.workspaceId,
            userId: input.userId,
            manifest,
            itemDescription: item.description,
          });
          installedResource = tool;
          resourceType = "custom_tool";
          break;
        }

        case "mcp_preset": {
          const { server } = await installMcpPreset(tx, {
            workspaceId: input.workspaceId,
            userId: input.userId,
            manifest,
            itemDescription: item.description,
          });
          installedResource = server;
          resourceType = "mcp_preset";
          break;
        }

        default:
          throw new Error(
            `Unsupported marketplace type: ${(manifest as { type: string }).type}`,
          );
      }

      const [install] = await tx
        .insert(marketplaceInstalls)
        .values({
          workspaceId: input.workspaceId,
          itemId: item.id,
          versionId: version.id,
          installedByUserId: input.userId,
          installedResourceType: resourceType,
          installedResourceId: installedResource.id,
        })
        .returning();

      await tx
        .update(marketplaceItems)
        .set({
          installCount: sql`${marketplaceItems.installCount} + 1`,
          totalDownloads: sql`${marketplaceItems.totalDownloads} + 1`,
        })
        .where(eq(marketplaceItems.id, item.id));

      return { installedResource, install };
    });

    await audit.emit({
      workspaceId: input.workspaceId,
      actorPrincipalType: "user",
      actorPrincipalId: input.userId,
      action: "marketplace.installed",
      resourceType: "marketplace_item",
      resourceId: item.id,
      outcome: "success",
      metadata: {
        installedResourceId: installedResource.id,
        installId: install.id,
      },
    });

    return {
      install,
      [manifest.type]: installedResource,
      requiresCredentials: postInstall.requiresCredentials,
    };
  } catch (error) {
    logHandledError("Failed to install marketplace item", {}, error as Error);
    throw error;
  }
}
