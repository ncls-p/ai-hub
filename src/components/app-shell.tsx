"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

import { DeodisLogo } from "@/components/deodis-logo";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
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
	icon: typeof MessageSquareIcon;
	badge?: number;
};

const primaryNavItems: NavItem[] = [
	{ href: "/chat", label: "Chat", icon: MessageSquareIcon },
];

const configurationNavItems: NavItem[] = [
	{ href: "/agents", label: "Assistants", icon: BotIcon },
	{ href: "/providers", label: "AI Connections", icon: PlugZapIcon },
	{ href: "/api-keys", label: "API keys", icon: KeyRoundIcon },
	{ href: "/knowledge", label: "Knowledge", icon: BookOpenIcon },
	{ href: "/mcp", label: "Integrations", icon: ServerIcon },
];

const activityNavItems: NavItem[] = [
	{ href: "/tools", label: "Approvals", icon: WrenchIcon },
];

const discoverNavItems: NavItem[] = [
	{ href: "/marketplace", label: "Catalog", icon: StoreIcon },
];

const governanceNavItems: NavItem[] = [
	{ href: "/usage", label: "Usage", icon: ActivityIcon },
	{ href: "/audit", label: "Activity log", icon: ScrollTextIcon },
];

const adminNavItems: NavItem[] = [
	{ href: "/members", label: "Team", icon: UsersIcon },
	{ href: "/settings", label: "Settings", icon: SettingsIcon },
];

type WorkspacePermissions = {
	canViewUsage: boolean;
	canViewAudit: boolean;
};

function NavLink({ href, label, icon: Icon, badge }: NavItem) {
	const pathname = usePathname();
	const isActive = pathname === href || pathname.startsWith(`${href}/`);

	return (
		<Link
			href={href}
			className={cn(
				"flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
				isActive
					? "bg-primary/10 text-foreground"
					: "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
			)}
		>
			<Icon className="size-4 shrink-0" aria-hidden="true" />
			<span className="min-w-0 flex-1 truncate">{label}</span>
			{badge && badge > 0 ? (
				<Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-[10px]">
					{badge}
				</Badge>
			) : null}
		</Link>
	);
}

function NavGroup({ title, items }: { title: string; items: NavItem[] }) {
	if (items.length === 0) return null;
	return (
		<div className="flex flex-col gap-1">
			<div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
				{title}
			</div>
			{items.map((item) => (
				<NavLink key={item.href} {...item} />
			))}
		</div>
	);
}

function WorkspaceSwitcher() {
	const router = useRouter();
	const { workspaceId, workspaces, setWorkspaceId } = useWorkspace();
	const activeWorkspace = workspaces.find(
		(workspace) => workspace.id === workspaceId,
	);

	if (workspaces.length <= 1) {
		return (
			<div className="rounded-xl bg-muted/60 px-3 py-2 text-sm">
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
				<SelectTrigger className="w-full rounded-xl">
					<SelectValue placeholder="Select workspace" />
				</SelectTrigger>
				<SelectContent>
					{workspaces.map((workspace) => (
						<SelectItem key={workspace.id} value={workspace.id}>
							{workspace.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<p className="px-1 text-xs text-muted-foreground">
				{activeWorkspace?.organizationName}
			</p>
		</div>
	);
}

function SidebarContent({
	displayName,
	isAdmin,
	pendingToolCount,
	permissions,
}: {
	displayName?: string;
	isAdmin?: boolean;
	pendingToolCount: number;
	permissions: WorkspacePermissions;
}) {
	const activityItems = activityNavItems.map((item) =>
		item.href === "/tools" ? { ...item, badge: pendingToolCount } : item,
	);

	const governanceItems = governanceNavItems.filter((item) => {
		if (item.href === "/usage") return permissions.canViewUsage;
		if (item.href === "/audit") return permissions.canViewAudit;
		return false;
	});

	return (
		<div className="flex h-full flex-col gap-3 p-3">
			<div className="flex items-center justify-between gap-2 px-1 py-1">
				<DeodisLogo href="/chat" className="h-7" />
			</div>

			<Button
				asChild
				className="h-10 justify-start rounded-xl"
				variant="outline"
			>
				<Link href="/chat">
					<MessageSquarePlusIcon data-icon="inline-start" aria-hidden="true" />
					New chat
				</Link>
			</Button>

			<nav
				className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
				aria-label="Main navigation"
			>
				<NavGroup title="Home" items={primaryNavItems} />
				<NavGroup title="Configuration" items={configurationNavItems} />
				<NavGroup title="Activity" items={activityItems} />
				<NavGroup title="Discover" items={discoverNavItems} />
				{governanceItems.length > 0 ? (
					<NavGroup title="Governance" items={governanceItems} />
				) : null}
				{isAdmin ? (
					<NavGroup title="Admin" items={adminNavItems} />
				) : (
					<NavGroup title="Team" items={[{ href: "/members", label: "Team", icon: UsersIcon }]} />
				)}
			</nav>

			<div className="flex flex-col gap-2 border-t border-border/70 pt-3">
				<ThemeToggleButton className="inline-flex w-full justify-start lg:hidden" />
				<ThemeToggleButton className="hidden lg:inline-flex" />
				{displayName ? (
					<>
						<WorkspaceSwitcher />
						<div className="rounded-xl px-3 py-1 text-xs text-muted-foreground">
							Signed in as{" "}
							<span className="font-medium text-foreground">{displayName}</span>
						</div>
						<SignOutButton />
					</>
				) : (
					<Button asChild size="sm" className="justify-start rounded-xl">
						<Link href="/auth/signin">
							<LogInIcon data-icon="inline-start" aria-hidden="true" />
							Sign in
						</Link>
					</Button>
				)}
			</div>
		</div>
	);
}

export function AppShell({ children, displayName, isAdmin }: AppShellProps) {
	const pathname = usePathname();
	const { workspaceId } = useWorkspace();
	const isChatRoute = pathname === "/chat" || pathname.startsWith("/chat/");
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

	const sidebar = (
		<SidebarContent
			displayName={displayName}
			isAdmin={isAdmin}
			pendingToolCount={pendingToolCount}
			permissions={permissions}
		/>
	);

	return (
		<div
			data-page="app-shell"
			className="flex h-svh min-h-svh bg-background text-foreground"
		>
			<aside className="hidden w-56 shrink-0 border-r border-border/70 bg-card/45 backdrop-blur-xl lg:block">
				{sidebar}
			</aside>

			<div className="flex min-w-0 flex-1 flex-col">
				{!isChatRoute ? (
					<header className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-background/80 px-3 backdrop-blur-xl lg:hidden">
						<Sheet>
							<SheetTrigger asChild>
								<Button variant="ghost" size="icon-sm" aria-label="Open menu">
									<MenuIcon aria-hidden="true" />
								</Button>
							</SheetTrigger>
							<SheetContent side="left" className="w-[min(100vw-2rem,18rem)] p-0">
								<SheetHeader className="sr-only">
									<SheetTitle>Navigation</SheetTitle>
								</SheetHeader>
								{sidebar}
							</SheetContent>
						</Sheet>
						<DeodisLogo href="/chat" className="h-6" />
						<Button asChild variant="ghost" size="icon-sm" aria-label="New chat">
							<Link href="/chat">
								<MessageSquarePlusIcon aria-hidden="true" />
							</Link>
						</Button>
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
		</div>
	);
}
