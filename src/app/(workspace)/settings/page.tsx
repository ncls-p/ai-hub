import { ShieldAlertIcon } from "lucide-react";

import { WorkspacePage } from "@/components/workspace-page";
import { RegistrationSettings } from "@/components/admin/registration-settings";
import { SystemHealthCard } from "@/components/admin/system-health-card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	ensureBootstrapAdmin,
	getRegistrationSetting,
	isAdminRole,
} from "@/modules/admin/use-cases";
import { getSession } from "@/modules/auth/session";

export default async function SettingsPage() {
	const session = await getSession();
	const bootstrappedAdminId = await ensureBootstrapAdmin();
	const isAdmin =
		isAdminRole(session?.user.role) || bootstrappedAdminId === session?.user.id;

	if (!session || !isAdmin) {
		return (
			<WorkspacePage title="Settings" width="narrow">
				<Empty className="min-h-80 border border-border/70 bg-background/55">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<ShieldAlertIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>Admin access required</EmptyTitle>
						<EmptyDescription>
							Only admins can change account and registration settings.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</WorkspacePage>
		);
	}

	const registration = await getRegistrationSetting();

	return (
		<WorkspacePage
			kicker="Admin"
			title="Settings"
			description="Platform configuration, registration policy, and system health."
			width="narrow"
		>
			<RegistrationSettings initialState={registration} />
			<SystemHealthCard />
		</WorkspacePage>
	);
}
