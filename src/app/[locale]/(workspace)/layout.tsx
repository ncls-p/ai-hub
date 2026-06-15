import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

import { AppShell } from "@/components/app-shell";
import { OnboardingRedirect } from "@/components/onboarding-redirect";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { isPlatformAdminSession } from "@/modules/admin/auth";
import { getSession } from "@/modules/auth/session";
import { getSidebarNavConfig } from "@/modules/navigation/sidebar-config.server";
import { ensurePrimaryWorkspaceForUser } from "@/modules/workspace/use-cases";

export const metadata: Metadata = {
	title: "App",
};

// Workspace pages depend on request-bound auth/session state.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WorkspaceLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await getSession();
	if (!session?.user) {
		const locale = await getLocale();
		return redirect({ href: "/auth/signin", locale });
	}
	const user = session.user;
	const displayName = user.name || user.email;
	const isAdmin = await isPlatformAdminSession(session);
	await ensurePrimaryWorkspaceForUser({
		userId: user.id,
		role: isAdmin ? "admin" : user.role,
	});
	const sidebarNavConfig = await getSidebarNavConfig();

	return (
		<WorkspaceProvider>
			<OnboardingRedirect />
			<AppShell
				displayName={displayName}
				currentUserId={user.id}
				isAdmin={isAdmin}
				sidebarNavConfig={sidebarNavConfig ?? undefined}
			>
				<div className="page-content h-full">{children}</div>
			</AppShell>
		</WorkspaceProvider>
	);
}
