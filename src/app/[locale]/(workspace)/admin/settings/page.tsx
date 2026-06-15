import { ShieldAlertIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { WorkspacePage } from "@/components/workspace-page";
import { ChatAutomationSettings } from "@/components/admin/chat-automation-settings";
import { CustomToolBuilderSettings } from "@/components/admin/custom-tool-builder-settings";
import { RegistrationSettings } from "@/components/admin/registration-settings";
import { SidebarNavigationSettings } from "@/components/admin/sidebar-navigation-settings";
import { SystemHealthCard } from "@/components/admin/system-health-card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { isPlatformAdminSession } from "@/modules/admin/auth";
import { getRegistrationSetting } from "@/modules/admin/use-cases";
import { getSession } from "@/modules/auth/session";

export default async function AdminSettingsPage() {
	const t = await getTranslations("admin");
	const session = await getSession();
	const isAdmin = await isPlatformAdminSession(session);

	if (!session || !isAdmin) {
		return (
			<WorkspacePage title={t("platformSettingsTitle")} width="default">
				<Empty className="min-h-80 border border-border/70 bg-background/55">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<ShieldAlertIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>{t("adminRequired")}</EmptyTitle>
						<EmptyDescription>{t("adminRequiredDescription")}</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</WorkspacePage>
		);
	}

	const registration = await getRegistrationSetting();

	return (
		<WorkspacePage
			title={t("platformSettingsTitle")}
			description={t("platformSettingsDescription")}
			width="default"
		>
			<div className="flex flex-col gap-6">
				<div className="grid gap-6 lg:grid-cols-2">
					<RegistrationSettings initialState={registration} />
					<SystemHealthCard />
				</div>
				<SidebarNavigationSettings />
				<ChatAutomationSettings />
				<CustomToolBuilderSettings />
			</div>
		</WorkspacePage>
	);
}
