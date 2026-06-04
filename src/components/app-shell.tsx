"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { MessageSquareIcon } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import {
  WorkspaceSidebar,
  WorkspaceSidebarMobileTrigger,
  WorkspaceSidebarProvider,
} from "@/components/workspace-sidebar";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson, fetchPendingToolCount } from "@/lib/api-client";
import {
  getRouteBreadcrumbs,
  getRouteTitleKey,
  type WorkspacePermissions,
  type WorkspaceShellState,
} from "@/lib/workspace-nav";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  displayName?: string;
  isAdmin?: boolean;
}

const WorkspaceShellContext = createContext<WorkspaceShellState | null>(null);

export function useWorkspaceShell() {
  const value = useContext(WorkspaceShellContext);
  if (!value) {
    throw new Error("Workspace shell context must be used inside AppShell");
  }
  return value;
}

export function AppShell({ children, displayName, isAdmin }: AppShellProps) {
  const pathname = usePathname();
  const tNav = useTranslations("nav");
  const tShell = useTranslations("shell");
  const { workspaceId } = useWorkspace();
  const isChatRoute = pathname === "/chat" || pathname.startsWith("/chat/");
  const titleKey = getRouteTitleKey(pathname);
  const currentTitle =
    titleKey === "workspace" ? tShell("workspace") : tNav(titleKey);
  const rawBreadcrumbs = getRouteBreadcrumbs(pathname);
  const breadcrumbs = rawBreadcrumbs?.map((crumb) => ({
    label: tNav(crumb.labelKey),
    href: crumb.href,
  }));
  const [pendingToolCount, setPendingToolCount] = useState(0);
  const [permissions, setPermissions] = useState<WorkspacePermissions>({
    canViewUsage: false,
    canViewAudit: false,
  });

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;

    async function loadPending() {
      if (typeof document !== "undefined" && document.hidden) return;
      const count = await fetchPendingToolCount(workspaceId!);
      if (!cancelled) setPendingToolCount(count);
    }

    void loadPending();
    const interval = window.setInterval(() => void loadPending(), 60_000);
    const onVisible = () => {
      if (!document.hidden) void loadPending();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;

    async function loadPermissions() {
      try {
        const data = await fetchJson<WorkspacePermissions>(
          `/api/workspace/permissions?workspaceId=${workspaceId}`,
        );
        if (!cancelled) setPermissions(data);
      } catch {
        if (!cancelled) {
          setPermissions({ canViewUsage: false, canViewAudit: false });
        }
      }
    }

    void loadPermissions();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const shellValue = useMemo(
    () => ({
      displayName,
      isAdmin,
      pendingToolCount,
      permissions,
    }),
    [displayName, isAdmin, pendingToolCount, permissions],
  );

  return (
    <WorkspaceShellContext.Provider value={shellValue}>
      <WorkspaceSidebarProvider
        key={isChatRoute ? "chat" : "workspace"}
        defaultCollapsed={isChatRoute}
      >
        <div data-page="app-shell" className="app-shell mesh-bg">
          <a
            href="#workspace-main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:border focus:border-border/70 focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg"
          >
            Skip to content
          </a>
          <div className="flex min-h-0 flex-1 flex-row">
            <WorkspaceSidebar shell={shellValue} />
            <div className="flex min-w-0 flex-1 flex-col">
              {!isChatRoute ? (
                <AppHeader
                  title={currentTitle}
                  breadcrumbs={breadcrumbs}
                  subtitle={tShell("workspace")}
                  leading={<WorkspaceSidebarMobileTrigger shell={shellValue} />}
                  actions={
                    <Button
                      asChild
                      variant="default"
                      size="sm"
                      className="gap-2"
                    >
                      <Link href="/chat">
                        <MessageSquareIcon
                          className="size-4"
                          aria-hidden="true"
                        />
                        {tShell("returnToChat")}
                      </Link>
                    </Button>
                  }
                />
              ) : null}
              <main
                id="workspace-main"
                tabIndex={-1}
                className={cn(
                  "app-shell__main",
                  isChatRoute && "app-shell__main--chat",
                )}
              >
                {children}
              </main>
            </div>
          </div>
        </div>
      </WorkspaceSidebarProvider>
    </WorkspaceShellContext.Provider>
  );
}
