"use client";

import { SetupWizard } from "@/components/setup/setup-wizard";
import { PageLoading } from "@/components/page-loading";
import { WorkspacePage } from "@/components/workspace-page";
import { useWorkspace } from "@/hooks/use-workspace";

export default function SetupPage() {
	const { workspaceId, isLoading } = useWorkspace();

	if (isLoading || !workspaceId) {
		return <PageLoading label="Loading workspace" />;
	}

	return (
		<WorkspacePage
			kicker="Setup"
			title="Welcome to AI Hub"
			description="Connect an AI provider, pick a model, and send your first message."
			width="narrow"
		>
			<SetupWizard
				mode="page"
				onComplete={(agentId) => {
					window.location.href = `/chat?agentId=${agentId}`;
				}}
			/>
		</WorkspacePage>
	);
}
