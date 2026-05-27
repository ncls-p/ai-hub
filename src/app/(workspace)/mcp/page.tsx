"use client";

import { McpServerManager } from "@/components/mcp/mcp-server-manager";
import { WorkspacePage } from "@/components/workspace-page";

export default function McpPage() {
	return (
		<WorkspacePage
			kicker="Integrations"
			title="MCP integrations"
			description="Connect, configure, sync, and share tools from MCP servers across your workspace assistants."
			width="wide"
		>
			<McpServerManager />
		</WorkspacePage>
	);
}
