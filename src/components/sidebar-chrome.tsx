"use client";
import { WorkspaceContextSwitcher } from "./workspace-context-switcher";

import { ChevronsUpDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { DeodisLogo } from "@/components/deodis-logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

export const APP_SIDEBAR_SURFACE_CLASS =
  "border-sidebar-border/65 bg-sidebar text-sidebar-foreground";

export function SidebarHeader({
  contextLabel,
  action,
  collapsed = false,
}: {
  contextLabel: string;
  action?: ReactNode;
  collapsed?: boolean;
}) {
  const { organizationLogoUrl, organizationName } = useWorkspace();
  return (
    <>
      <div
        className={cn(
          "flex shrink-0 items-center border-b border-sidebar-border/55 px-3",
          collapsed
            ? "h-24 flex-col justify-center gap-1.5 px-2"
            : "h-16 justify-between gap-3",
        )}
      >
        <div
          className={cn(
            "flex min-w-0",
            collapsed
              ? "items-center justify-center"
              : "flex-col items-start justify-center",
          )}
        >
          <DeodisLogo
            href="/chat"
            className={cn(
              "shrink-0 object-contain",
              !organizationLogoUrl && "dark:brightness-0 dark:invert",
              collapsed ? "size-6" : "h-7 w-auto",
            )}
            label="Deodis chat"
            src={organizationLogoUrl ?? undefined}
            alt={
              organizationLogoUrl
                ? (organizationName ?? "Organization")
                : undefined
            }
          />
          {!collapsed ? (
            <span className="-mt-0.5 max-w-full truncate pl-0.5 font-mono text-[0.58rem] font-medium uppercase tracking-[0.18em] text-primary/80">
              {contextLabel}
            </span>
          ) : null}
        </div>
        {action}
      </div>
    </>
  );
}

export function SidebarFooter({
  displayName,
  collapsed = false,
}: {
  displayName?: string | null;
  collapsed?: boolean;
}) {
  const tShell = useTranslations("shell");
  const initial = displayName?.trim().charAt(0).toLocaleUpperCase() || "D";

  return (
    <div
      className={cn(
        "mt-auto shrink-0 border-t border-sidebar-border/60",
        collapsed ? "p-2" : "p-2.5",
      )}
    >
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex min-h-11 items-center rounded-xl text-left text-sm outline-none transition-[background-color,color,transform] duration-200 hover:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-sidebar-ring active:scale-[0.985]",
                  collapsed ? "w-11 justify-center" : "w-full gap-2.5 px-2.5",
                )}
                aria-label={displayName || tShell("workspace")}
              >
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary"
                >
                  {initial}
                </span>
                {!collapsed ? (
                  <>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {displayName || tShell("workspace")}
                    </span>
                    <ChevronsUpDownIcon
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </>
                ) : null}
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          {collapsed ? (
            <TooltipContent side="right">
              {displayName || tShell("workspace")}
            </TooltipContent>
          ) : null}
        </Tooltip>
        <DropdownMenuContent
          side={collapsed ? "right" : "top"}
          align="start"
          sideOffset={8}
          className="w-64 p-1.5"
        >
          <DropdownMenuLabel className="truncate px-2.5 py-2 text-sm font-medium text-foreground">
            {displayName || tShell("workspace")}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="p-0">
            <LocaleSwitcher menu />
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="p-0">
            <ThemeToggleButton menu />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild variant="destructive" className="p-0">
            <SignOutButton className="h-10 w-full rounded-lg px-2.5 font-normal" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function WorkspaceStatusFooter({
  name,
  context,
}: {
  name: string;
  context?: string | null;
}) {
  return <WorkspaceContextSwitcher name={name} context={context} />;
}

export function sidebarNavItemClassName({
  active,
  collapsed = false,
}: {
  active: boolean;
  collapsed?: boolean;
}) {
  return cn(
    "group relative flex min-h-10 items-center gap-2.5 rounded-xl px-2 py-1.5 text-[0.82rem] font-medium transition-[background-color,color,box-shadow,scale] duration-180 ease-out active:scale-[0.98]",
    active
      ? "nav-item-active bg-card/88 text-sidebar-accent-foreground shadow-[var(--control-shadow)]"
      : "text-sidebar-foreground/68 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
    collapsed && "justify-center px-1.5",
  );
}

export function SidebarNavIcon({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg transition-[background-color,color] duration-150",
        active ? "bg-accent text-primary" : "text-current",
      )}
    >
      {children}
    </span>
  );
}
