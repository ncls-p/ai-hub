"use client";

import { ArrowRightIcon, PlusIcon, WorkflowIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { PageEmptyState } from "@/components/page-empty-state";
import { ResourcePackageImport } from "@/components/marketplace/resource-package-import";
import { ResourcePackageExport } from "@/components/marketplace/resource-package-export";
import { PageLoading } from "@/components/page-loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { WorkflowSummary } from "@/components/workflows/types";
import { WorkspacePage } from "@/components/workspace-page";
import { useWorkspace } from "@/hooks/use-workspace";
import { useRouter } from "@/i18n/navigation";
import { fetchJson } from "@/lib/api-client";

export default function WorkflowsPage() {
  const t = useTranslations("workflows");
  const router = useRouter();
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadWorkflows = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const payload = await fetchJson<{ workflows: WorkflowSummary[] }>(
        `/api/workspace/workflows?workspaceId=${workspaceId}`,
      );
      setWorkflows(payload.workflows);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadWorkflows(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadWorkflows]);

  async function createWorkflow() {
    if (!workspaceId || creating) return;
    setCreating(true);
    try {
      const payload = await fetchJson<{ workflow: WorkflowSummary }>(
        "/api/workspace/workflows",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId, name: t("defaultName") }),
        },
      );
      router.push(`/workflows/${payload.workflow.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("loadFailed"));
    } finally {
      setCreating(false);
    }
  }

  const isLoading = workspaceLoading || loading;

  return (
    <WorkspacePage
      title={t("title")}
      description={t("description")}
      width="wide"
      actions={
        <>
          <ResourcePackageImport key={workspaceId} workspaceId={workspaceId} />
          <Button
            type="button"
            onClick={() => void createWorkflow()}
            disabled={creating}
          >
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            {creating ? t("creating") : t("create")}
          </Button>
        </>
      }
    >
      {isLoading ? (
        <PageLoading label={t("loading")} />
      ) : loadError ? (
        <PageEmptyState
          icon={WorkflowIcon}
          title={t("loadFailed")}
          description={t("description")}
        >
          <Button variant="outline" onClick={() => void loadWorkflows()}>
            {t("refreshRuns")}
          </Button>
        </PageEmptyState>
      ) : workflows.length === 0 ? (
        <PageEmptyState
          icon={WorkflowIcon}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          className="min-h-[24rem] border border-dashed border-border/80 bg-muted/20"
        >
          <Button type="button" onClick={() => void createWorkflow()}>
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            {t("create")}
          </Button>
        </PageEmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workflows.map((workflow) => (
            <Card key={workflow.id} className="min-h-56">
              <CardHeader>
                <CardTitle>{workflow.name}</CardTitle>
                <CardDescription className="line-clamp-2">
                  {workflow.description || t("editorDescription")}
                </CardDescription>
                <CardAction>
                  <Badge
                    variant={
                      workflow.status === "active" ? "default" : "secondary"
                    }
                  >
                    {workflow.status === "active" ? t("active") : t("draft")}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
                <span>{t("version", { version: workflow.latestVersion })}</span>
                {workflow.activeVersion ? (
                  <span>· API v{workflow.activeVersion}</span>
                ) : null}
              </CardContent>
              <CardFooter className="justify-end">
                <ResourcePackageExport
                  workspaceId={workspaceId}
                  resource={{
                    kind: "workflow",
                    id: workflow.id,
                    name: workflow.name,
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => router.push(`/workflows/${workflow.id}`)}
                >
                  {t("open")}
                  <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </WorkspacePage>
  );
}
