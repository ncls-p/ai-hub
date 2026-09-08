import { db } from "@/server/infrastructure/db";
import { agentSkills } from "@/server/infrastructure/db/schema";
import { audit } from "@/server/domain/services/audit";
import {
  installAgentManifest,
  installCustomTool,
  installMcpPreset,
} from "@/modules/marketplace/install-helpers";
import { sanitizeMarketplaceManifest } from "@/modules/marketplace/manifest-sanitizer";
import { requirePackageInstallPermissions } from "./permissions";
import { parseResourcePackage } from "./schema";
import { describeResourcePackage } from "./summary";

export async function importResourcePackage(input: {
  workspaceId: string;
  userId: string;
  package: unknown;
  preview?: boolean;
}) {
  const resourcePackage = parseResourcePackage(input.package);
  resourcePackage.manifest = sanitizeMarketplaceManifest(
    resourcePackage.manifest,
  );
  const preview = describeResourcePackage(resourcePackage);
  await requirePackageInstallPermissions(
    resourcePackage.manifest,
    input.workspaceId,
    input.userId,
  );
  if (input.preview) return { preview };
  const { manifest } = resourcePackage;
  const pending = [manifest];
  while (pending.length) {
    const current = pending.pop()!;
    if (current.type === "agent")
      pending.push(
        ...(current.specialists ?? []).map((item) => item.manifest),
        ...(current.bundledResources?.mcpPresets ?? []),
        ...(current.bundledResources?.customTools ?? []),
      );
    if (current.type === "mcp_preset") {
      current.preset.enabled = false;
      current.preset.healthStatus = "unknown";
    }
    if (current.type === "custom_tool") current.tool.status = "draft";
  }
  const resource = await db.transaction(async (tx) => {
    const context = { workspaceId: input.workspaceId, userId: input.userId };
    switch (manifest.type) {
      case "agent":
        return installAgentManifest(tx, {
          ...context,
          manifest,
          versionLabel: "JSON v1",
        });
      case "mcp_preset":
        return (await installMcpPreset(tx, { ...context, manifest })).server;
      case "custom_tool":
        return (await installCustomTool(tx, { ...context, manifest })).tool;
      case "skill": {
        const [skill] = await tx
          .insert(agentSkills)
          .values({
            ...context,
            createdById: input.userId,
            name: manifest.name,
            description: manifest.description,
            markdownFilesJson: manifest.skill.markdownFiles,
            sourcePackage: manifest.skill.sourcePackage,
            sourceSkillName: manifest.skill.sourceSkillName,
            installCommand: manifest.skill.installCommand,
            metadataJson: manifest.skill.metadata,
          })
          .returning();
        return skill;
      }
    }
  });
  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "resources.imported",
    resourceType: manifest.type === "mcp_preset" ? "mcp_server" : manifest.type,
    resourceId: resource.id,
    outcome: "success",
    metadata: { resourceCount: preview.resources.length },
  });
  return {
    preview,
    resource: { id: resource.id, type: manifest.type, name: manifest.name },
  };
}
