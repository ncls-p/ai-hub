"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
	ActivityIcon,
	BookOpenIcon,
	BotIcon,
	KeyRoundIcon,
	LogInIcon,
	MenuIcon,
	MessageSquareIcon,
	MessageSquarePlusIcon,
	PlugZapIcon,
	ScrollTextIcon,
	ServerIcon,
	SettingsIcon,
	StoreIcon,
	UsersIcon,
	WrenchIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { DeodisLogo } from "@/components/deodis-logo";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson, fetchPendingToolCount } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface AppShellProps {
	children: React.ReactNode;
	displayName?: string;
	isAdmin?: boolean;
}

type NavItem = {
	href: string;
	label: string;
	icon: LucideIcon;
	badge?: number;
};

type WorkspacePermissions = {
	canViewUsage: boolean;
	canViewAudit: boolean;
};

type WorkspaceShellState = {
	displayName?: string;
	isAdmin?: boolean;
	pendingToolCount: number;
	permissions: WorkspacePermissions;
};

const WorkspaceShellContext = createContext<WorkspaceShellState | null>(null);

const workNavItems: NavItem[] = [
	{ href: "/chat", label: "Chat", icon: MessageSquareIcon },
	{ href: "/agents", label: "Assistants", icon: BotIcon },
];

const resourceNavItems: NavItem[] = [
	{ href: "/knowledge", label: "Knowledge", icon: BookOpenIcon },
	{ href: "/marketplace", label: "Catalog", icon: StoreIcon },
];

const configurationNavItems: NavItem[] = [
	{ href: "/providers", label: "AI Connections", icon: PlugZapIcon },
	{ href: "/mcp", label: "MCP", icon: ServerIcon },
	{ href: "/api-keys", label: "API keys", icon: KeyRoundIcon },
];

const governanceNavItems: NavItem[] = [
	{ href: "/usage", label: "Usage", icon: ActivityIcon },
	{ href: "/audit", label: "Activity log", icon: ScrollTextIcon },
];

const routeTitles: Record<string, string> = {
	"/agents": "Assistants",
	"/providers": "AI Connections",
	"/knowledge": "Knowledge",
	"/mcp": "MCP",
	"/tools": "Approvals",
	"/marketplace": "Catalog",
	"/api-keys": "API keys",
	"/usage": "Usage",
	"/audit": "Activity log",
	"/members": "Team",
	"/settings": "Settings",
	"/setup": "Setup",
};

function useWorkspaceShell() {
	const value = useContext(WorkspaceShellContext);
	if (!value) {
		throw new Error("Workspace menu must be rendered inside AppShell");
	}
	return value;
}

function buildMenuGroups({
	isAdmin,
	pendingToolCount,
	permissions,
}: WorkspaceShellState) {
	const approvalsItem: NavItem = {
		href: "/tools",
		label: "Approvals",
		icon: WrenchIcon,
		badge: pendingToolCount,
	};
	const governanceItems = governanceNavItems.filter((item) => {
		if (item.href === "/usage") return permissions.canViewUsage;
		if (item.href === "/audit") return permissions.canViewAudit;
		return false;
	});
	const teamItems: NavItem[] = [
		{ href: "/members", label: "Team", icon: UsersIcon },
		...(isAdmin
			? [{ href: "/settings", label: "Settings", icon: SettingsIcon }]
			: []),
	];

	return [
		[...workNavItems, ...(pendingToolCount > 0 ? [approvalsItem] : [])],
		resourceNavItems,
		[
			...(pendingToolCount > 0 ? [] : [approvalsItem]),
			...configurationNavItems,
		],
		[...governanceItems, ...teamItems],
	].filter((group) => group.length > 0);
}

function WorkspaceSwitcher() {
	const router = useRouter();
	const { workspaceId, workspaces, setWorkspaceId } = useWorkspace();
	const activeWorkspace = workspaces.find(
		(workspace) => workspace.id === workspaceId,
	);

	if (workspaces.length <= 1) {
		return (
			<div className="rounded-xl border border-border/60 bg-card/80 px-3 py-2 text-sm shadow-sm">
				<p className="truncate font-medium text-foreground">
					{activeWorkspace?.name ?? "Workspace"}
				</p>
				<p className="truncate text-xs text-muted-foreground">
					{activeWorkspace?.organizationName ?? "Organization"}
				</p>
			</div>
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
				<SelectTrigger className="h-10 w-full rounded-xl border-border/60 bg-card/80 shadow-sm">
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

function WorkspaceMenuLink({ item }: { item: NavItem }) {
	const pathname = usePathname();
	const Icon = item.icon;
	const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

	return (
		<DropdownMenuItem
			asChild
			className={cn("h-9 rounded-xl px-2", active && "bg-accent text-accent-foreground")}
		>
			<Link href={item.href}>
				<Icon aria-hidden="true" />
				<span className="min-w-0 flex-1 truncate">{item.label}</span>
				{item.badge && item.badge > 0 ? (
					<Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1.5 text-[10px]">
						{item.badge}
					</Badge>
				) : null}
			</Link>
		</DropdownMenuItem>
	);
}

export function WorkspaceMenuButton({
	align = "end",
	className,
	showLabel = false,
}: {
	align?: "start" | "center" | "end";
	className?: string;
	showLabel?: boolean;
}) {
	const shell = useWorkspaceShell();
	const groups = buildMenuGroups(shell);
	const hasPendingTools = shell.pendingToolCount > 0;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size={showLabel ? "sm" : "icon"}
					className={cn(
						"relative rounded-full border border-border/60 bg-background/80 shadow-sm backdrop-blur-xl hover:bg-muted/80",
						className,
					)}
					aria-label="Open workspace menu"
				>
					<MenuIcon data-icon={showLabel ? "inline-start" : undefined} aria-hidden="true" />
					{showLabel ? "Workspace" : <span className="sr-only">Workspace</span>}
					{hasPendingTools && !showLabel ? (
						<Badge
							variant="destructive"
							className="absolute -right-1 -top-1 h-5 min-w-5 px-1 text-[10px]"
						>
							{shell.pendingToolCount}
						</Badge>
					) : null}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align={align}
				className="w-80 rounded-2xl border-border/70 bg-popover/95 p-2 shadow-2xl shadow-foreground/10 backdrop-blur-xl"
			>
				<div className="p-1.5">
					<WorkspaceSwitcher />
				</div>
				<DropdownMenuSeparator />
				{groups.map((group, index) => (
					<DropdownMenuGroup key={group.map((item) => item.href).join(":")}>
						{index > 0 ? <DropdownMenuSeparator /> : null}
						{group.map((item) => (
							<WorkspaceMenuLink key={item.href} item={item} />
						))}
					</DropdownMenuGroup>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
					{shell.displayName ? `Signed in as ${shell.displayName}` : "Account"}
				</DropdownMenuLabel>
				<div className="flex items-center gap-2 p-1.5">
					<ThemeToggleButton className="flex-1 justify-start rounded-xl" />
					{shell.displayName ? (
						<SignOutButton className="flex-1 justify-start rounded-xl" />
					) : (
						<Button asChild size="sm" className="flex-1 justify-start rounded-xl">
							<Link href="/auth/signin">
								<LogInIcon data-icon="inline-start" aria-hidden="true" />
								Sign in
							</Link>
						</Button>
					)}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function AppShell({ children, displayName, isAdmin }: AppShellProps) {
	const pathname = usePathname();
	const { workspaceId } = useWorkspace();
	const isChatRoute = pathname === "/chat" || pathname.startsWith("/chat/");
	const currentTitle =
		Object.entries(routeTitles)
			.sort((a, b) => b[0].length - a[0].length)
			.find(([href]) => pathname === href || pathname.startsWith(`${href}/`))?.[1] ??
		"Workspace";
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
			<div
				data-page="app-shell"
				className="flex h-svh min-h-svh flex-col bg-muted/20 text-foreground"
			>
				{!isChatRoute ? (
					<header className="flex h-16 shrink-0 items-center justify-between border-b border-border/60 bg-background/85 px-4 shadow-sm shadow-foreground/5 backdrop-blur-xl">
						<div className="flex min-w-0 items-center gap-3">
							<DeodisLogo href="/chat" className="h-6 shrink-0" />
							<div className="hidden h-6 w-px bg-border/70 sm:block" />
							<div className="min-w-0">
								<p className="truncate text-sm font-semibold">{currentTitle}</p>
								<p className="truncate text-xs text-muted-foreground">
									Workspace
								</p>
							</div>
						</div>
						<div className="flex items-center gap-1">
							<Button
								asChild
								variant="ghost"
								size="sm"
								className="hidden rounded-full border border-transparent sm:inline-flex"
							>
								<Link href="/chat">
									<MessageSquareIcon data-icon="inline-start" aria-hidden="true" />
									Chat
								</Link>
							</Button>
							<Button asChild variant="outline" size="sm" className="rounded-full bg-background/80 shadow-sm">
								<Link href="/chat">
									<MessageSquarePlusIcon data-icon="inline-start" aria-hidden="true" />
									New
								</Link>
							</Button>
							<WorkspaceMenuButton />
						</div>
					</header>
				) : null}
				<main
					className={cn(
						"min-h-0 flex-1 overflow-y-auto",
						isChatRoute && "overflow-hidden",
					)}
				>
					{children}
				</main>
			</div>
		</WorkspaceShellContext.Provider>
	);
}
