import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/modules/auth/session";

export const metadata: Metadata = {
	title: "Account",
	description: "Sign in or create an AI Hub account.",
};

export default async function AuthLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const session = await getSession();
	if (session) redirect("/chat");

	return children;
}
