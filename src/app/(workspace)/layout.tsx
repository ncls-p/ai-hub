import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getSession } from "@/modules/auth/session";
import {
	createWorkspace,
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

	await ensureDefaultWorkspace(session.user);
	const displayName = session.user.name || session.user.email;

	return <AppShell displayName={displayName}>{children}</AppShell>;
}
