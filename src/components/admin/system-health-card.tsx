"use client";

import { useEffect, useState } from "react";
import { ActivityIcon, Loader2, StoreIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

type HealthResponse = {
	status: string;
	database?: string;
};

export function SystemHealthCard() {
	const [health, setHealth] = useState<HealthResponse | null>(null);
	const [pendingReviews, setPendingReviews] = useState<number | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			try {
				const [healthRes, marketplaceRes] = await Promise.all([
					fetch("/api/health"),
					fetch("/api/marketplace/items?status=pending_review"),
				]);
				if (!cancelled && healthRes.ok) {
					setHealth((await healthRes.json()) as HealthResponse);
				}
				if (!cancelled && marketplaceRes.ok) {
					const items = (await marketplaceRes.json()) as unknown[];
					setPendingReviews(Array.isArray(items) ? items.length : 0);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<ActivityIcon className="size-4" aria-hidden="true" />
					System status
				</CardTitle>
				<CardDescription>
					Health checks and operational counters.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{loading ? (
					<Loader2 className="size-5 animate-spin text-muted-foreground" />
				) : (
					<>
						<div className="flex items-center justify-between rounded-xl border p-3">
							<span className="text-sm">API health</span>
							<Badge
								variant={
									health?.status === "ok" ? "secondary" : "destructive"
								}
							>
								{health?.status ?? "unknown"}
							</Badge>
						</div>
						{pendingReviews !== null ? (
							<div className="flex items-center justify-between rounded-xl border p-3">
								<span className="flex items-center gap-2 text-sm">
									<StoreIcon className="size-4" aria-hidden="true" />
									Marketplace pending review
								</span>
								<Badge variant={pendingReviews > 0 ? "destructive" : "outline"}>
									{pendingReviews}
								</Badge>
							</div>
						) : null}
					</>
				)}
			</CardContent>
		</Card>
	);
}
