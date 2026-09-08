import { BUILTIN_TOOL_SUMMARIES } from "@/modules/tool/builtin-tools-catalog";
import type { MarketplaceManifest } from "@/modules/marketplace/manifest-types";
import {
  MAX_PACKAGE_RESOURCES,
  ResourcePackageError,
  type ResourcePackage,
} from "./schema";

function unique(values: string[]) {
  if (new Set(values).size !== values.length)
    throw new ResourcePackageError(
      "Ambiguous duplicate dependency names in package",
    );
}

export function describeResourcePackage(resourcePackage: ResourcePackage) {
  const resources: Array<{ type: MarketplaceManifest["type"]; name: string }> =
    [];
  const knowledge = new Set<string>();
  const models = new Set<string>();
  let requiresCredentials = false;
  const pending = [resourcePackage.manifest];
  while (pending.length) {
    const manifest = pending.pop()!;
    resources.push({ type: manifest.type, name: manifest.name });
    if (resources.length > MAX_PACKAGE_RESOURCES)
      throw new ResourcePackageError(
        "A package can contain at most 256 resources",
      );
    if (manifest.type === "agent") {
      const bundled = manifest.bundledResources;
      const skills = bundled?.skills ?? [];
      const mcp = bundled?.mcpPresets ?? [];
      const custom = bundled?.customTools ?? [];
      unique(skills.map((item) => item.name));
      unique(custom.map((item) => item.name));
      unique(mcp.map((item) => item.preset.serverName));
      unique((manifest.skillBindings ?? []).map((binding) => binding.ref));
      unique(
        (manifest.toolBindings ?? []).map(
          (binding) => `${binding.source}:${binding.ref}`,
        ),
      );
      for (const preset of mcp)
        unique(preset.preset.tools.map((tool) => tool.name));
      const mcpRefs = new Set(
        mcp.flatMap((preset) =>
          preset.preset.tools.map(
            (tool) => `${preset.preset.serverName}/${tool.name}`,
          ),
        ),
      );
      for (const binding of manifest.toolBindings ?? []) {
        if (
          binding.source === "builtin" &&
          !BUILTIN_TOOL_SUMMARIES.some((tool) => tool.id === binding.ref)
        )
          throw new ResourcePackageError(
            `Unknown built-in tool: ${binding.ref}`,
          );
        if (
          (binding.source === "mcp" && !mcpRefs.has(binding.ref)) ||
          (binding.source === "custom" &&
            !custom.some((item) => item.name === binding.ref))
        )
          throw new ResourcePackageError(
            `Missing bundled tool: ${binding.ref}`,
          );
      }
      for (const binding of manifest.skillBindings ?? []) {
        if (!skills.some((item) => item.name === binding.ref)) {
          if (!binding.bundled)
            throw new ResourcePackageError(
              `Missing bundled skill: ${binding.ref}`,
            );
          pending.push({
            type: "skill",
            name: binding.ref,
            skill: binding.bundled,
          });
        }
      }
      if (manifest.kind !== "orchestrator" && manifest.specialists?.length)
        throw new ResourcePackageError(
          "Only orchestrators can have specialists",
        );
      pending.push(
        ...(manifest.specialists ?? []).map((item) => item.manifest),
        ...mcp,
        ...custom,
        ...skills.map((item) => ({
          type: "skill" as const,
          name: item.name,
          skill: item.skill,
        })),
      );
      for (const binding of manifest.knowledgeBindings ?? [])
        knowledge.add(binding.name);
      if (manifest.agent.providerName || manifest.agent.modelName)
        models.add(
          [manifest.agent.providerName, manifest.agent.modelName]
            .filter(Boolean)
            .join(" / "),
        );
    } else if (manifest.type === "mcp_preset") {
      unique(manifest.preset.tools.map((tool) => tool.name));
      requiresCredentials ||= manifest.preset.requiresCredentials;
    } else if (manifest.type === "custom_tool")
      requiresCredentials ||= Boolean(manifest.tool.requiresCredentials);
  }
  return {
    name: resourcePackage.manifest.name,
    resources,
    knowledge: [...knowledge],
    models: [...models],
    requiresCredentials,
  };
}
