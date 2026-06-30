export type ManifestPreviewData = Record<string, unknown>;

export interface PreviewBullet {
  label: string;
}

type TranslateFn = (
  key: string,
  values?: Record<string, string | number>,
) => string;

function previewBullet(label: string): PreviewBullet {
  return { label };
}

function formatAgentPreview(preview: ManifestPreviewData, t: TranslateFn) {
  const bullets: PreviewBullet[] = [];
  const tools =
    Number(preview.toolBindings ?? 0) +
    Number(preview.bundledMcp ?? 0) +
    Number(preview.bundledCustomTools ?? 0);
  const skills =
    Number(preview.skillBindings ?? 0) + Number(preview.bundledSkills ?? 0);
  const knowledgeBindings = Number(preview.knowledgeBindings ?? 0);

  if (preview.provider) {
    bullets.push(
      previewBullet(
        t("preview.agentProvider", { provider: String(preview.provider) }),
      ),
    );
  }
  if (preview.model) {
    bullets.push(
      previewBullet(t("preview.agentModel", { model: String(preview.model) })),
    );
  }
  if (tools > 0) {
    bullets.push(previewBullet(t("preview.agentTools", { count: tools })));
  }
  if (skills > 0) {
    bullets.push(previewBullet(t("preview.agentSkills", { count: skills })));
  }
  if (knowledgeBindings > 0) {
    bullets.push(
      previewBullet(t("preview.agentKnowledge", { count: knowledgeBindings })),
    );
  }
  if (preview.hasSystemPrompt) {
    bullets.push(previewBullet(t("preview.agentPrompt")));
  }

  return bullets;
}

function formatSkillPreview(preview: ManifestPreviewData, t: TranslateFn) {
  const bullets: PreviewBullet[] = [];
  const fileCount = Number(preview.fileCount ?? 0);

  if (fileCount > 0) {
    bullets.push(previewBullet(t("preview.skillFiles", { count: fileCount })));
  }
  if (preview.sourcePackage) {
    bullets.push(
      previewBullet(
        t("preview.skillPackage", {
          package: String(preview.sourcePackage),
        }),
      ),
    );
  }

  return bullets;
}

function formatToolPreview(preview: ManifestPreviewData, t: TranslateFn) {
  const bullets: PreviewBullet[] = [];

  if (preview.status) {
    bullets.push(
      previewBullet(
        t("preview.toolStatus", { status: String(preview.status) }),
      ),
    );
  }
  if (preview.hasInputSchema || preview.hasOutputSchema) {
    bullets.push(previewBullet(t("preview.toolSchemas")));
  }
  if (preview.n8nWorkflow) {
    bullets.push(previewBullet(t("preview.toolWorkflow")));
  }
  if (preview.requiresCredentials) {
    bullets.push(previewBullet(t("preview.toolCredentials")));
  }

  return bullets;
}

function formatMcpPreview(preview: ManifestPreviewData, t: TranslateFn) {
  const bullets: PreviewBullet[] = [];
  const toolCount = Number(preview.toolCount ?? 0);

  if (preview.transport) {
    bullets.push(
      previewBullet(
        t("preview.mcpTransport", { transport: String(preview.transport) }),
      ),
    );
  }
  if (toolCount > 0) {
    bullets.push(previewBullet(t("preview.mcpTools", { count: toolCount })));
  }
  if (preview.enabled) {
    bullets.push(previewBullet(t("preview.mcpEnabled")));
  }
  if (preview.requiresCredentials) {
    bullets.push(previewBullet(t("preview.mcpCredentials")));
  }

  return bullets;
}

const PREVIEW_FORMATTERS: Record<
  string,
  (preview: ManifestPreviewData, t: TranslateFn) => PreviewBullet[]
> = {
  agent: formatAgentPreview,
  skill: formatSkillPreview,
  custom_tool: formatToolPreview,
  mcp_preset: formatMcpPreview,
};

export function formatManifestPreview(
  preview: ManifestPreviewData,
  t: TranslateFn,
): PreviewBullet[] {
  const formatter = PREVIEW_FORMATTERS[String(preview.type ?? "")];
  return formatter?.(preview, t) ?? [];
}

export function getItemTypeLabel(
  type: string,
  t: (key: string) => string,
): string {
  const key = type as
    | "agent"
    | "skill"
    | "custom_tool"
    | "mcp_preset"
    | "prompt_template"
    | "tool_pack"
    | "workflow_template"
    | "knowledge_template"
    | "provider_preset";
  if (
    [
      "agent",
      "skill",
      "custom_tool",
      "mcp_preset",
      "prompt_template",
      "tool_pack",
      "workflow_template",
      "knowledge_template",
      "provider_preset",
    ].includes(key)
  ) {
    return t(`itemTypes.${key}`);
  }
  return type;
}

export function getVisibilityLabel(
  visibility: string,
  t: (key: string) => string,
): string {
  if (["public", "private"].includes(visibility)) {
    return t(`visibility.${visibility}`);
  }
  return visibility;
}

export function getVisibilityHint(
  visibility: string,
  t: (key: string) => string,
): string | undefined {
  const hintKey = `${visibility}Hint`;
  if (["public", "private"].includes(visibility)) {
    return t(`visibility.${hintKey}`);
  }
  return undefined;
}

export function getToolSourceLabel(
  source: string,
  t: (key: string) => string,
): string {
  if (["builtin", "mcp", "custom"].includes(source)) {
    return t(`toolSources.${source}`);
  }
  return source;
}

export function formatMarketplaceDate(
  dateStr: string | null,
  locale: string,
  style: "short" | "long" = "short",
) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(locale, {
    day: "numeric",
    month: style === "long" ? "long" : "short",
    year: "numeric",
  });
}
