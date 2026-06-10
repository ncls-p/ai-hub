"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
	useSyncExternalStore,
	type ReactNode,
} from "react";
import {
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	MenuIcon,
} from "lucide-react";

import { DeodisLogo } from "@/components/deodis-logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
const WIDTH_STORAGE_KEY = "workspace-sidebar-width";
const WIDTH_STORAGE_EVENT = "workspace-sidebar-width-change";
const DEFAULT_WIDTH = 256;
const MIN_WIDTH = 208;
const MAX_WIDTH = 360;

function clampWidth(value: number) {
	return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)));
}

function subscribeWidth(callback: () => void) {
	window.addEventListener("storage", callback);
	window.addEventListener(WIDTH_STORAGE_EVENT, callback);
	return () => {
		window.removeEventListener("storage", callback);
		window.removeEventListener(WIDTH_STORAGE_EVENT, callback);
	};
}

function getStoredWidth(): number {
	const stored = window.localStorage.getItem(WIDTH_STORAGE_KEY);
	const parsed = stored ? Number.parseInt(stored, 10) : DEFAULT_WIDTH;
	return Number.isFinite(parsed) ? clampWidth(parsed) : DEFAULT_WIDTH;
}

function setStoredWidth(width: number) {
	window.localStorage.setItem(WIDTH_STORAGE_KEY, String(clampWidth(width)));
	window.dispatchEvent(new Event(WIDTH_STORAGE_EVENT));
}

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
	const t = useTranslations("nav");
	const label = t(item.labelKey);
	const Icon = item.icon;
	const active = isNavItemActive(pathname, item.href);

	const link = (
		<Link
			href={item.href}
			onClick={onNavigate}
			aria-current={active ? "page" : undefined}
			className={cn(
				"group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-200",
				active
					? "nav-item-active bg-primary/10 text-primary shadow-sm"
					: "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground hover:shadow-sm",
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
					<span className="min-w-0 flex-1 truncate">{label}</span>
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
					{label}
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
	const t = useTranslations("nav.groups");
	const [advancedOpen, setAdvancedOpen] = useState(false);

	const advancedGroup = groups.find((group) => group.labelKey === "advanced");
	const simpleGroups = groups.filter((group) => group.labelKey !== "advanced");
	const showAdvancedItems = !collapsed && advancedOpen;

	return (
		<nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-2">
			{simpleGroups.map((group) => (
				<div key={group.labelKey} className="flex flex-col gap-0.5">
					{!collapsed ? (
						<p className="px-2 pb-1 pt-1 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
							{t(group.labelKey)}
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

			{advancedGroup ? (
				<div className="mt-2 flex flex-col gap-0.5 border-t border-border/50 pt-2">
					{!collapsed ? (
						<button
							type="button"
							className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground/80 transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
							aria-expanded={showAdvancedItems}
							onClick={() => setAdvancedOpen(!showAdvancedItems)}
						>
							<span>{t("advanced")}</span>
							<ChevronDownIcon
								className={cn(
									"size-3.5 transition-transform",
									showAdvancedItems && "rotate-180",
								)}
								aria-hidden="true"
							/>
						</button>
					) : null}
					{showAdvancedItems
						? advancedGroup.items.map((item) => (
								<SidebarNavLink
									key={item.href}
									item={item}
									collapsed={collapsed}
									onNavigate={onNavigate}
								/>
							))
						: null}
				</div>
			) : null}
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
	const tShell = useTranslations("shell");
	const tCommon = useTranslations("common");
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
							aria-label={
								collapsed ? tShell("expandSidebar") : tShell("collapseSidebar")
							}
						>
							{collapsed ? (
								<ChevronRightIcon aria-hidden="true" />
							) : (
								<ChevronLeftIcon aria-hidden="true" />
							)}
						</Button>
					) : null}
				</div>
			</div>
			<SidebarNavGroups
				groups={groups}
				collapsed={collapsed}
				onNavigate={onNavigate}
			/>
			<div
				className={cn(
					"relative z-30 mt-auto shrink-0 border-t border-sidebar-border p-3",
					collapsed && "flex flex-col items-center gap-2 overflow-hidden px-2",
				)}
			>
				{!collapsed && shell.displayName ? (
					<p className="mb-2 truncate px-1 text-xs text-muted-foreground">
						{shell.displayName}
					</p>
				) : null}
				{collapsed ? (
					<div className="flex flex-col items-center gap-2">
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="inline-flex">
									<LocaleSwitcher compact className="shrink-0" />
								</span>
							</TooltipTrigger>
							<TooltipContent side="right">{tCommon("language")}</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="inline-flex">
									<ThemeToggleButton
										iconOnly
										className="size-9 shrink-0 rounded-lg"
									/>
								</span>
							</TooltipTrigger>
							<TooltipContent side="right">{tShell("theme")}</TooltipContent>
						</Tooltip>
						{shell.displayName ? (
							<Tooltip>
								<TooltipTrigger asChild>
									<span className="inline-flex">
										<SignOutButton
											iconOnly
											className="size-9 shrink-0 rounded-lg"
										/>
									</span>
								</TooltipTrigger>
								<TooltipContent side="right">{tShell("signOut")}</TooltipContent>
							</Tooltip>
						) : null}
					</div>
				) : (
					<div className="grid gap-2">
						<LocaleSwitcher />
						<ThemeToggleButton className="w-full justify-start rounded-lg" />
						{shell.displayName ? (
							<SignOutButton className="w-full justify-start rounded-lg" />
						) : null}
					</div>
				)}
			</div>
		</div>
	);
}

export function WorkspaceSidebar({ shell }: { shell: WorkspaceShellState }) {
	const tShell = useTranslations("shell");
	const { collapsed, isMobile } = useWorkspaceSidebar();
	const width = useSyncExternalStore(
		subscribeWidth,
		getStoredWidth,
		() => DEFAULT_WIDTH,
	);
	const [resizing, setResizing] = useState(false);

	function startResize(event: React.PointerEvent<HTMLDivElement>) {
		if (collapsed) return;
		event.preventDefault();
		const startX = event.clientX;
		const startWidth = width;
		setResizing(true);
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";

		function onPointerMove(moveEvent: PointerEvent) {
			setStoredWidth(startWidth + moveEvent.clientX - startX);
		}

		function onPointerUp() {
			setResizing(false);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
			document.removeEventListener("pointermove", onPointerMove);
			document.removeEventListener("pointerup", onPointerUp);
		}

		document.addEventListener("pointermove", onPointerMove);
		document.addEventListener("pointerup", onPointerUp, { once: true });
	}

	function adjustWidth(delta: number) {
		setStoredWidth(width + delta);
	}

	if (isMobile) {
		return null;
	}

	return (
		<aside
			data-slot="workspace-sidebar"
			className={cn(
				"relative hidden h-full shrink-0 border-r border-sidebar-border bg-sidebar md:flex md:flex-col",
				!resizing && "transition-[width] duration-200",
			)}
			style={{ width: collapsed ? "3.25rem" : `${width}px` }}
		>
			<SidebarPanel shell={shell} collapsed={collapsed} />
			{!collapsed ? (
				<div
					role="separator"
					aria-label={tShell("resizeNavigation")}
					aria-orientation="vertical"
					aria-valuemin={MIN_WIDTH}
					aria-valuemax={MAX_WIDTH}
					aria-valuenow={width}
					tabIndex={0}
					className="group absolute inset-y-0 bottom-24 right-0 z-10 w-2 translate-x-1 cursor-col-resize outline-none"
					onPointerDown={startResize}
					onKeyDown={(event) => {
						if (event.key === "ArrowLeft") adjustWidth(-12);
						if (event.key === "ArrowRight") adjustWidth(12);
					}}
				>
					<div className="mx-auto h-full w-px bg-transparent transition-colors group-hover:bg-primary/40 group-focus-visible:bg-primary/60" />
				</div>
			) : null}
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
	const tShell = useTranslations("shell");
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
					aria-label={tShell("openNavigation")}
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
					<SheetTitle>{tShell("navigation")}</SheetTitle>
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
