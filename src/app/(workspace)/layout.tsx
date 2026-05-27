import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { OnboardingRedirect } from "@/components/onboarding-redirect";
import { WorkspaceProvider } from "@/components/workspace-provider";
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

	const allowPersonal =
		process.env.ALLOW_PERSONAL_WORKSPACES !== "false";
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
	if (!session) redirect("/auth/signin");

	const bootstrappedAdminId = await ensureBootstrapAdmin();
	await ensureDefaultWorkspace(session.user);
	const displayName = session.user.name || session.user.email;
	const isAdmin =
		isAdminRole(session.user.role) || bootstrappedAdminId === session.user.id;

	return (
		<WorkspaceProvider>
			<OnboardingRedirect />
			<AppShell displayName={displayName} isAdmin={isAdmin}>
				{children}
			</AppShell>
		</WorkspaceProvider>
	);
}
