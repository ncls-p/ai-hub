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

export const primaryNavItems: NavItem[] = [
	{ href: "/chat", label: "Chat", icon: MessageSquareIcon },
	{ href: "/agents", label: "Assistants", icon: BotIcon },
];

export const capabilitiesNavItems: NavItem[] = [
	{ href: "/knowledge", label: "Knowledge", icon: BookOpenIcon },
	{ href: "/tools", label: "Tools", icon: WrenchIcon },
	{ href: "/mcp", label: "MCP", icon: ServerIcon },
	{ href: "/marketplace", label: "Marketplace", icon: StoreIcon },
];

export const configNavItems: NavItem[] = [
	{ href: "/providers", label: "Providers", icon: PlugZapIcon },
	{ href: "/api-keys", label: "API Keys", icon: KeyRoundIcon },
];

export const adminNavItems: NavItem[] = [
	{ href: "/usage", label: "Usage", icon: ActivityIcon },
	{ href: "/audit", label: "Audit Log", icon: ScrollTextIcon },
	{ href: "/members", label: "Team", icon: UsersIcon },
];

export const routeTitles: Record<string, string> = {
	"/chat": "Chat",
	"/agents": "Assistants",
	"/providers": "Providers",
	"/knowledge": "Knowledge",
	"/mcp": "MCP",
	"/tools": "Tools",
	"/marketplace": "Marketplace",
	"/api-keys": "API Keys",
	"/usage": "Usage",
	"/audit": "Audit Log",
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
			.find(
				([href]) => pathname === href || pathname.startsWith(`${href}/`),
			)?.[1] ?? "Workspace"
	);
}

export function buildMenuGroups({
	isAdmin,
	pendingToolCount,
	permissions,
}: WorkspaceShellState): NavGroup[] {
	const toolsItem: NavItem = {
		href: "/tools",
		label: "Tools",
		icon: WrenchIcon,
		badge: pendingToolCount > 0 ? pendingToolCount : undefined,
	};

	const adminItems = adminNavItems.filter((item) => {
		if (item.href === "/usage") return permissions.canViewUsage;
		if (item.href === "/audit") return permissions.canViewAudit;
		return true;
	});

	const groups: NavGroup[] = [
		{ label: "Workspace", items: primaryNavItems },
		{ label: "Capabilities", items: [...capabilitiesNavItems] },
		{ label: "Configuration", items: configNavItems },
		{
			label: "Administration",
			items: [
				...adminItems,
				...(isAdmin
					? [{ href: "/settings", label: "Settings", icon: SettingsIcon }]
					: []),
			],
		},
	];

	// Inject approvals badge into Tools item
	const capsGroup = groups.find((g) => g.label === "Capabilities");
	if (capsGroup) {
		const toolsIdx = capsGroup.items.findIndex((i) => i.href === "/tools");
		if (toolsIdx >= 0) {
			capsGroup.items[toolsIdx] = toolsItem;
		}
	}

	return groups.filter((group) => group.items.length > 0);
}

export function isNavItemActive(pathname: string, href: string): boolean {
	return pathname === href || pathname.startsWith(`${href}/`);
}

export type RouteBreadcrumb = {
	label: string;
	href?: string;
};

export function getRouteBreadcrumbs(
	pathname: string,
): RouteBreadcrumb[] | undefined {
	const agentMatch = pathname.match(/^\/agents\/([^/]+)$/);
	if (agentMatch) {
		return [
			{ label: "Assistants", href: "/agents" },
			{ label: "Configuration" },
		];
	}
	return undefined;
}
