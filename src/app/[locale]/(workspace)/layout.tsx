import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

import { AppShell } from "@/components/app-shell";
import { OnboardingRedirect } from "@/components/onboarding-redirect";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { env } from "@/lib/env";
import { ensureBootstrapAdmin, isAdminRole } from "@/modules/admin/use-cases";
import { getSession } from "@/modules/auth/session";
import {
	createWorkspace,
	countWorkspaces,
	getWorkspacesByUserId,
} from "@/modules/workspace/use-cases";

export const metadata: Metadata = {
	title: "Workspace",
};

// Workspace pages depend on request-bound auth/session state.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function toSlug(value: string, fallback: string) {
	const slug = value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64);

	return slug || fallback;
}

async function ensureDefaultWorkspace(user: {
	id: string;
	name?: string | null;
	email?: string | null;
}) {
	const existingWorkspaces = await getWorkspacesByUserId(user.id);
	if (existingWorkspaces.length > 0) return;

	const allowPersonal = env.ALLOW_PERSONAL_WORKSPACES !== "false";
	const totalWorkspaces = await countWorkspaces();

	if (!allowPersonal && totalWorkspaces > 0) return;

	const displayName = user.name?.trim() || user.email?.split("@")[0] || "User";
	const uniqueSuffix = user.id.replace(/-/g, "").slice(0, 10);
	const baseSlug = toSlug(displayName, "workspace");

	try {
		await createWorkspace({
			userId: user.id,
			organizationName: `${displayName}'s Organization`,
			organizationSlug: `${baseSlug}-${uniqueSuffix}`,
			workspaceName: `${displayName}'s Workspace`,
			workspaceSlug: "main",
		});
	} catch (error) {
		const workspacesAfterRace = await getWorkspacesByUserId(user.id);
		if (workspacesAfterRace.length > 0) return;
		throw error;
	}
}

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
	const bootstrappedAdminId = await ensureBootstrapAdmin();
	await ensureDefaultWorkspace(user);
	const displayName = user.name || user.email;
	const isAdmin =
		isAdminRole(user.role) || bootstrappedAdminId === user.id;

	return (
		<WorkspaceProvider>
			<OnboardingRedirect />
			<AppShell displayName={displayName} isAdmin={isAdmin}>
				<div className="page-content h-full">{children}</div>
			</AppShell>
		</WorkspaceProvider>
	);
}
