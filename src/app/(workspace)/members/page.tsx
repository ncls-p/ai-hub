import { ShieldAlertIcon } from "lucide-react";

import { WorkspacePage } from "@/components/workspace-page";
import { UserManagement } from "@/components/admin/user-management";
import { WorkspaceMemberManagement } from "@/components/workspace-member-management";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	ensureBootstrapAdmin,
	isAdminRole,
	listAdminUsers,
} from "@/modules/admin/use-cases";
import { getSession } from "@/modules/auth/session";

export default async function MembersPage() {
	const session = await getSession();
	const bootstrappedAdminId = await ensureBootstrapAdmin();
	const isAdmin =
		isAdminRole(session?.user.role) || bootstrappedAdminId === session?.user.id;

	if (!session) {
		return (
			<WorkspacePage title="Team" width="default">
				<Empty className="min-h-80 border border-border/70 bg-background/55">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<ShieldAlertIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>Sign in required</EmptyTitle>
						<EmptyDescription>
							Sign in to manage workspace members.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</WorkspacePage>
		);
	}

	const users = isAdmin ? await listAdminUsers() : [];

	return (
		<WorkspacePage
			kicker="Team"
			title="Team"
			description="Invite colleagues to your workspace or manage platform accounts."
			width="default"
		>
			<WorkspaceMemberManagement currentUserId={session.user.id} />

			{isAdmin ? (
				<div className="flex flex-col gap-3">
					<div>
						<h2 className="text-lg font-semibold">Platform accounts</h2>
						<p className="text-sm text-muted-foreground">
							Create sign-in accounts. New users can be added to this workspace
							automatically.
						</p>
					</div>
					<UserManagement
						initialUsers={JSON.parse(JSON.stringify(users))}
						currentUserId={session.user.id}
					/>
				</div>
			) : null}
		</WorkspacePage>
	);
}
