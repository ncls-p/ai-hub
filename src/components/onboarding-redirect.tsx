"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";

import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson } from "@/lib/api-client";

export function OnboardingRedirect() {
	const router = useRouter();
	const pathname = usePathname();
	const { workspaceId, isLoading } = useWorkspace();

	useEffect(() => {
		if (isLoading || !workspaceId) return;
		if (pathname === "/setup") return;

		let cancelled = false;

		async function checkOnboarding() {
			try {
				const { completed } = await fetchJson<{ completed: boolean }>(
					"/api/onboarding",
				);
				if (cancelled || completed) return;

				const providers = await fetchJson<unknown[]>(
					`/api/workspace/providers?workspaceId=${workspaceId}`,
				);
				if (cancelled) return;
				if (Array.isArray(providers) && providers.length === 0) {
					router.replace("/setup");
				}
			} catch {
				// Ignore onboarding redirect failures
			}
		}

		void checkOnboarding();
		return () => {
			cancelled = true;
		};
	}, [workspaceId, isLoading, pathname, router]);

	return null;
}

export async function markOnboardingComplete() {
	await fetch("/api/onboarding", { method: "POST" });
}
