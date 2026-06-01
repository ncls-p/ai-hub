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
			title="Get started"
			description="Three quick steps to start chatting with AI."
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
