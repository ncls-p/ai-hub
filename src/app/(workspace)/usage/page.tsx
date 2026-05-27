"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3Icon } from "lucide-react";
import { toast } from "sonner";
import { PageLoading, ListSkeleton } from "@/components/page-loading";
import { WorkspacePage } from "@/components/workspace-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/hooks/use-workspace";

interface UsageEvent {
	id: string;
	operation: string;
	inputTokens: number | null;
	outputTokens: number | null;
	status: string | null;
	latencyMs: number | null;
	createdAt: string;
}
interface UsageResponse {
	totals: { inputTokens: number; outputTokens: number; events: number };
	events: UsageEvent[];
	quota: {
		limit: number;
		used: number;
		remaining: number;
	} | null;
}

export default function UsagePage() {
	const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
	const [data, setData] = useState<UsageResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [operationFilter, setOperationFilter] = useState("");
	const [fromDate, setFromDate] = useState("");
	const [toDate, setToDate] = useState("");

	const loadUsage = useCallback(async () => {
		if (!workspaceId) return;
		const params = new URLSearchParams({ workspaceId, limit: "100" });
		if (operationFilter.trim()) {
			params.set("operation", operationFilter.trim());
		}
		if (fromDate) params.set("from", new Date(fromDate).toISOString());
		if (toDate) params.set("to", new Date(`${toDate}T23:59:59`).toISOString());
		const res = await fetch(`/api/workspace/usage?${params.toString()}`);
		if (!res.ok) throw new Error("Failed to load usage");
		setData(await res.json());
	}, [fromDate, operationFilter, toDate, workspaceId]);

	const chartMaxTokens = Math.max(
		...(data?.events.map(
			(event) => (event.inputTokens ?? 0) + (event.outputTokens ?? 0),
		) ?? [1]),
		1,
	);

	useEffect(() => {
		if (!workspaceId) return;
		let cancelled = false;
		async function run() {
			try {
				await loadUsage();
			} catch (error) {
				if (!cancelled)
					toast.error(
						error instanceof Error ? error.message : "Failed to load usage",
					);
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		void run();
		return () => {
			cancelled = true;
		};
	}, [loadUsage, workspaceId]);

	if (workspaceLoading || !workspaceId) {
		return <PageLoading label="Loading workspace" />;
	}

	return (
		<WorkspacePage
			kicker="Governance"
			title="Usage"
			description="Track token consumption across chat, tools, embeddings, and integrations."
			width="wide"
		>
			{data?.quota ? (
				<Card>
					<CardHeader>
						<CardTitle>Monthly tokens</CardTitle>
						<CardDescription>
							{data.quota.used.toLocaleString()} / {data.quota.limit.toLocaleString()} tokens this month
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						<div className="h-2 overflow-hidden rounded-full bg-muted">
							<div
								className={`h-full rounded-full ${
									data.quota.used / data.quota.limit >= 0.8
										? "bg-warning"
										: "bg-primary"
								}`}
								style={{
									width: `${Math.min(100, Math.round((data.quota.used / data.quota.limit) * 100))}%`,
								}}
							/>
						</div>
						{data.quota.used / data.quota.limit >= 0.8 ? (
							<p className="text-sm text-warning">
								Approaching or exceeding the configured monthly limit.
							</p>
						) : null}
					</CardContent>
				</Card>
			) : null}

			<Card>
				<CardContent className="flex flex-wrap items-end gap-3 p-4">
					<div className="grid flex-1 gap-2">
						<Label htmlFor="usage-operation-filter">Operation filter</Label>
						<Input
							id="usage-operation-filter"
							placeholder="e.g. chat"
							value={operationFilter}
							onChange={(e) => setOperationFilter(e.target.value)}
						/>
					</div>
					<div className="grid min-w-[10rem] gap-2">
						<Label htmlFor="usage-from">From</Label>
						<Input
							id="usage-from"
							type="date"
							value={fromDate}
							onChange={(e) => setFromDate(e.target.value)}
						/>
					</div>
					<div className="grid min-w-[10rem] gap-2">
						<Label htmlFor="usage-to">To</Label>
						<Input
							id="usage-to"
							type="date"
							value={toDate}
							onChange={(e) => setToDate(e.target.value)}
						/>
					</div>
					<Button onClick={() => void loadUsage()}>Apply filter</Button>
				</CardContent>
			</Card>

			{loading ? (
				<ListSkeleton rows={4} />
			) : (
				<>
					<div className="grid gap-4 sm:grid-cols-3">
						<Card>
							<CardHeader>
								<CardTitle>Events</CardTitle>
							</CardHeader>
							<CardContent className="text-3xl font-semibold">
								{data?.totals.events ?? 0}
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle>Input tokens</CardTitle>
							</CardHeader>
							<CardContent className="text-3xl font-semibold">
								{data?.totals.inputTokens ?? 0}
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle>Output tokens</CardTitle>
							</CardHeader>
							<CardContent className="text-3xl font-semibold">
								{data?.totals.outputTokens ?? 0}
							</CardContent>
						</Card>
					</div>
					<Card>
						<CardHeader>
							<CardTitle>Token chart</CardTitle>
							<CardDescription>
								Relative token totals for recent usage events.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex h-40 items-end gap-1">
							{data?.events.slice(0, 24).map((event) => {
								const total =
									(event.inputTokens ?? 0) + (event.outputTokens ?? 0);
								const height = Math.max(8, (total / chartMaxTokens) * 100);
								return (
									<div
										key={event.id}
										className="flex min-w-0 flex-1 flex-col items-center gap-1"
										title={`${event.operation}: ${total} tokens`}
									>
										<div
											className="w-full rounded-t bg-primary/70"
											style={{ height: `${height}%` }}
										/>
									</div>
								);
							})}
							{data?.events.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									No usage to chart yet.
								</p>
							) : null}
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<BarChart3Icon className="size-5" />
								Recent usage
							</CardTitle>
							<CardDescription>
								Newest usage records in this workspace.
							</CardDescription>
						</CardHeader>
						<CardContent className="grid gap-2">
							{data?.events.map((event) => (
								<div
									key={event.id}
									className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"
								>
									<div className="flex items-center gap-2">
										<Badge variant="outline">{event.operation}</Badge>
										{event.status ? (
											<Badge variant="secondary">{event.status}</Badge>
										) : null}
										<span>{new Date(event.createdAt).toLocaleString()}</span>
									</div>
									<span className="text-muted-foreground">
										{event.inputTokens ?? 0} in / {event.outputTokens ?? 0} out
										· {event.latencyMs ?? 0}ms
									</span>
								</div>
							))}
							{data?.events.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									No usage recorded yet.
								</p>
							) : null}
						</CardContent>
					</Card>
				</>
			)}
		</WorkspacePage>
	);
}
