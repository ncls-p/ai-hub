"use client";

import { useTranslations } from "next-intl";

import { SetupWizard } from "@/components/setup/setup-wizard";
import { PageLoading } from "@/components/page-loading";
import { WorkspacePage } from "@/components/workspace-page";
import { useRouter } from "@/i18n/navigation";
import { useWorkspace } from "@/hooks/use-workspace";

export default function SetupPage() {
	const t = useTranslations("setup");
	const router = useRouter();
	const { workspaceId, isLoading } = useWorkspace();

	if (isLoading || !workspaceId) {
		return <PageLoading label={t("title")} />;
	}

	return (
		<WorkspacePage title={t("title")} description={t("description")} width="narrow">
			<SetupWizard
				mode="page"
				onCompleteAction={(agentId) => {
					router.push(`/chat?agentId=${agentId}`);
				}}
			/>
		</WorkspacePage>
	);
}
