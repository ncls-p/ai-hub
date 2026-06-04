"use client";

import { WorkspaceApiKeys } from "@/components/workspace-api-keys";
import { WorkspacePage } from "@/components/workspace-page";

export default function ApiKeysPage() {
	return (
		<WorkspacePage
			title="API Keys"
			description="Create and manage API keys for external scripts, CI pipelines, and integrations."
			width="narrow"
		>
			<WorkspaceApiKeys />
		</WorkspacePage>
	);
}
