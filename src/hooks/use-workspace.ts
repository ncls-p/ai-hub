"use client";

import type { OrganizationThemeConfig } from "@/modules/organization/themes";
import type { OrganizationHeroConfig } from "@/modules/organization/hero-branding";
import { createContext, useContext } from "react";

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
  organizationName: string;
  organizationLogoUrl: string | null;
  organizationTheme: string;
  organizationThemeConfig: OrganizationThemeConfig | null;
  organizationHeroConfig: OrganizationHeroConfig | null;
  isActive: boolean;
};

export type WorkspaceContextValue = {
  sidebarNavConfig?: import("@/modules/navigation/sidebar-config").SidebarNavConfig;
  workspaceId: string | null;
  workspaces: WorkspaceSummary[];
  organizationName: string | null;
  organizationLogoUrl: string | null;
  organizationTheme: string;
  organizationThemeConfig: OrganizationThemeConfig | null;
  organizationHeroConfig: OrganizationHeroConfig | null;
  isLoading: boolean;
  error: string | null;
  setWorkspaceId: (workspaceId: string) => void | Promise<boolean>;
  refresh: () => Promise<void>;
};

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(
  null,
);

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return context;
}
