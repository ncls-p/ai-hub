"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import {
  BookMarkedIcon,
  ServerIcon,
  ShieldIcon,
  WrenchIcon,
} from "lucide-react";

import { McpServerManager } from "@/components/mcp/mcp-server-manager";
import { SkillManager } from "@/components/skills/skill-manager";
import { WorkspacePage } from "@/components/workspace-page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/hooks/use-workspace";
import { useRouter } from "@/i18n/navigation";
import { fetchWorkspacePermissions } from "@/lib/api-client";
import {
  DEFAULT_WORKSPACE_PERMISSIONS,
  type WorkspacePermissions,
} from "@/lib/workspace-nav";

import { ToolApprovalsPanel } from "./approvals-panel";
import { BuiltinToolsPanel } from "./builtin-tools-panel";

type ToolsTab = "builtin" | "mcp" | "skills" | "approvals";

const TOOL_TAB_CONFIG = [
  {
    value: "builtin",
    icon: WrenchIcon,
    labelKey: "tabs.builtin",
    helpKey: null,
    canView: (permissions: WorkspacePermissions) =>
      permissions.canViewTools || permissions.canConfigureTools,
    render: () => <BuiltinToolsPanel />,
  },
  {
    value: "mcp",
    icon: ServerIcon,
    labelKey: "tabs.mcp",
    helpKey: "mcpHelp",
    canView: (permissions: WorkspacePermissions) =>
      permissions.canGetMcpServers,
    render: () => <McpServerManager />,
  },
  {
    value: "skills",
    icon: BookMarkedIcon,
    labelKey: "tabs.skills",
    helpKey: "skillsHelp",
    canView: (permissions: WorkspacePermissions) =>
      permissions.canConfigureTools,
    render: () => <SkillManager />,
  },
  {
    value: "approvals",
    icon: ShieldIcon,
    labelKey: "tabs.approvals",
    helpKey: "approvalsHelp",
    canView: (permissions: WorkspacePermissions) =>
      permissions.canViewTools || permissions.canConfigureTools,
    render: () => <ToolApprovalsPanel />,
  },
] as const;

function allowedToolTabs(permissions: WorkspacePermissions) {
  return TOOL_TAB_CONFIG.filter((item) => item.canView(permissions));
}

export function ToolsHub() {
  const t = useTranslations("tools");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { workspaceId } = useWorkspace();
  const [permissions, setPermissions] = useState<WorkspacePermissions>(
    DEFAULT_WORKSPACE_PERMISSIONS,
  );
  const allowedTabs = useMemo(
    () => allowedToolTabs(permissions),
    [permissions],
  );
  const allowedTabValues = allowedTabs.map((item) => item.value);
  const requestedTab = searchParams.get("tab") ?? "builtin";
  const tab = allowedTabValues.includes(requestedTab as ToolsTab)
    ? requestedTab
    : (allowedTabValues[0] ?? "builtin");

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    void fetchWorkspacePermissions(workspaceId)
      .then((nextPermissions) => {
        if (!cancelled) setPermissions(nextPermissions);
      })
      .catch(() => {
        if (!cancelled) setPermissions(DEFAULT_WORKSPACE_PERMISSIONS);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  function setTab(value: string) {
    router.replace(`/tools?tab=${value}`);
  }

  return (
    <WorkspacePage
      title={t("title")}
      description={t("description")}
      width="wide"
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full flex-wrap sm:w-auto">
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
            {item.render()}
          </TabsContent>
        ))}
      </Tabs>
    </WorkspacePage>
  );
}
