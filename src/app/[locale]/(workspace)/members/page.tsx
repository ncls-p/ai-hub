import { ShieldAlertIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { WorkspacePage } from "@/components/workspace-page";
import { UserManagement } from "@/components/admin/user-management";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { isPlatformAdminSession } from "@/modules/admin/auth";
import { listAdminUsers } from "@/modules/admin/use-cases";
import { getSession } from "@/modules/auth/session";

export default async function MembersPage() {
	const t = await getTranslations("admin");
	const session = await getSession();
	const isAdmin = await isPlatformAdminSession(session);

	if (!session) {
		return (
			<WorkspacePage title={t("membersTitle")} width="default">
				<Empty className="min-h-80 border border-border/70 bg-background/55">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<ShieldAlertIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>{t("signInRequired")}</EmptyTitle>
						<EmptyDescription>
							{t("signInRequiredDescription")}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</WorkspacePage>
		);
	}

	if (!isAdmin) {
		return (
			<WorkspacePage title={t("membersTitle")} width="default">
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

	const users = await listAdminUsers();

	return (
		<WorkspacePage
			title={t("platformAccounts")}
			description={t("platformAccountsDescription")}
			width="wide"
		>
			<UserManagement
				initialUsers={JSON.parse(JSON.stringify(users))}
				currentUserId={session.user.id}
			/>
		</WorkspacePage>
	);
}
