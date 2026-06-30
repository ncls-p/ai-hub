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
import {
  fetchPendingToolCount,
  fetchWorkspacePermissions,
} from "@/lib/api-client";
import {
  DEFAULT_WORKSPACE_PERMISSIONS,
  getRouteBreadcrumbs,
  getRouteTitleKey,
  type WorkspacePermissions,
  type WorkspaceShellState,
} from "@/lib/workspace-nav";
import type { SidebarNavConfig } from "@/modules/navigation/sidebar-config";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  displayName?: string;
  currentUserId?: string;
  isAdmin?: boolean;
  sidebarNavConfig?: SidebarNavConfig;
}

const WorkspaceShellContext = createContext<WorkspaceShellState | null>(null);

export function useWorkspaceShell() {
  const value = useContext(WorkspaceShellContext);
  if (!value) {
    throw new Error("Workspace shell context must be used inside AppShell");
  }
  return value;
}

function usePendingToolCount(workspaceId: string | null | undefined) {
  const [pendingToolCount, setPendingToolCount] = useState(0);

  useEffect(() => {
    const currentWorkspaceId = workspaceId ?? "";
    if (!currentWorkspaceId) return;
    let cancelled = false;

    async function loadPending() {
      if (typeof document !== "undefined" && document.hidden) return;
      const count = await fetchPendingToolCount(currentWorkspaceId);
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

  return pendingToolCount;
}

function useWorkspacePermissions(workspaceId: string | null | undefined) {
  const [permissions, setPermissions] = useState<WorkspacePermissions>(
    DEFAULT_WORKSPACE_PERMISSIONS,
  );

  useEffect(() => {
    const currentWorkspaceId = workspaceId ?? "";
    if (!currentWorkspaceId) return;
    let cancelled = false;

    async function loadPermissions() {
      try {
        const data = await fetchWorkspacePermissions(currentWorkspaceId);
        if (!cancelled) setPermissions(data);
      } catch {
        if (!cancelled) {
          setPermissions(DEFAULT_WORKSPACE_PERMISSIONS);
        }
      }
    }

    void loadPermissions();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return permissions;
}

function useShellRouteMetadata(pathname: string) {
  const tNav = useTranslations("nav");
  const titleKey = getRouteTitleKey(pathname);
  const rawBreadcrumbs = getRouteBreadcrumbs(pathname);
  return {
    currentTitle: titleKey === "workspace" ? tNav("chat") : tNav(titleKey),
    breadcrumbs: rawBreadcrumbs?.map((crumb) => ({
      label: tNav(crumb.labelKey),
      href: crumb.href,
    })),
  };
}

export function AppShell({
  children,
  displayName,
  currentUserId,
  isAdmin,
  sidebarNavConfig,
}: AppShellProps) {
  const pathname = usePathname();
  const tShell = useTranslations("shell");
  const { workspaceId } = useWorkspace();
  const isChatRoute = pathname === "/chat" || pathname.startsWith("/chat/");
  const { currentTitle, breadcrumbs } = useShellRouteMetadata(pathname);
  const pendingToolCount = usePendingToolCount(workspaceId);
  const permissions = useWorkspacePermissions(workspaceId);

  const shellValue = useMemo(
    () => ({
      displayName,
      currentUserId,
      isAdmin,
      pendingToolCount,
      permissions,
      sidebarNavConfig,
    }),
    [
      displayName,
      currentUserId,
      isAdmin,
      pendingToolCount,
      permissions,
      sidebarNavConfig,
    ],
  );

  return (
    <WorkspaceShellContext.Provider value={shellValue}>
      <WorkspaceSidebarProvider
        key={isChatRoute ? "chat" : "workspace"}
        defaultCollapsed={isChatRoute}
      >
        <div data-page="app-shell" className="app-shell">
          <a
            href="#workspace-main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:border focus:border-border/70 focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg"
          >
            {tShell("skipToContent")}
          </a>
          <div className="flex min-h-0 flex-1 flex-row">
            {!isChatRoute ? <WorkspaceSidebar shell={shellValue} /> : null}
            <div className="flex min-w-0 flex-1 flex-col">
              {!isChatRoute ? (
                <AppHeader
                  title={currentTitle}
                  breadcrumbs={breadcrumbs}
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
