"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOutIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function SignOutButton() {
	const router = useRouter();
	const [pending, setPending] = useState(false);

	async function signOut() {
		setPending(true);

		try {
			const response = await fetch("/api/auth/sign-out", {
				method: "POST",
			});

			if (!response.ok) throw new Error("Sign out failed");

			window.sessionStorage.removeItem("active_workspace_id");
			router.push("/auth/signin");
			router.refresh();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Sign out failed");
		} finally {
			setPending(false);
		}
	}

	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className="justify-start rounded-xl"
			onClick={signOut}
			disabled={pending}
		>
			{pending ? (
				<Spinner data-icon="inline-start" />
			) : (
				<LogOutIcon data-icon="inline-start" aria-hidden="true" />
			)}
			Sign out
		</Button>
	);
}
