"use client";

import { BookMarkedIcon, ServerIcon, WrenchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useWorkspaceShell } from "@/components/app-shell";
import { McpServerManager } from "@/components/mcp/mcp-server-manager";
import { PageLoading } from "@/components/page-loading";
import { SkillManager } from "@/components/skills/skill-manager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkspacePage } from "@/components/workspace-page";
import { ResourcePackageImport } from "@/components/marketplace/resource-package-import";
import { useWorkspace } from "@/hooks/use-workspace";
import type { WorkspacePermissions } from "@/lib/workspace-nav";

import { BuiltinToolsPanel } from "./builtin-tools-panel";

type ToolsTab = "builtin" | "mcp" | "skills";

function isToolsTab(value: string | null): value is ToolsTab {
  return value === "builtin" || value === "mcp" || value === "skills";
}

const TOOL_TAB_CONFIG = [
  {
    value: "builtin",
    icon: WrenchIcon,
    labelKey: "tabs.builtin",
    helpKey: null,
    canView: (permissions: WorkspacePermissions) =>
      permissions.canViewTools || permissions.canConfigureTools,
    render: null,
  },
  {
    value: "mcp",
    icon: ServerIcon,
    labelKey: "tabs.mcp",
    helpKey: null,
    canView: (permissions: WorkspacePermissions) =>
      permissions.canGetMcpServers,
    render: () => <McpServerManager />,
  },
  {
    value: "skills",
    icon: BookMarkedIcon,
    labelKey: "tabs.skills",
    helpKey: null,
    canView: (permissions: WorkspacePermissions) =>
      permissions.canConfigureTools,
    render: () => <SkillManager />,
  },
] as const;

function allowedToolTabs(permissions: WorkspacePermissions) {
  return TOOL_TAB_CONFIG.filter((item) => item.canView(permissions));
}

function replaceToolsTab(tab: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", tab);
  window.history.replaceState(
    null,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

export function ToolsHub() {
  const t = useTranslations("tools");
  const searchParams = useSearchParams();
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const { permissions, permissionsReady } = useWorkspaceShell();
  const hasResolvedInitialTab = useRef(false);
  const [activeTab, setActiveTab] = useState<ToolsTab>(() => {
    const requestedTab = searchParams.get("tab");
    return isToolsTab(requestedTab) ? requestedTab : "builtin";
  });
  const allowedTabs = useMemo(
    () => allowedToolTabs(permissions),
    [permissions],
  );
  const allowedTabValues = allowedTabs.map((item) => item.value);
  const requestedTab = searchParams.get("tab") ?? "builtin";
  const fallbackTab = allowedTabValues[0] ?? "builtin";
  const tab = allowedTabValues.includes(activeTab) ? activeTab : fallbackTab;

  useEffect(() => {
    if (
      !permissionsReady ||
      allowedTabValues.length === 0 ||
      hasResolvedInitialTab.current
    ) {
      return;
    }
    hasResolvedInitialTab.current = true;
    const initialTab = allowedTabValues.includes(activeTab)
      ? activeTab
      : fallbackTab;
    if (requestedTab !== initialTab) replaceToolsTab(initialTab);
  }, [
    activeTab,
    allowedTabValues,
    fallbackTab,
    permissionsReady,
    requestedTab,
  ]);

  function setTab(value: string) {
    if (!isToolsTab(value)) return;
    setActiveTab(value);
  }

  if (workspaceLoading || !workspaceId || !permissionsReady) {
    return <PageLoading label={t("permissionsLoading")} />;
  }

  if (allowedTabs.length === 0) {
    return (
      <WorkspacePage
        title={t("orbitTitle")}
        accentTitle={t("orbitAccent")}
        eyebrow={t("orbitEyebrow")}
        description={t("orbitDescription")}
        width="wide"
      >
        <div className="rounded-2xl border bg-card p-5">
          <h2 className="text-base font-semibold">{t("noAccessTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("noAccessDescription")}
          </p>
        </div>
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage
      title={t("orbitTitle")}
      accentTitle={t("orbitAccent")}
      eyebrow={t("orbitEyebrow")}
      description={t("orbitDescription")}
      width="wide"
      actions={
        permissions.canConfigureTools || permissions.canManageMcpServers ? (
          <ResourcePackageImport key={workspaceId} workspaceId={workspaceId} />
        ) : undefined
      }
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="justify-start">
          {allowedTabs.map((item) => {
            const Icon = item.icon;
            return (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="gap-1.5"
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {t(item.labelKey)}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {allowedTabs.map((item) => (
          <TabsContent
            key={item.value}
            value={item.value}
            className={item.helpKey ? "mt-6 space-y-4" : "mt-6"}
          >
            {item.helpKey ? (
              <p className="text-sm text-muted-foreground">{t(item.helpKey)}</p>
            ) : null}
            {item.value === "builtin" ? (
              <BuiltinToolsPanel
                workspaceId={workspaceId}
                canManage={permissions.canManageTenantGlobals}
              />
            ) : (
              item.render?.()
            )}
          </TabsContent>
        ))}
      </Tabs>
    </WorkspacePage>
  );
}
