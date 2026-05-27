"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	CheckCircle2,
	Clock,
	Loader2,
	ShieldAlert,
	XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { PageLoading } from "@/components/page-loading";
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
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/hooks/use-workspace";

interface ToolInvocation {
	id: string;
	conversationId: string | null;
	messageId: string | null;
	toolSource: string;
	toolId: string;
	toolName: string;
	riskLevel: string | null;
	status: string;
	latencyMs: number | null;
	errorMessage: string | null;
	approvedByUserId: string | null;
	createdAt: string;
	completedAt: string | null;
}

type ToolAction = "approve" | "reject";

const TOOL_STATUS_FILTERS = [
	{ value: "all", label: "All" },
	{ value: "awaiting_approval", label: "Pending" },
	{ value: "success", label: "Success" },
	{ value: "failed", label: "Failed" },
	{ value: "rejected", label: "Rejected" },
	{ value: "denied", label: "Denied" },
] as const;

function isPendingApproval(invocation: ToolInvocation) {
	return (
		invocation.status === "awaiting_approval" ||
		invocation.status === "pending_approval"
	);
}

function getStatusLabel(status: string) {
	return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getStatusBadgeVariant(status: string) {
	if (status === "success") return "secondary" as const;
	if (status === "awaiting_approval" || status === "pending_approval") {
		return "outline" as const;
	}
	return "destructive" as const;
}

function StatusIcon({ status }: { status: string }) {
	const className = "size-4 shrink-0";
	switch (status) {
		case "success":
			return <CheckCircle2 className={`${className} text-green-500`} />;
		case "awaiting_approval":
		case "pending_approval":
			return <Clock className={`${className} text-yellow-500`} />;
		case "failed":
			return <XCircle className={`${className} text-red-500`} />;
		case "rejected":
			return <XCircle className={`${className} text-orange-500`} />;
		case "denied":
			return <ShieldAlert className={`${className} text-red-500`} />;
		default:
			return <Clock className={`${className} text-muted-foreground`} />;
	}
}

function RiskBadge({ riskLevel }: { riskLevel: string | null }) {
	if (!riskLevel) return null;
	const variant =
		riskLevel === "high" || riskLevel === "critical"
			? "destructive"
			: riskLevel === "medium"
				? "outline"
				: "secondary";
	return <Badge variant={variant}>{riskLevel}</Badge>;
}

function InvocationActions({
	invocationId,
	busyAction,
	onApprove,
	onReject,
}: {
	invocationId: string;
	busyAction: ToolAction | null;
	onApprove: (invocationId: string) => void;
	onReject: (invocationId: string) => void;
}) {
	return (
		<div className="flex items-center gap-2">
			<Button
				type="button"
				size="sm"
				variant="outline"
				onClick={() => onReject(invocationId)}
				disabled={busyAction !== null}
			>
				{busyAction === "reject" ? (
					<Loader2 className="animate-spin" aria-hidden="true" />
				) : (
					<XCircle data-icon="inline-start" aria-hidden="true" />
				)}
				Reject
			</Button>
			<Button
				type="button"
				size="sm"
				onClick={() => onApprove(invocationId)}
				disabled={busyAction !== null}
			>
				{busyAction === "approve" ? (
					<Loader2 className="animate-spin" aria-hidden="true" />
				) : (
					<CheckCircle2 data-icon="inline-start" aria-hidden="true" />
				)}
				Approve
			</Button>
		</div>
	);
}

function InvocationSummary({ invocation }: { invocation: ToolInvocation }) {
	return (
		<div className="flex flex-col gap-1">
			<div className="flex flex-wrap items-center gap-2">
				<StatusIcon status={invocation.status} />
				<span className="font-medium">{invocation.toolName}</span>
				<RiskBadge riskLevel={invocation.riskLevel} />
				<Badge variant="outline">{invocation.toolSource}</Badge>
				<Badge variant={getStatusBadgeVariant(invocation.status)}>
					{getStatusLabel(invocation.status)}
				</Badge>
			</div>
			<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				<span>{new Date(invocation.createdAt).toLocaleString()}</span>
				{invocation.latencyMs !== null && (
					<>
						<span>·</span>
						<span>{invocation.latencyMs}ms</span>
					</>
				)}
				{invocation.conversationId ? (
					<>
						<span>·</span>
						<Link
							href={`/chat?conversationId=${invocation.conversationId}`}
							className="text-primary hover:underline"
						>
							View conversation
						</Link>
					</>
				) : null}
				{invocation.errorMessage && (
					<>
						<span>·</span>
						<span className="text-red-500">{invocation.errorMessage}</span>
					</>
				)}
			</div>
		</div>
	);
}

function PendingApprovalsPanel({
	invocations,
	busyInvocation,
	onApprove,
	onReject,
}: {
	invocations: ToolInvocation[];
	busyInvocation: { id: string; action: ToolAction } | null;
	onApprove: (invocationId: string) => void;
	onReject: (invocationId: string) => void;
}) {
	if (invocations.length === 0) return null;

	return (
		<Card className="border-yellow-500/30 bg-yellow-500/5">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
					<Clock className="size-5" aria-hidden="true" />
					Pending Approvals ({invocations.length})
				</CardTitle>
				<CardDescription>
					These tool invocations are waiting for approval before execution.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{invocations.map((invocation) => (
					<div
						key={invocation.id}
						className="flex flex-col gap-3 rounded-xl border border-yellow-500/20 bg-background/50 p-4 sm:flex-row sm:items-center sm:justify-between"
					>
						<InvocationSummary invocation={invocation} />
						<InvocationActions
							invocationId={invocation.id}
							busyAction={
								busyInvocation?.id === invocation.id
									? busyInvocation.action
									: null
							}
							onApprove={onApprove}
							onReject={onReject}
						/>
					</div>
				))}
			</CardContent>
		</Card>
	);
}

function InvocationList({
	invocations,
	busyInvocation,
	onApprove,
	onReject,
}: {
	invocations: ToolInvocation[];
	busyInvocation: { id: string; action: ToolAction } | null;
	onApprove: (invocationId: string) => void;
	onReject: (invocationId: string) => void;
}) {
	if (invocations.length === 0) {
		return (
			<Empty className="mt-8 border border-border/70 bg-background/55">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<ShieldAlert aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>No tool invocations</EmptyTitle>
					<EmptyDescription>
						Tool invocations will appear here when agents execute tools.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<div className="mt-4 flex flex-col gap-3">
			{invocations.map((invocation) => (
				<Card key={invocation.id}>
					<CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
						<InvocationSummary invocation={invocation} />
						{isPendingApproval(invocation) && (
							<InvocationActions
								invocationId={invocation.id}
								busyAction={
									busyInvocation?.id === invocation.id
										? busyInvocation.action
										: null
								}
								onApprove={onApprove}
								onReject={onReject}
							/>
						)}
					</CardContent>
				</Card>
			))}
		</div>
	);
}

export default function ToolInvocationsPage() {
	const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
	const [invocations, setInvocations] = useState<ToolInvocation[]>([]);
	const [loading, setLoading] = useState(true);
	const [filterStatus, setFilterStatus] = useState<string>("all");
	const [busyInvocation, setBusyInvocation] = useState<{
		id: string;
		action: ToolAction;
	} | null>(null);

	const pendingInvocations = useMemo(
		() => invocations.filter(isPendingApproval),
		[invocations],
	);

	const fetchInvocations = useCallback(
		async (signal?: AbortSignal) => {
			if (!workspaceId) return [];

			const searchParams = new URLSearchParams({
				workspaceId,
				limit: "100",
			});
			if (filterStatus !== "all") {
				searchParams.set("status", filterStatus);
			}

			const res = await fetch(
				`/api/workspace/tool-invocations?${searchParams.toString()}`,
				{ signal },
			);
			if (!res.ok) throw new Error("Failed to load tool invocations");
			return (await res.json()) as ToolInvocation[];
		},
		[filterStatus, workspaceId],
	);

	useEffect(() => {
		if (!workspaceId) return;
		let cancelled = false;
		const controller = new AbortController();

		async function loadInvocations() {
			try {
				const data = await fetchInvocations(controller.signal);
				if (!cancelled) setInvocations(data);
			} catch (err) {
				if (err instanceof Error && err.name !== "AbortError") {
					toast.error(err.message);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		void loadInvocations();

		return () => {
			cancelled = true;
			controller.abort();
		};
	}, [fetchInvocations, workspaceId]);

	useEffect(() => {
		if (!workspaceId) return;
		const refresh = () => {
			if (typeof document !== "undefined" && document.hidden) return;
			void fetchInvocations()
				.then(setInvocations)
				.catch(() => {
					// Keep polling silent; explicit loads and actions surface errors.
				});
		};
		const interval = setInterval(refresh, 30_000);
		const onVisible = () => {
			if (!document.hidden) refresh();
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			clearInterval(interval);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [fetchInvocations, workspaceId]);

	async function runInvocationAction(invocationId: string, action: ToolAction) {
		setBusyInvocation({ id: invocationId, action });
		try {
			const res = await fetch(
				`/api/workspace/tool-invocations/${invocationId}/${action}`,
				{ method: "POST" },
			);
			if (!res.ok) {
				const error = await res.json().catch(() => null);
				throw new Error(error?.error || `Failed to ${action} invocation`);
			}

			toast.success(
				`Tool invocation ${action === "approve" ? "approved" : "rejected"}`,
			);
			setInvocations(await fetchInvocations());
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : `Failed to ${action} invocation`,
			);
		} finally {
			setBusyInvocation(null);
		}
	}

	if (workspaceLoading || !workspaceId || loading) {
		return <PageLoading label="Loading tool invocations" />;
	}

	return (
		<WorkspacePage
			kicker="Activity"
			title="Approvals"
			description="View and manage tool execution history. Approve or reject pending invocations."
			width="wide"
		>
			<PendingApprovalsPanel
				invocations={pendingInvocations}
				busyInvocation={busyInvocation}
				onApprove={(id) => void runInvocationAction(id, "approve")}
				onReject={(id) => void runInvocationAction(id, "reject")}
			/>

			<Tabs value={filterStatus} onValueChange={setFilterStatus}>
				<TabsList>
					{TOOL_STATUS_FILTERS.map((filter) => (
						<TabsTrigger key={filter.value} value={filter.value}>
							{filter.label}
						</TabsTrigger>
					))}
				</TabsList>

				<TabsContent value={filterStatus}>
					<InvocationList
						invocations={invocations}
						busyInvocation={busyInvocation}
						onApprove={(id) => void runInvocationAction(id, "approve")}
						onReject={(id) => void runInvocationAction(id, "reject")}
					/>
				</TabsContent>
			</Tabs>
		</WorkspacePage>
	);
}
