import { useTranslations } from "next-intl";

export type ManifestPreviewData = Record<string, unknown>;

export interface PreviewBullet {
	label: string;
}

type TranslateFn = (
	key: string,
	values?: Record<string, string | number>,
) => string;

export function formatManifestPreview(
	preview: ManifestPreviewData,
	t: TranslateFn,
): PreviewBullet[] {
	const type = preview.type as string | undefined;
	const bullets: PreviewBullet[] = [];

	switch (type) {
		case "agent": {
			if (preview.provider) {
				bullets.push({
					label: t("preview.agentProvider", {
						provider: String(preview.provider),
					}),
				});
			}
			if (preview.model) {
				bullets.push({
					label: t("preview.agentModel", { model: String(preview.model) }),
				});
			}
			const tools =
				Number(preview.toolBindings ?? 0) +
				Number(preview.bundledMcp ?? 0) +
				Number(preview.bundledCustomTools ?? 0);
			if (tools > 0) {
				bullets.push({ label: t("preview.agentTools", { count: tools }) });
			}
			const skills =
				Number(preview.skillBindings ?? 0) + Number(preview.bundledSkills ?? 0);
			if (skills > 0) {
				bullets.push({ label: t("preview.agentSkills", { count: skills }) });
			}
			if (Number(preview.knowledgeBindings ?? 0) > 0) {
				bullets.push({
					label: t("preview.agentKnowledge", {
						count: Number(preview.knowledgeBindings),
					}),
				});
			}
			if (preview.hasSystemPrompt) {
				bullets.push({ label: t("preview.agentPrompt") });
			}
			break;
		}
		case "skill": {
			const fileCount = Number(preview.fileCount ?? 0);
			if (fileCount > 0) {
				bullets.push({ label: t("preview.skillFiles", { count: fileCount }) });
			}
			if (preview.sourcePackage) {
				bullets.push({
					label: t("preview.skillPackage", {
						package: String(preview.sourcePackage),
					}),
				});
			}
			break;
		}
		case "custom_tool": {
			if (preview.status) {
				bullets.push({
					label: t("preview.toolStatus", { status: String(preview.status) }),
				});
			}
			if (preview.hasInputSchema || preview.hasOutputSchema) {
				bullets.push({ label: t("preview.toolSchemas") });
			}
			if (preview.n8nWorkflow) {
				bullets.push({ label: t("preview.toolWorkflow") });
			}
			if (preview.requiresCredentials) {
				bullets.push({ label: t("preview.toolCredentials") });
			}
			break;
		}
		case "mcp_preset": {
			if (preview.transport) {
				bullets.push({
					label: t("preview.mcpTransport", {
						transport: String(preview.transport),
					}),
				});
			}
			if (Number(preview.toolCount ?? 0) > 0) {
				bullets.push({
					label: t("preview.mcpTools", { count: Number(preview.toolCount) }),
				});
			}
			if (preview.enabled) {
				bullets.push({ label: t("preview.mcpEnabled") });
			}
			if (preview.requiresCredentials) {
				bullets.push({ label: t("preview.mcpCredentials") });
			}
			break;
		}
	}

	return bullets;
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

export function useMarketplaceItemTypeLabel(type: string) {
	const t = useTranslations("marketplace");
	return getItemTypeLabel(type, (key) => t(key as "itemTypes.agent"));
}

export function useMarketplaceVisibilityLabel(visibility: string) {
	const t = useTranslations("marketplace");
	return getVisibilityLabel(visibility, (key) => t(key as "visibility.public"));
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
