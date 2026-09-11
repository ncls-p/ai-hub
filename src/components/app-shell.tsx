"use client";
import { ImpersonationBanner } from "./impersonation-banner";

import { usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AppHeader } from "@/components/app-header";
import {
  OrbitAccountMenu,
  OrbitMobileNavigation,
  OrbitProductNavigation,
  OrbitWordmark,
} from "@/components/orbit-product-navigation";
import {
  WorkspaceHistoryMobileTrigger,
  WorkspaceHistorySidebar,
} from "@/components/workspace-history-sidebar";
import { WorkspacePageTransition } from "@/components/workspace-page-transition";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  fetchPendingToolCount,
  fetchWorkspacePermissions,
} from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  DEFAULT_WORKSPACE_PERMISSIONS,
  getRouteTitleKey,
  type WorkspacePermissions,
  type WorkspaceShellState,
} from "@/lib/workspace-nav";
import type { SidebarNavConfig } from "@/modules/navigation/sidebar-config";

interface AppShellProps {
  children: React.ReactNode;
  displayName?: string;
  currentUserId?: string;
  isAdmin?: boolean;
  sidebarNavConfig?: SidebarNavConfig;
  impersonatedBy?: string | null;
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
  const [loaded, setLoaded] = useState<{
    workspaceId: string;
    permissions: WorkspacePermissions;
  } | null>(null);

  useEffect(() => {
    const currentWorkspaceId = workspaceId ?? "";
    if (!currentWorkspaceId) return;

    let cancelled = false;

    async function loadPermissions() {
      try {
        const data = await fetchWorkspacePermissions(currentWorkspaceId);
        if (!cancelled) {
          setLoaded({
            workspaceId: currentWorkspaceId,
            permissions: data,
          });
        }
      } catch {
        if (!cancelled) {
          setLoaded({
            workspaceId: currentWorkspaceId,
            permissions: DEFAULT_WORKSPACE_PERMISSIONS,
          });
        }
      }
    }

    void loadPermissions();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const currentWorkspaceId = workspaceId ?? "";
  const permissions =
    loaded?.workspaceId === currentWorkspaceId
      ? loaded.permissions
      : DEFAULT_WORKSPACE_PERMISSIONS;
  const permissionsReady =
    Boolean(currentWorkspaceId) && loaded?.workspaceId === currentWorkspaceId;

  return { permissions, permissionsReady };
}

function useShellRouteMetadata(pathname: string) {
  const tNav = useTranslations("nav");
  const titleKey = getRouteTitleKey(pathname);
  const currentTitle = titleKey === "workspace" ? tNav("chat") : tNav(titleKey);
  const orbitSection =
    titleKey === "toolsHub"
      ? tNav("toolsShort")
      : titleKey === "knowledge"
        ? tNav("knowledgeShort")
        : titleKey === "scheduledTasks"
          ? tNav("planningShort")
          : currentTitle;
  return {
    orbitSection,
  };
}

export function AppShell({
  children,
  displayName,
  currentUserId,
  isAdmin,
  sidebarNavConfig: initialSidebarNavConfig,
  impersonatedBy,
}: AppShellProps) {
  const pathname = usePathname();
  const tShell = useTranslations("shell");
  const { workspaceId, sidebarNavConfig: organizationSidebarNavConfig } =
    useWorkspace();
  const sidebarNavConfig =
    organizationSidebarNavConfig ?? initialSidebarNavConfig;
  const isChatRoute = pathname === "/chat" || pathname.startsWith("/chat/");
  const { orbitSection } = useShellRouteMetadata(pathname);
  const pendingToolCount = usePendingToolCount(workspaceId);
  const { permissions, permissionsReady } =
    useWorkspacePermissions(workspaceId);
  const mainRef = useRef<HTMLElement | null>(null);

  // Keep chrome still: only reset the main pane scroll, never the window/shell.
  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main || isChatRoute) return;
    main.scrollTop = 0;
  }, [pathname, isChatRoute]);

  const shellValue = useMemo(
    () => ({
      displayName,
      currentUserId,
      isAdmin,
      pendingToolCount,
      permissions,
      permissionsReady,
      sidebarNavConfig,
    }),
    [
      displayName,
      currentUserId,
      isAdmin,
      pendingToolCount,
      permissions,
      permissionsReady,
      sidebarNavConfig,
    ],
  );

  return (
    <WorkspaceShellContext.Provider value={shellValue}>
      <div data-page="app-shell" className="app-shell">
        <ImpersonationBanner
          active={Boolean(impersonatedBy)}
          name={displayName ?? ""}
        />
        <a
          href="#workspace-main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:border focus:border-border/70 focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg"
        >
          {tShell("skipToContent")}
        </a>
        <div className="flex min-h-0 flex-1 flex-row">
          <WorkspaceHistorySidebar shell={shellValue} />
          <div className="flex min-w-0 flex-1 flex-col">
            <AppHeader
              leading={
                <>
                  <WorkspaceHistoryMobileTrigger shell={shellValue} />
                  <OrbitWordmark section={orbitSection} />
                </>
              }
              center={<OrbitProductNavigation shell={shellValue} />}
              actions={<OrbitAccountMenu displayName={displayName} />}
            />
            <main
              ref={mainRef}
              id="workspace-main"
              tabIndex={-1}
              className={cn(
                "app-shell__main",
                isChatRoute && "app-shell__main--chat",
              )}
            >
              <WorkspacePageTransition>{children}</WorkspacePageTransition>
            </main>
            <OrbitMobileNavigation shell={shellValue} />
          </div>
        </div>
      </div>
    </WorkspaceShellContext.Provider>
  );
}
