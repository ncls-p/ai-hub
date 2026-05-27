"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardListIcon } from "lucide-react";
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
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/hooks/use-workspace";

interface AuditEvent {
	id: string;
	action: string;
	resourceType: string | null;
	outcome: string;
	actorPrincipalId: string | null;
	actorName: string | null;
	actorEmail: string | null;
	createdAt: string;
}

export default function AuditPage() {
	const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
	const [events, setEvents] = useState<AuditEvent[]>([]);
	const [loading, setLoading] = useState(true);
	const [actionFilter, setActionFilter] = useState("");
	const [outcomeFilter, setOutcomeFilter] = useState("all");
	const [fromDate, setFromDate] = useState("");
	const [toDate, setToDate] = useState("");

	const loadEvents = useCallback(async () => {
		if (!workspaceId) return;
		const params = new URLSearchParams({ workspaceId, limit: "100" });
		if (actionFilter.trim()) params.set("action", actionFilter.trim());
		if (outcomeFilter !== "all") params.set("outcome", outcomeFilter);
		if (fromDate) params.set("from", new Date(fromDate).toISOString());
		if (toDate) params.set("to", new Date(`${toDate}T23:59:59`).toISOString());
		const res = await fetch(`/api/workspace/audit?${params.toString()}`);
		if (!res.ok) throw new Error("Failed to load audit log");
		setEvents(await res.json());
	}, [actionFilter, fromDate, outcomeFilter, toDate, workspaceId]);

	function exportCsv() {
		if (events.length === 0) return;
		const header = ["createdAt", "action", "resourceType", "outcome", "actor"];
		const rows = events.map((event) =>
			[
				event.createdAt,
				event.action,
				event.resourceType ?? "",
				event.outcome,
				event.actorName ?? event.actorEmail ?? event.actorPrincipalId ?? "",
			]
				.map((value) => `"${String(value).replace(/"/g, '""')}"`)
				.join(","),
		);
		const blob = new Blob([[header.join(","), ...rows].join("\n")], {
			type: "text/csv;charset=utf-8;",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `audit-${workspaceId?.slice(0, 8) ?? "export"}.csv`;
		link.click();
		URL.revokeObjectURL(url);
	}

	useEffect(() => {
		if (!workspaceId) return;
		let cancelled = false;
		async function run() {
			try {
				await loadEvents();
			} catch (error) {
				if (!cancelled)
					toast.error(
						error instanceof Error ? error.message : "Failed to load audit log",
					);
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		void run();
		return () => {
			cancelled = true;
		};
	}, [loadEvents, workspaceId]);

	if (workspaceLoading || !workspaceId) {
		return <PageLoading label="Loading workspace" />;
	}

	return (
		<WorkspacePage
			kicker="Governance"
			title="Activity log"
			description="Security-sensitive actions are recorded with actor, resource, outcome, and timestamp."
			width="default"
		>
			<Card>
				<CardContent className="flex flex-wrap items-end gap-3 p-4">
					<div className="grid min-w-[12rem] flex-1 gap-2">
						<Label htmlFor="audit-action-filter">Action contains</Label>
						<Input
							id="audit-action-filter"
							placeholder="agent.created"
							value={actionFilter}
							onChange={(e) => setActionFilter(e.target.value)}
						/>
					</div>
					<div className="grid min-w-[10rem] gap-2">
						<Label>Outcome</Label>
						<Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All</SelectItem>
								<SelectItem value="success">Success</SelectItem>
								<SelectItem value="failed">Failed</SelectItem>
								<SelectItem value="denied">Denied</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="grid min-w-[10rem] gap-2">
						<Label htmlFor="audit-from">From</Label>
						<Input
							id="audit-from"
							type="date"
							value={fromDate}
							onChange={(e) => setFromDate(e.target.value)}
						/>
					</div>
					<div className="grid min-w-[10rem] gap-2">
						<Label htmlFor="audit-to">To</Label>
						<Input
							id="audit-to"
							type="date"
							value={toDate}
							onChange={(e) => setToDate(e.target.value)}
						/>
					</div>
					<Button onClick={() => void loadEvents()}>Apply filters</Button>
					<Button variant="outline" onClick={exportCsv} disabled={events.length === 0}>
						Export CSV
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<ClipboardListIcon className="size-5" />
						Recent events
					</CardTitle>
					<CardDescription>Filtered workspace audit events.</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-2">
					{loading ? (
						<ListSkeleton rows={5} />
					) : events.length === 0 ? (
						<Empty className="border border-dashed border-border/70 py-8">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<ClipboardListIcon aria-hidden="true" />
								</EmptyMedia>
								<EmptyTitle>No events match</EmptyTitle>
								<EmptyDescription>
									Try adjusting filters or check back after activity in this
									workspace.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						events.map((event) => (
							<div
								key={event.id}
								className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"
							>
								<div className="flex min-w-0 flex-col gap-1">
									<div className="flex flex-wrap items-center gap-2">
										<Badge
											variant={
												event.outcome === "success"
													? "secondary"
													: "destructive"
											}
										>
											{event.outcome}
										</Badge>
										<span className="font-medium">{event.action}</span>
										<span className="text-muted-foreground">
											{event.resourceType}
										</span>
									</div>
									<span
										className="text-xs text-muted-foreground"
										title={event.actorPrincipalId ?? undefined}
									>
										{event.actorName ?? event.actorEmail ?? "System"}
									</span>
								</div>
								<span className="text-muted-foreground">
									{new Date(event.createdAt).toLocaleString()}
								</span>
							</div>
						))
					)}
				</CardContent>
			</Card>
		</WorkspacePage>
	);
}
