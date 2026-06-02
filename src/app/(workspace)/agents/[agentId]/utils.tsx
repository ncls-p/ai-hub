import type { ReactNode } from "react";
import {
	BrainIcon,
	ServerIcon,
	SparklesIcon,
	ZapIcon,
} from "lucide-react";

import type { McpServer, McpTool, ToolBindingState } from "./types";
import { AVATAR_COLORS } from "./types";

/* ─── Avatar helpers ──────────────────────────────────────────────── */

export function getAvatarColor(name: string): string {
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = name.charCodeAt(i) + ((hash << 5) - hash);
	}
	return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getInitials(name: string): string {
	return name
		.split(/\s+/)
		.map((w) => w[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

/* ─── Provider icon ───────────────────────────────────────────────── */

export function getProviderKindIcon(kind: string): ReactNode {
	switch (kind.toLowerCase()) {
		case "openai":
			return <SparklesIcon className="size-4" aria-hidden="true" />;
		case "anthropic":
			return <BrainIcon className="size-4" aria-hidden="true" />;
		case "google":
		case "gemini":
			return <ZapIcon className="size-4" aria-hidden="true" />;
		case "openrouter":
			return <ServerIcon className="size-4" aria-hidden="true" />;
		default:
			return <ServerIcon className="size-4" aria-hidden="true" />;
	}
}

/* ─── MCP helpers ─────────────────────────────────────────────────── */

export function getMcpServerState(
	serverId: string,
	mcpTools: McpTool[],
	mcpServers: McpServer[],
	mcpBindings: ToolBindingState,
) {
	const getServerTools = (sid: string) =>
		mcpTools.filter((tool) => tool.mcpServerId === sid);
	const getMcpServer = (sid: string) =>
		mcpServers.find((server) => server.id === sid);

	const isApprovalForced = (tool: McpTool) =>
		Boolean(getMcpServer(tool.mcpServerId)?.requireApproval) ||
		tool.requireApproval;

	const allTools = getServerTools(serverId);
	const bindableTools = allTools.filter((tool) => tool.enabled);
	const selectedTools = bindableTools.filter(
		(tool) => mcpBindings[tool.id]?.enabled,
	);
	const selectedApprovalTools = selectedTools.filter(
		(tool) => isApprovalForced(tool) || mcpBindings[tool.id]?.requireApproval,
	);
	const forcedApprovalCount = selectedTools.filter(isApprovalForced).length;

	return {
		allTools,
		bindableTools,
		selectedCount: selectedTools.length,
		forcedApprovalCount,
		allSelected:
			bindableTools.length > 0 &&
			selectedTools.length === bindableTools.length,
		someSelected:
			selectedTools.length > 0 &&
			selectedTools.length < bindableTools.length,
		allApproval:
			selectedTools.length > 0 &&
			selectedApprovalTools.length === selectedTools.length,
		someApproval:
			selectedApprovalTools.length > 0 &&
			selectedApprovalTools.length < selectedTools.length,
	};
}

export function isMcpToolApprovalForced(
	tool: McpTool,
	mcpServers: McpServer[],
) {
	const server = mcpServers.find((s) => s.id === tool.mcpServerId);
	return Boolean(server?.requireApproval) || tool.requireApproval;
}
