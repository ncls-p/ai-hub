"use client";

import {
  ChevronDownIcon,
  SlidersHorizontalIcon,
  UserRoundIcon,
  SettingsIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useEffect } from "react";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@/hooks/use-workspace";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { isNavItemActive, type WorkspaceShellState } from "@/lib/workspace-nav";
import { buildMenuGroups } from "@/modules/navigation/sidebar-config";
import { useLinkStatus } from "next/link";

const primaryDestinations = [
  "/chat",
  "/agents",
  "/tools",
  "/knowledge",
  "/scheduled-tasks",
] as const;

function NavigationLinkFeedback() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className="workspace-nav-pending"
      data-pending={pending}
    />
  );
}

export function OrbitWordmark({ section }: { section: string }) {
  const { workspaceId, workspaces } = useWorkspace();
  const projectName =
    workspaces.find((workspace) => workspace.id === workspaceId)?.name ??
    "Maiah";
  return (
    <div className="flex min-w-0 items-baseline gap-2 sm:min-w-40">
      <span className="max-w-36 truncate text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-foreground sm:max-w-48 sm:text-[0.72rem] sm:tracking-[0.16em]">
        {projectName}
      </span>
      <span className="hidden min-w-16 font-mono text-[0.58rem] uppercase tracking-[0.18em] text-primary sm:inline">
        {section}
      </span>
    </div>
  );
}

export function OrbitMobileNavigation({
  shell,
}: {
  shell: WorkspaceShellState;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("nav");
  const allItems = buildMenuGroups(shell).flatMap((group) => group.items);
  const itemByHref = new Map(allItems.map((item) => [item.href, item]));
  const items = primaryDestinations
    .map((href) => itemByHref.get(href))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  useEffect(() => {
    for (const destination of primaryDestinations) {
      if (destination !== pathname) void router.prefetch(destination);
    }
  }, [pathname, router]);

  return (
    <nav
      data-slot="mobile-app-navigation"
      aria-label={t("groups.primary")}
      className="mobile-app-navigation md:hidden"
    >
      {items.map((item) => {
        const active = isNavItemActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={true}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={cn(
              "mobile-app-navigation__item",
              active && "mobile-app-navigation__item--active",
            )}
          >
            <span className="mobile-app-navigation__icon">
              <Icon aria-hidden="true" />
            </span>
            <span className="max-w-full truncate">
              {productLabelForMobile(t, item.href, item.labelKey)}
            </span>
            <NavigationLinkFeedback />
          </Link>
        );
      })}
    </nav>
  );
}

function productLabelForMobile(
  t: ReturnType<typeof useTranslations<"nav">>,
  href: string,
  labelKey: string,
) {
  if (href === "/chat") return t("mobileChat");
  if (href === "/agents") return t("mobileAgents");
  if (href === "/tools") return t("mobileTools");
  if (href === "/knowledge") return t("mobileKnowledge");
  if (href === "/scheduled-tasks") return t("mobilePlanning");
  return t(labelKey);
}

export function OrbitProductNavigation({
  shell,
}: {
  shell: WorkspaceShellState;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const allItems = buildMenuGroups(shell).flatMap((group) => group.items);
  const itemByHref = new Map(allItems.map((item) => [item.href, item]));
  const primaryItems = primaryDestinations
    .map((href) => itemByHref.get(href))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const primaryHrefs = new Set(primaryItems.map((item) => item.href));
  const secondaryItems = allItems.filter(
    (item, index) =>
      !primaryHrefs.has(item.href) &&
      allItems.findIndex((candidate) => candidate.href === item.href) === index,
  );
  const productLabel = (href: string, labelKey: string) => {
    if (href === "/tools") return t("toolsShort");
    if (href === "/knowledge") return t("knowledgeShort");
    if (href === "/scheduled-tasks") return t("planningShort");
    return t(labelKey);
  };

  return (
    <div className="flex min-w-0 items-center gap-1">
      <nav
        aria-label={t("groups.primary")}
        className="scrollbar-none hidden min-w-0 items-center gap-0.5 overflow-x-auto md:flex"
      >
        {primaryItems.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative inline-flex h-10 shrink-0 items-center rounded-lg px-3 text-xs font-medium outline-none transition-[background-color,color,box-shadow,scale] duration-180 ease-out after:absolute after:right-3 after:bottom-0 after:left-3 after:h-px after:origin-center after:scale-x-0 after:rounded-full after:bg-primary after:opacity-0 after:transition-[scale,opacity] after:duration-180 focus-visible:ring-2 focus-visible:ring-ring/45 active:scale-[0.96]",
                active
                  ? "bg-primary/[0.055] text-primary shadow-[inset_0_-1px_0_color-mix(in_oklch,var(--primary)_12%,transparent)] after:scale-x-100 after:opacity-100"
                  : "text-muted-foreground hover:bg-muted/55 hover:text-foreground",
              )}
            >
              {productLabel(item.href, item.labelKey)}
              {item.badge ? (
                <span className="ml-1.5 font-mono text-[0.58rem] text-primary">
                  {item.badge}
                </span>
              ) : null}
              <NavigationLinkFeedback />
            </Link>
          );
        })}
      </nav>
      {secondaryItems.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("groups.advanced")}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted-foreground outline-none transition-[background-color,color,scale] duration-180 ease-out hover:bg-muted/55 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45 active:scale-[0.96]"
            >
              <SlidersHorizontalIcon className="size-3.5" aria-hidden="true" />
              <span className="hidden lg:inline">{t("groups.advanced")}</span>
              <ChevronDownIcon className="size-3" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-60">
            {secondaryItems.map((item) => {
              const Icon = item.icon;
              return (
                <DropdownMenuItem key={item.href} asChild>
                  <Link
                    href={item.href}
                    scroll={false}
                    className="min-h-10 gap-2.5"
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">
                      {t(item.labelKey)}
                    </span>
                    {item.badge ? (
                      <span className="font-mono text-[0.62rem] text-primary">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

export function OrbitAccountMenu({ displayName }: { displayName?: string }) {
  const tShell = useTranslations("shell");
  const { workspaceId, workspaces, setWorkspaceId } = useWorkspace();
  const initial = displayName?.trim().charAt(0).toLocaleUpperCase() || "M";
  const workspaceGroups = new Map<string, typeof workspaces>();
  for (const workspace of workspaces) {
    const organizationKey =
      workspace.organizationId || workspace.organizationName;
    const organizationWorkspaces = workspaceGroups.get(organizationKey) ?? [];
    organizationWorkspaces.push(workspace);
    workspaceGroups.set(organizationKey, organizationWorkspaces);
  }
  const workspacesByOrganization = Array.from(workspaceGroups);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background outline-none transition-[transform,box-shadow] hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={displayName || tShell("workspace")}
        >
          {initial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate px-2.5 py-2 text-sm font-medium">
            {displayName || tShell("workspace")}
          </DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <UserRoundIcon aria-hidden="true" />
              {tShell("myAccount")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/admin/settings">
              <SettingsIcon aria-hidden="true" />
              {tShell("appSettings")}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {workspacesByOrganization.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{tShell("activeProject")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={workspaceId ?? ""}
                onValueChange={(nextWorkspaceId) => {
                  if (nextWorkspaceId !== workspaceId) {
                    setWorkspaceId(nextWorkspaceId);
                  }
                }}
              >
                {workspacesByOrganization.map(
                  ([organizationId, organizationWorkspaces]) => (
                    <Fragment key={organizationId}>
                      <DropdownMenuLabel inset className="mt-1 truncate">
                        {organizationWorkspaces[0]?.organizationName}
                      </DropdownMenuLabel>
                      {organizationWorkspaces.map((workspace) => (
                        <DropdownMenuRadioItem
                          key={workspace.id}
                          value={workspace.id}
                        >
                          <span className="truncate">{workspace.name}</span>
                        </DropdownMenuRadioItem>
                      ))}
                    </Fragment>
                  ),
                )}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild className="p-0">
            <LocaleSwitcher menu />
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="p-0">
            <ThemeToggleButton menu />
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild variant="destructive" className="p-0">
            <SignOutButton className="h-10 w-full rounded-lg px-2.5 font-normal" />
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
