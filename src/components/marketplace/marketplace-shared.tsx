import {
	BookMarked,
	BookOpen,
	Bot,
	Package,
	Plug,
	Puzzle,
	Settings,
	Wrench,
	Workflow,
} from "lucide-react";
import { getItemTypeLabel } from "./marketplace-i18n-helpers";

const itemIconMap: Record<
	string,
	React.ComponentType<{ className?: string }>
> = {
	agent: Bot,
	skill: Package,
	custom_tool: Wrench,
	prompt_template: BookOpen,
	tool_pack: Puzzle,
	mcp_preset: Plug,
	workflow_template: Workflow,
	knowledge_template: BookMarked,
	provider_preset: Settings,
};

export function ItemIcon({
	type,
	className,
}: {
	type: string;
	className?: string;
}) {
	const Icon = itemIconMap[type] ?? Package;
	return <Icon className={className} />;
}

export function getItemLabel(
	type: string,
	t?: (key: string) => string,
) {
	if (t) {
		return getItemTypeLabel(type, t);
	}
	switch (type) {
		case "agent":
			return "Agent";
		case "skill":
			return "Skill";
		case "custom_tool":
			return "Tool";
		case "prompt_template":
			return "Prompt";
		case "tool_pack":
			return "Tool Pack";
		case "mcp_preset":
			return "MCP Preset";
		case "workflow_template":
			return "Workflow";
		case "knowledge_template":
			return "Knowledge";
		case "provider_preset":
			return "Provider";
		default:
			return type;
	}
}
