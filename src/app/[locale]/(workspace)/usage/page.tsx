"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { PageLoading } from "@/components/page-loading";
import { RequireWorkspaceAccess } from "@/components/require-workspace-access";
import { WorkspacePage } from "@/components/workspace-page";
import { useWorkspace } from "@/hooks/use-workspace";

import {
  UsageDashboard,
  UsageDashboardSkeleton,
  type UsageResponse,
} from "./usage-dashboard";

function UsagePageContent() {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [operationFilter, setOperationFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const loadUsage = useCallback(
    async (options?: {
      silent?: boolean;
      operation?: string;
      from?: string;
      to?: string;
    }) => {
      if (!workspaceId) return;
      if (options?.silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const operation = options?.operation ?? operationFilter;
        const from = options?.from ?? fromDate;
        const to = options?.to ?? toDate;
        const params = new URLSearchParams({ workspaceId, limit: "100" });
        if (operation.trim()) {
          params.set("operation", operation.trim());
        }
        if (from) params.set("from", new Date(from).toISOString());
        if (to) params.set("to", new Date(`${to}T23:59:59`).toISOString());
        const res = await fetch(`/api/workspace/usage?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load usage");
        setData(await res.json());
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to load usage",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fromDate, operationFilter, toDate, workspaceId],
  );

  useEffect(() => {
    if (!workspaceId) return;
    const timeout = window.setTimeout(() => {
      void loadUsage();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadUsage, workspaceId]);

  if (workspaceLoading || !workspaceId) {
    return <PageLoading label={tCommon("loading")} />;
  }

  return (
    <WorkspacePage
      title={t("usageTitle")}
      description={t("usageDescription")}
      width="wide"
    >
      {loading && !data ? (
        <UsageDashboardSkeleton />
      ) : data ? (
        <UsageDashboard
          data={data}
          busy={refreshing}
          operationFilter={operationFilter}
          fromDate={fromDate}
          toDate={toDate}
          onOperationChangeAction={setOperationFilter}
          onFromChangeAction={setFromDate}
          onToChangeAction={setToDate}
          onApplyAction={() => void loadUsage({ silent: true })}
          onResetAction={() => {
            setOperationFilter("");
            setFromDate("");
            setToDate("");
            void loadUsage({
              silent: true,
              operation: "",
              from: "",
              to: "",
            });
          }}
        />
      ) : (
        <UsageDashboardSkeleton />
      )}
    </WorkspacePage>
  );
}

export default function UsagePage() {
  return (
    <RequireWorkspaceAccess required="canViewUsage">
      <UsagePageContent />
    </RequireWorkspaceAccess>
  );
}
