import { AppShell } from "@/components/app-shell";
import { getSession } from "@/modules/auth/session";

export default async function WorkspaceLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await getSession();
	const displayName = session?.user.name || session?.user.email || undefined;

	return <AppShell displayName={displayName}>{children}</AppShell>;
}
