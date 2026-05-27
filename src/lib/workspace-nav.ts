import {
	ActivityIcon,
	BookOpenIcon,
	BotIcon,
	KeyRoundIcon,
	MessageSquareIcon,
	PlugZapIcon,
	ScrollTextIcon,
	ServerIcon,
	SettingsIcon,
	StoreIcon,
	UsersIcon,
	WrenchIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
	href: string;
	label: string;
	icon: LucideIcon;
	badge?: number;
};

export type NavGroup = {
	label: string;
	items: NavItem[];
};

export type WorkspacePermissions = {
	canViewUsage: boolean;
	canViewAudit: boolean;
};

export type WorkspaceShellState = {
	displayName?: string;
	isAdmin?: boolean;
	pendingToolCount: number;
	permissions: WorkspacePermissions;
};

export const workNavItems: NavItem[] = [
	{ href: "/chat", label: "Chat", icon: MessageSquareIcon },
	{ href: "/agents", label: "Assistants", icon: BotIcon },
];

export const resourceNavItems: NavItem[] = [
	{ href: "/knowledge", label: "Knowledge", icon: BookOpenIcon },
	{ href: "/marketplace", label: "Catalog", icon: StoreIcon },
];

export const configurationNavItems: NavItem[] = [
	{ href: "/providers", label: "AI Connections", icon: PlugZapIcon },
	{ href: "/mcp", label: "MCP", icon: ServerIcon },
	{ href: "/api-keys", label: "API keys", icon: KeyRoundIcon },
];

export const governanceNavItems: NavItem[] = [
	{ href: "/usage", label: "Usage", icon: ActivityIcon },
	{ href: "/audit", label: "Activity log", icon: ScrollTextIcon },
];

export const routeTitles: Record<string, string> = {
	"/chat": "Chat",
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

export function getRouteTitle(pathname: string): string {
	if (/^\/agents\/[^/]+$/.test(pathname)) {
		return "Assistant configuration";
	}
	return (
		Object.entries(routeTitles)
			.sort((a, b) => b[0].length - a[0].length)
			.find(([href]) => pathname === href || pathname.startsWith(`${href}/`))?.[1] ??
		"Workspace"
	);
}

export function buildMenuGroups({
	isAdmin,
	pendingToolCount,
	permissions,
}: WorkspaceShellState): NavGroup[] {
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

	const groups: NavGroup[] = [
		{
			label: "Work",
			items: [...workNavItems, ...(pendingToolCount > 0 ? [approvalsItem] : [])],
		},
		{ label: "Resources", items: resourceNavItems },
		{
			label: "Configuration",
			items: [
				...(pendingToolCount > 0 ? [] : [approvalsItem]),
				...configurationNavItems,
			],
		},
		{
			label: "Governance",
			items: [...governanceItems, ...teamItems],
		},
	];

	return groups.filter((group) => group.items.length > 0);
}

export function isNavItemActive(pathname: string, href: string): boolean {
	return pathname === href || pathname.startsWith(`${href}/`);
}

export type RouteBreadcrumb = {
	label: string;
	href?: string;
};

export function getRouteBreadcrumbs(pathname: string): RouteBreadcrumb[] | undefined {
	const agentMatch = pathname.match(/^\/agents\/([^/]+)$/);
	if (agentMatch) {
		return [
			{ label: "Assistants", href: "/agents" },
			{ label: "Configuration" },
		];
	}
	return undefined;
}
