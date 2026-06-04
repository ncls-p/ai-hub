import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/modules/auth/session";

export const metadata: Metadata = {
	title: "Account",
	description: "Sign in or create an AI Hub account.",
};

// Auth pages depend on client-only form state and auth redirects.
// Keep this segment dynamic to avoid prerendering React client hook internals.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AuthLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const session = await getSession();
	if (session) redirect("/chat");

	return children;
}
