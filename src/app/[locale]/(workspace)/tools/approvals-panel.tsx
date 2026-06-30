"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  Shield,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { PageLoading } from "@/components/page-loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/hooks/use-workspace";

// ── Types ──

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
type BusyInvocation = { id: string; action: ToolAction } | null;

// ── Constants ──

const HISTORY_STATUSES = new Set(["success", "failed", "rejected", "denied"]);

// ── Helpers ──

function isPendingApproval(invocation: ToolInvocation) {
  return (
    invocation.status === "awaiting_approval" ||
    invocation.status === "pending_approval"
  );
}

function getStatusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getStatusColor(status: string) {
  switch (status) {
    case "success":
      return "text-success";
    case "awaiting_approval":
    case "pending_approval":
      return "text-warning";
    case "failed":
    case "rejected":
    case "denied":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

function getStatusBg(status: string) {
  switch (status) {
    case "success":
      return "bg-success/10";
    case "awaiting_approval":
    case "pending_approval":
      return "bg-warning/10";
    case "failed":
    case "rejected":
    case "denied":
      return "bg-destructive/10";
    default:
      return "bg-muted";
  }
}

function getStatusRing(status: string) {
  switch (status) {
    case "success":
      return "ring-success/20";
    case "awaiting_approval":
    case "pending_approval":
      return "ring-warning/20";
    case "failed":
    case "rejected":
    case "denied":
      return "ring-destructive/20";
    default:
      return "ring-border";
  }
}

// ── Stat Card ──

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  accent,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  accent: string;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-background p-4 transition-colors hover:border-primary/35",
      )}
    >
      {/* Accent bar */}
      <div
        className={cn(
          "absolute left-0 top-0 h-full w-1 opacity-60 transition-opacity duration-300 group-hover:opacity-100",
          accent,
        )}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <span className="text-2xl font-bold tracking-tight text-foreground">
            {value}
          </span>
        </div>
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110",
            color,
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

// ── Status Dot ──

function StatusDot({ status, animate }: { status: string; animate?: boolean }) {
  const isPending =
    status === "awaiting_approval" || status === "pending_approval";
  return (
    <span className="relative flex size-3">
      {isPending && animate && (
        <span
          className={cn(
            "absolute inset-0 rounded-full animate-ping opacity-40",
            getStatusColor(status),
          )}
          style={{
            backgroundColor: "currentColor",
          }}
        />
      )}
      <span
        className={cn(
          "relative size-3 rounded-full ring-2",
          getStatusColor(status),
          getStatusRing(status),
          getStatusBg(status),
        )}
      />
    </span>
  );
}

// ── Risk Badge ──

function RiskBadge({ riskLevel }: { riskLevel: string | null }) {
  if (!riskLevel) return null;
  const config =
    riskLevel === "high" || riskLevel === "critical"
      ? {
          variant: "destructive" as const,
          label: riskLevel === "critical" ? "⚠ Critical" : "↑ High",
        }
      : riskLevel === "medium"
        ? {
            variant: "outline" as const,
            label: "→ Medium",
          }
        : { variant: "secondary" as const, label: "↓ Low" };

  return <Badge variant={config.variant}>{config.label}</Badge>;
}

// ── Invocation Actions ──

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
  const isBusy = busyAction !== null;

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onReject(invocationId)}
        disabled={isBusy}
        className="min-w-[80px] transition-[background-color,border-color,color,box-shadow,scale] duration-150 ease-out hover:border-destructive/30 hover:bg-destructive/8 hover:text-destructive"
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
        disabled={isBusy}
        className="min-w-[88px]"
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

// ── Invocation Row ──

function InvocationRow({
  invocation,
  showActions,
  busyAction,
  onApprove,
  onReject,
  index,
}: {
  invocation: ToolInvocation;
  showActions: boolean;
  busyAction: ToolAction | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  index: number;
}) {
  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-2xl border border-transparent bg-background/60 p-4 shadow-[var(--surface-shadow)] transition-[background-color,box-shadow] duration-150 ease-out hover:bg-background hover:shadow-[var(--surface-shadow-hover)] sm:flex-row sm:items-center sm:justify-between",
        invocation.status === "awaiting_approval" ||
          invocation.status === "pending_approval"
          ? "border-warning/25 bg-warning/[0.03]"
          : "",
      )}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Left: info */}
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {/* Status indicator */}
        <div className="mt-1 hidden sm:block">
          <StatusDot
            status={invocation.status}
            animate={isPendingApproval(invocation)}
          />
        </div>

        <div className="min-w-0 flex-1">
          {/* Primary line: tool name + badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">
              {invocation.toolName}
            </span>

            {/* Source badge */}
            <span className="inline-flex items-center gap-1 rounded-md bg-muted/80 px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
              <Zap className="size-3" aria-hidden="true" />
              {invocation.toolSource}
            </span>

            <RiskBadge riskLevel={invocation.riskLevel} />

            {/* Status pill */}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wider ring-1",
                getStatusColor(invocation.status),
                getStatusBg(invocation.status),
                getStatusRing(invocation.status),
              )}
            >
              <StatusDot
                status={invocation.status}
                animate={isPendingApproval(invocation)}
              />
              {getStatusLabel(invocation.status)}
            </span>
          </div>

          {/* Secondary line: metadata */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <time dateTime={invocation.createdAt}>
              {new Date(invocation.createdAt).toLocaleString()}
            </time>

            {invocation.latencyMs !== null && (
              <>
                <span className="text-muted/60">·</span>
                <span className="inline-flex items-center gap-1">
                  <Activity className="size-3" aria-hidden="true" />
                  {invocation.latencyMs}ms
                </span>
              </>
            )}

            {invocation.conversationId && (
              <>
                <span className="text-muted/60">·</span>
                <Link
                  href={`/chat?conversationId=${invocation.conversationId}`}
                  className="inline-flex items-center gap-1 text-primary transition-colors hover:underline"
                >
                  <MessageSquare className="size-3" aria-hidden="true" />
                  Conversation
                </Link>
              </>
            )}

            {invocation.errorMessage && (
              <>
                <span className="text-muted/60">·</span>
                <span className="max-w-xs truncate font-medium text-destructive">
                  {invocation.errorMessage}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right: actions */}
      {showActions && (
        <div className="shrink-0">
          <InvocationActions
            invocationId={invocation.id}
            busyAction={busyAction}
            onApprove={onApprove}
            onReject={onReject}
          />
        </div>
      )}
    </div>
  );
}

// ── Pending Approvals Panel ──

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
    <div className="animate-in-up stagger-1">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-warning/10 ring-1 ring-warning/20">
          <Clock
            className="size-5 text-warning animate-pulse"
            aria-hidden="true"
          />
          <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-warning text-[0.6rem] font-bold text-warning-foreground shadow-sm">
            {invocations.length}
          </span>
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Pending Approvals
          </h2>
          <p className="text-sm text-muted-foreground">
            {invocations.length} tool invocation
            {invocations.length !== 1 ? "s" : ""} awaiting your permission
          </p>
        </div>
      </div>

      {/* Items */}
      <div className="flex flex-col gap-3">
        {invocations.map((invocation, i) => (
          <InvocationRow
            key={invocation.id}
            invocation={invocation}
            showActions
            busyAction={
              busyInvocation?.id === invocation.id
                ? busyInvocation.action
                : null
            }
            onApprove={onApprove}
            onReject={onReject}
            index={i}
          />
        ))}
      </div>
    </div>
  );
}

// ── Invocation List ──

function InvocationList({
  invocations,
  filterStatus,
  busyInvocation,
  onApprove,
  onReject,
}: {
  invocations: ToolInvocation[];
  filterStatus: string;
  busyInvocation: { id: string; action: ToolAction } | null;
  onApprove: (invocationId: string) => void;
  onReject: (invocationId: string) => void;
}) {
  if (invocations.length === 0) {
    return (
      <Empty className="mt-4">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Shield aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No tool invocations found</EmptyTitle>
          <EmptyDescription>
            {filterStatus !== "all"
              ? `No invocations with status "${getStatusLabel(filterStatus)}".`
              : "Tool invocations will appear here when agents execute tools."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-2">
      {/* Column header */}
      <div className="flex items-center justify-between px-1 pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <span>Invocations</span>
        <span>
          {invocations.length} result{invocations.length !== 1 ? "s" : ""}
        </span>
      </div>

      {invocations.map((invocation, i) => (
        <InvocationRow
          key={invocation.id}
          invocation={invocation}
          showActions={isPendingApproval(invocation)}
          busyAction={
            busyInvocation?.id === invocation.id ? busyInvocation.action : null
          }
          onApprove={onApprove}
          onReject={onReject}
          index={i}
        />
      ))}
    </div>
  );
}

// ── Page ──

function filterByStatus(invocations: ToolInvocation[], filterStatus: string) {
  if (filterStatus === "pending") {
    return invocations.filter(isPendingApproval);
  }
  if (filterStatus === "history") {
    return invocations.filter((i) => HISTORY_STATUSES.has(i.status));
  }
  return invocations;
}

function getInvocationStats(
  invocations: ToolInvocation[],
  pendingCount: number,
) {
  const total = invocations.length;
  const success = invocations.filter((i) => i.status === "success").length;
  const failed = invocations.filter(
    (i) =>
      i.status === "failed" || i.status === "rejected" || i.status === "denied",
  ).length;
  const latencies = invocations
    .map((i) => i.latencyMs)
    .filter((v): v is number => v !== null);
  const avgLatency =
    latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;
  const successRate = total > 0 ? Math.round((success / total) * 100) : 0;

  return {
    total,
    pending: pendingCount,
    success,
    failed,
    avgLatency,
    successRate,
  };
}

async function submitInvocationAction(
  invocationId: string,
  action: ToolAction,
) {
  const res = await fetch(
    `/api/workspace/tool-invocations/${invocationId}/${action}`,
    { method: "POST" },
  );
  if (!res.ok) {
    const error = await res.json().catch(() => null);
    throw new Error(error?.error || `Failed to ${action} invocation`);
  }
}

async function fetchToolInvocations({
  workspaceId,
  filterStatus,
  signal,
}: {
  workspaceId?: string | null;
  filterStatus: string;
  signal?: AbortSignal;
}) {
  if (!workspaceId) return [];

  const searchParams = new URLSearchParams({
    workspaceId,
    limit: "100",
  });
  if (filterStatus === "pending") {
    searchParams.set("status", "awaiting_approval");
  }

  const res = await fetch(
    `/api/workspace/tool-invocations?${searchParams.toString()}`,
    { signal },
  );
  if (!res.ok) throw new Error("Failed to load tool invocations");
  return (await res.json()) as ToolInvocation[];
}

function InvocationStatsRow({
  stats,
}: {
  stats: ReturnType<typeof getInvocationStats>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 animate-in-up stagger-1">
      <StatCard
        label="Total"
        value={stats.total}
        icon={Activity}
        color="bg-primary/10 text-primary"
        accent="bg-primary"
      />
      <StatCard
        label="Pending"
        value={stats.pending}
        icon={Clock}
        color="bg-warning/10 text-warning"
        accent="bg-warning"
      />
      <StatCard
        label="Success Rate"
        value={`${stats.successRate}%`}
        icon={CheckCircle2}
        color="bg-success/10 text-success"
        accent="bg-success"
      />
      <StatCard
        label="Avg Latency"
        value={`${stats.avgLatency}ms`}
        icon={Zap}
        color="bg-info/10 text-info"
        accent="bg-info"
      />
    </div>
  );
}

type InvocationTabsProps = {
  filterStatus: string;
  invocations: ToolInvocation[];
  busyInvocation: BusyInvocation;
  onFilterStatusChange: (status: string) => void;
  onApprove: (invocationId: string) => void;
  onReject: (invocationId: string) => void;
  t: (key: "all" | "pending" | "history") => string;
};

function InvocationTabs({
  filterStatus,
  invocations,
  busyInvocation,
  onFilterStatusChange,
  onApprove,
  onReject,
  t,
}: InvocationTabsProps) {
  return (
    <div className="animate-in-up stagger-2">
      <Tabs value={filterStatus} onValueChange={onFilterStatusChange}>
        <TabsList className="w-full overflow-x-auto sm:w-auto sm:overflow-visible">
          <TabsTrigger value="all" className="gap-1.5">
            <Activity className="size-3.5" aria-hidden="true" />
            {t("all")}
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-1.5">
            <Clock className="size-3.5" aria-hidden="true" />
            {t("pending")}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            {t("history")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={filterStatus}>
          <InvocationList
            invocations={filterByStatus(invocations, filterStatus)}
            filterStatus={filterStatus}
            busyInvocation={busyInvocation}
            onApprove={onApprove}
            onReject={onReject}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type FetchInvocations = (signal?: AbortSignal) => Promise<ToolInvocation[]>;

function useToolInvocationData(
  workspaceId: string | null,
  filterStatus: string,
) {
  const [invocations, setInvocations] = useState<ToolInvocation[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchInvocations = useCallback(
    (signal?: AbortSignal) =>
      fetchToolInvocations({ workspaceId, filterStatus, signal }),
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

  return { invocations, loading, fetchInvocations, setInvocations };
}

function useInvocationActions(
  fetchInvocations: FetchInvocations,
  setInvocations: (invocations: ToolInvocation[]) => void,
) {
  const [busyInvocation, setBusyInvocation] = useState<BusyInvocation>(null);
  const runInvocationAction = useCallback(
    async (invocationId: string, action: ToolAction) => {
      setBusyInvocation({ id: invocationId, action });
      try {
        await submitInvocationAction(invocationId, action);
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
    },
    [fetchInvocations, setInvocations],
  );

  return { busyInvocation, runInvocationAction };
}

export function ToolApprovalsPanel() {
  const t = useTranslations("tools.filters");
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const { invocations, loading, fetchInvocations, setInvocations } =
    useToolInvocationData(workspaceId, filterStatus);
  const { busyInvocation, runInvocationAction } = useInvocationActions(
    fetchInvocations,
    setInvocations,
  );

  const pendingInvocations = useMemo(
    () => invocations.filter(isPendingApproval),
    [invocations],
  );

  const stats = useMemo(
    () => getInvocationStats(invocations, pendingInvocations.length),
    [invocations, pendingInvocations.length],
  );

  if (workspaceLoading || !workspaceId || loading) {
    return <PageLoading label="Loading tool invocations" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <InvocationStatsRow stats={stats} />
      <PendingApprovalsPanel
        invocations={pendingInvocations}
        busyInvocation={busyInvocation}
        onApprove={(id) => void runInvocationAction(id, "approve")}
        onReject={(id) => void runInvocationAction(id, "reject")}
      />
      <InvocationTabs
        filterStatus={filterStatus}
        invocations={invocations}
        busyInvocation={busyInvocation}
        onFilterStatusChange={setFilterStatus}
        onApprove={(id) => void runInvocationAction(id, "approve")}
        onReject={(id) => void runInvocationAction(id, "reject")}
        t={t}
      />
    </div>
  );
}
