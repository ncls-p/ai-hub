"use client";

import { McpServerManager } from "@/components/mcp/mcp-server-manager";
import { WorkspacePage } from "@/components/workspace-page";

export default function McpPage() {
	return (
		<WorkspacePage
			kicker="MCP"
			title="MCP"
			description="Connect, configure, sync, and share MCP tools across your workspace assistants."
			width="wide"
		>
			<McpServerManager />
		</WorkspacePage>
	);
}
