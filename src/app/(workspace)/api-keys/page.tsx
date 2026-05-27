"use client";

import { WorkspaceApiKeys } from "@/components/workspace-api-keys";
import { WorkspacePage } from "@/components/workspace-page";

export default function ApiKeysPage() {
	return (
		<WorkspacePage
			kicker="Access"
			title="API keys"
			description="Create and revoke workspace API keys for scripts, CI, and integrations."
			width="narrow"
		>
			<WorkspaceApiKeys />
		</WorkspacePage>
	);
}
