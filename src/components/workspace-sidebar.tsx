"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
	useSyncExternalStore,
	type ReactNode,
} from "react";
import { ChevronLeftIcon, ChevronRightIcon, MenuIcon } from "lucide-react";

import { DeodisLogo } from "@/components/deodis-logo";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWorkspace } from "@/hooks/use-workspace";
import {
	buildMenuGroups,
	isNavItemActive,
	type NavGroup,
	type NavItem,
	type WorkspaceShellState,
} from "@/lib/workspace-nav";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "workspace-sidebar-collapsed";
const STORAGE_EVENT = "workspace-sidebar-collapsed-change";

function subscribeCollapsed(callback: () => void) {
	window.addEventListener("storage", callback);
	window.addEventListener(STORAGE_EVENT, callback);
	return () => {
		window.removeEventListener("storage", callback);
		window.removeEventListener(STORAGE_EVENT, callback);
	};
}

function getStoredCollapsed(defaultCollapsed: boolean): boolean {
	const stored = window.localStorage.getItem(STORAGE_KEY);
	if (stored !== null) return stored === "true";
	return defaultCollapsed;
}

type SidebarContextValue = {
	collapsed: boolean;
	setCollapsed: (collapsed: boolean) => void;
	toggleCollapsed: () => void;
	mobileOpen: boolean;
	setMobileOpen: (open: boolean) => void;
	isMobile: boolean;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useWorkspaceSidebar() {
	const ctx = useContext(SidebarContext);
	if (!ctx) {
		throw new Error(
			"useWorkspaceSidebar must be used within WorkspaceSidebarProvider",
		);
	}
	return ctx;
}

export function WorkspaceSidebarProvider({
	children,
	defaultCollapsed = false,
}: {
	children: ReactNode;
	defaultCollapsed?: boolean;
}) {
	const isMobile = useIsMobile();
	const collapsed = useSyncExternalStore(
		subscribeCollapsed,
		() => getStoredCollapsed(defaultCollapsed),
		() => defaultCollapsed,
	);
	const [mobileOpen, setMobileOpen] = useState(false);

	const setCollapsed = useCallback((value: boolean) => {
		window.localStorage.setItem(STORAGE_KEY, String(value));
		window.dispatchEvent(new Event(STORAGE_EVENT));
	}, []);

	const toggleCollapsed = useCallback(() => {
		setCollapsed(!collapsed);
	}, [collapsed, setCollapsed]);

	const value = useMemo(
		() => ({
			collapsed,
			setCollapsed,
			toggleCollapsed,
			mobileOpen,
			setMobileOpen,
			isMobile,
		}),
		[collapsed, isMobile, mobileOpen, setCollapsed, toggleCollapsed],
	);

	return (
		<SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
	);
}

function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
	const router = useRouter();
	const { workspaceId, workspaces, setWorkspaceId } = useWorkspace();
	const activeWorkspace = workspaces.find((w) => w.id === workspaceId);

	if (workspaces.length <= 1) {
		if (collapsed) {
			return (
				<Tooltip>
					<TooltipTrigger asChild>
						<div
							className="mx-auto flex size-9 items-center justify-center rounded-lg border border-border/60 bg-card/80 text-xs font-semibold"
							aria-label={activeWorkspace?.name ?? "Workspace"}
						>
							{(activeWorkspace?.name ?? "W").slice(0, 1).toUpperCase()}
						</div>
					</TooltipTrigger>
					<TooltipContent side="right">
						{activeWorkspace?.name ?? "Workspace"}
					</TooltipContent>
				</Tooltip>
			);
		}
		return (
			<div className="rounded-lg border border-border/60 bg-card/80 px-3 py-2 text-sm shadow-sm">
				<p className="truncate font-medium text-foreground">
					{activeWorkspace?.name ?? "Workspace"}
				</p>
				<p className="truncate text-xs text-muted-foreground">
					{activeWorkspace?.organizationName ?? "Organization"}
				</p>
			</div>
		);
	}

	if (collapsed) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<div
						className="mx-auto flex size-9 items-center justify-center rounded-lg border border-border/60 bg-card/80 text-xs font-semibold"
						aria-label={activeWorkspace?.name ?? "Workspace"}
					>
						{(activeWorkspace?.name ?? "W").slice(0, 1).toUpperCase()}
					</div>
				</TooltipTrigger>
				<TooltipContent side="right">{activeWorkspace?.name}</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<div className="flex flex-col gap-1">
			<Select
				value={workspaceId ?? undefined}
				onValueChange={(value) => {
					setWorkspaceId(value);
					router.refresh();
				}}
			>
				<SelectTrigger className="h-10 w-full rounded-lg border-border/60 bg-card/80 shadow-sm">
					<SelectValue placeholder="Select workspace" />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						{workspaces.map((workspace) => (
							<SelectItem key={workspace.id} value={workspace.id}>
								{workspace.name}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
			<p className="truncate px-1 text-xs text-muted-foreground">
				{activeWorkspace?.organizationName}
			</p>
		</div>
	);
}

function SidebarNavLink({
	item,
	collapsed,
	onNavigate,
}: {
	item: NavItem;
	collapsed: boolean;
	onNavigate?: () => void;
}) {
	const pathname = usePathname();
	const Icon = item.icon;
	const active = isNavItemActive(pathname, item.href);

	const link = (
		<Link
			href={item.href}
			onClick={onNavigate}
			aria-current={active ? "page" : undefined}
			className={cn(
				"group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-150",
				active
					? "bg-primary/10 text-primary"
					: "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
				collapsed && "justify-center px-2.5",
			)}
		>
			<Icon
				className={cn(
					"size-4 shrink-0 transition-colors",
					active && "text-primary",
				)}
				aria-hidden="true"
			/>
			{!collapsed ? (
				<>
					<span className="min-w-0 flex-1 truncate">{item.label}</span>
					{item.badge && item.badge > 0 ? (
						<Badge
							variant="secondary"
							className="ml-auto h-5 min-w-[1.25rem] px-1.5 text-xs font-semibold bg-primary/10 text-primary"
						>
							{item.badge}
						</Badge>
					) : null}
				</>
			) : null}
		</Link>
	);

	if (collapsed) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>{link}</TooltipTrigger>
				<TooltipContent side="right">
					{item.label}
					{item.badge && item.badge > 0 ? ` (${item.badge})` : ""}
				</TooltipContent>
			</Tooltip>
		);
	}

	return link;
}

function SidebarNavGroups({
	groups,
	collapsed,
	onNavigate,
}: {
	groups: NavGroup[];
	collapsed: boolean;
	onNavigate?: () => void;
}) {
	return (
		<nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-2">
			{groups.map((group, groupIndex) => (
				<div key={group.label} className="flex flex-col gap-0.5">
					{groupIndex > 0 && !collapsed ? (
						<div className="my-2 h-px bg-border/50" />
					) : null}
					{!collapsed ? (
						<p className="px-2 pb-1 pt-1 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
							{group.label}
						</p>
					) : null}
					{group.items.map((item) => (
						<SidebarNavLink
							key={item.href}
							item={item}
							collapsed={collapsed}
							onNavigate={onNavigate}
						/>
					))}
				</div>
			))}
		</nav>
	);
}

function SidebarPanel({
	shell,
	collapsed,
	onNavigate,
	showCollapseControl = true,
}: {
	shell: WorkspaceShellState;
	collapsed: boolean;
	onNavigate?: () => void;
	showCollapseControl?: boolean;
}) {
	const { toggleCollapsed } = useWorkspaceSidebar();
	const groups = buildMenuGroups(shell);

	return (
		<div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
			<div
				className={cn(
					"flex shrink-0 flex-col gap-3 border-b border-sidebar-border p-3",
					collapsed && "items-center px-2",
				)}
			>
				<div
					className={cn(
						"flex items-center gap-2",
						collapsed ? "flex-col" : "justify-between",
					)}
				>
					{!collapsed ? (
						<DeodisLogo href="/chat" className="h-6 shrink-0" />
					) : (
						<DeodisLogo
							href="/chat"
							className="h-6 w-6 shrink-0 object-contain"
						/>
					)}
					{showCollapseControl ? (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-8 shrink-0"
							onClick={toggleCollapsed}
							aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
						>
							{collapsed ? (
								<ChevronRightIcon aria-hidden="true" />
							) : (
								<ChevronLeftIcon aria-hidden="true" />
							)}
						</Button>
					) : null}
				</div>
				<WorkspaceSwitcher collapsed={collapsed} />
			</div>
			<SidebarNavGroups
				groups={groups}
				collapsed={collapsed}
				onNavigate={onNavigate}
			/>
			<div
				className={cn(
					"mt-auto shrink-0 border-t border-sidebar-border p-3",
					collapsed && "flex flex-col items-center gap-2 overflow-hidden px-2",
				)}
			>
				{!collapsed && shell.displayName ? (
					<p className="mb-2 truncate px-1 text-xs text-muted-foreground">
						{shell.displayName}
					</p>
				) : null}
				<div
					className={cn(
						"flex gap-2",
						collapsed ? "flex-col items-center" : "flex-row",
					)}
				>
					{collapsed ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="inline-flex">
									<ThemeToggleButton
										iconOnly
										className="size-9 shrink-0 rounded-lg"
									/>
								</span>
							</TooltipTrigger>
							<TooltipContent side="right">Theme</TooltipContent>
						</Tooltip>
					) : (
						<ThemeToggleButton className="flex-1 justify-start rounded-lg" />
					)}
					{shell.displayName ? (
						collapsed ? (
							<Tooltip>
								<TooltipTrigger asChild>
									<span className="inline-flex">
										<SignOutButton
											iconOnly
											className="size-9 shrink-0 rounded-lg"
										/>
									</span>
								</TooltipTrigger>
								<TooltipContent side="right">Sign out</TooltipContent>
							</Tooltip>
						) : (
							<SignOutButton className="flex-1 justify-start rounded-lg" />
						)
					) : null}
				</div>
			</div>
		</div>
	);
}

export function WorkspaceSidebar({ shell }: { shell: WorkspaceShellState }) {
	const { collapsed, isMobile } = useWorkspaceSidebar();

	if (isMobile) {
		return null;
	}

	return (
		<aside
			data-slot="workspace-sidebar"
			className={cn(
				"hidden h-full shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex md:flex-col",
				collapsed ? "w-[3.25rem]" : "w-64",
			)}
		>
			<SidebarPanel shell={shell} collapsed={collapsed} />
		</aside>
	);
}

export function WorkspaceSidebarMobileTrigger({
	className,
	shell,
}: {
	className?: string;
	shell: WorkspaceShellState;
}) {
	const { mobileOpen, setMobileOpen } = useWorkspaceSidebar();
	const hasPending = shell.pendingToolCount > 0;

	return (
		<Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
			<SheetTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className={cn("relative md:hidden", className)}
					aria-label="Open navigation"
				>
					<MenuIcon aria-hidden="true" />
					{hasPending ? (
						<Badge
							variant="destructive"
							className="absolute -right-1 -top-1 h-5 min-w-5 px-1 text-xs"
						>
							{shell.pendingToolCount}
						</Badge>
					) : null}
				</Button>
			</SheetTrigger>
			<SheetContent side="left" className="w-[min(100vw-2rem,18rem)] p-0">
				<SheetHeader className="sr-only">
					<SheetTitle>Navigation</SheetTitle>
				</SheetHeader>
				<SidebarPanel
					shell={shell}
					collapsed={false}
					showCollapseControl={false}
					onNavigate={() => setMobileOpen(false)}
				/>
			</SheetContent>
		</Sheet>
	);
}
