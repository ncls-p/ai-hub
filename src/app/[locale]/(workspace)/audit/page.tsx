"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { PageLoading } from "@/components/page-loading";
import { RequireWorkspaceAccess } from "@/components/require-workspace-access";
import { WorkspacePage } from "@/components/workspace-page";
import { useWorkspace } from "@/hooks/use-workspace";

import {
  AuditDashboard,
  AuditDashboardSkeleton,
  type AuditEvent,
} from "./audit-dashboard";

type AuditFilters = {
  action: string;
  outcome: string;
  from: string;
  to: string;
};

type LoadAuditEventsInput = AuditFilters & {
  workspaceId: string;
};

function auditFiltersFromState(input: {
  actionFilter: string;
  outcomeFilter: string;
  fromDate: string;
  toDate: string;
}) {
  return {
    action: input.actionFilter,
    outcome: input.outcomeFilter,
    from: input.fromDate,
    to: input.toDate,
  } satisfies AuditFilters;
}

function buildAuditQuery({
  workspaceId,
  action,
  outcome,
  from,
  to,
}: LoadAuditEventsInput) {
  const params = new URLSearchParams({ workspaceId, limit: "100" });
  if (action.trim()) params.set("action", action.trim());
  if (outcome !== "all") params.set("outcome", outcome);
  if (from) params.set("from", new Date(from).toISOString());
  if (to) params.set("to", new Date(`${to}T23:59:59`).toISOString());
  return params.toString();
}

async function fetchAuditEvents(input: LoadAuditEventsInput) {
  const res = await fetch(`/api/workspace/audit?${buildAuditQuery(input)}`);
  if (!res.ok) throw new Error("Failed to load audit log");
  return (await res.json()) as AuditEvent[];
}

function csvEscape(value: unknown) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function downloadAuditCsv(events: AuditEvent[], workspaceId: string) {
  const header = ["createdAt", "action", "resourceType", "outcome", "actor"];
  const rows = events.map((event) =>
    [
      event.createdAt,
      event.action,
      event.resourceType ?? "",
      event.outcome,
      event.actorName ?? event.actorEmail ?? event.actorPrincipalId ?? "",
    ]
      .map(csvEscape)
      .join(","),
  );
  const blob = new Blob([[header.join(","), ...rows].join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `audit-${workspaceId.slice(0, 8)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function AuditPageContent() {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionFilter, setActionFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const loadEvents = useCallback(
    async (options?: Partial<AuditFilters> & { silent?: boolean }) => {
      if (!workspaceId) return;
      if (options?.silent) setRefreshing(true);
      else setLoading(true);

      try {
        setEvents(
          await fetchAuditEvents({
            workspaceId,
            ...auditFiltersFromState({
              actionFilter,
              outcomeFilter,
              fromDate,
              toDate,
            }),
            ...options,
          }),
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to load audit log",
        );
        return;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [actionFilter, fromDate, outcomeFilter, toDate, workspaceId],
  );

  function exportCsv() {
    if (events?.length && workspaceId) downloadAuditCsv(events, workspaceId);
  }

  useEffect(() => {
    if (!workspaceId) return;
    const timeout = window.setTimeout(() => {
      void loadEvents();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadEvents, workspaceId]);

  if (workspaceLoading || !workspaceId) {
    return <PageLoading label={tCommon("loading")} />;
  }

  return (
    <WorkspacePage
      title={t("auditTitle")}
      description={t("auditDescription")}
      width="wide"
    >
      {loading && !events ? (
        <AuditDashboardSkeleton />
      ) : events ? (
        <AuditDashboard
          events={events}
          busy={refreshing}
          actionFilter={actionFilter}
          outcomeFilter={outcomeFilter}
          fromDate={fromDate}
          toDate={toDate}
          onActionChangeAction={setActionFilter}
          onOutcomeChangeAction={setOutcomeFilter}
          onFromChangeAction={setFromDate}
          onToChangeAction={setToDate}
          onApplyAction={() => void loadEvents({ silent: true })}
          onResetAction={() => {
            setActionFilter("");
            setOutcomeFilter("all");
            setFromDate("");
            setToDate("");
            void loadEvents({
              silent: true,
              action: "",
              outcome: "all",
              from: "",
              to: "",
            });
          }}
          onExportAction={exportCsv}
        />
      ) : (
        <AuditDashboardSkeleton />
      )}
    </WorkspacePage>
  );
}

export default function AuditPage() {
  return (
    <RequireWorkspaceAccess required="canViewAudit">
      <AuditPageContent />
    </RequireWorkspaceAccess>
  );
}
