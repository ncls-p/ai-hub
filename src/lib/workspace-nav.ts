import {
	ActivityIcon,
	BookOpenIcon,
	BotIcon,
	KeyRoundIcon,
	MessageSquareIcon,
	PlugZapIcon,
	ScrollTextIcon,
	SettingsIcon,
	SparklesIcon,
	StoreIcon,
	UsersIcon,
	WrenchIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
	href: string;
	labelKey: string;
	icon: LucideIcon;
	badge?: number;
};

export type NavGroup = {
	labelKey: string;
	items: NavItem[];
};

export type WorkspacePermissions = {
	canViewUsage: boolean;
	canViewAudit: boolean;
};

export type WorkspaceShellState = {
	displayName?: string;
	currentUserId?: string;
	isAdmin?: boolean;
	pendingToolCount: number;
	permissions: WorkspacePermissions;
};

export const primaryNavItems: NavItem[] = [
	{ href: "/chat", labelKey: "chat", icon: MessageSquareIcon },
	{ href: "/agents", labelKey: "assistants", icon: BotIcon },
	{ href: "/knowledge", labelKey: "knowledge", icon: BookOpenIcon },
];

export const capabilitiesNavItems: NavItem[] = [
	{ href: "/tools", labelKey: "toolsHub", icon: WrenchIcon },
];

export const advancedCapabilityNavItems: NavItem[] = [
	{ href: "/custom-tools", labelKey: "customTools", icon: SparklesIcon },
	{ href: "/marketplace", labelKey: "marketplace", icon: StoreIcon },
];

export const configNavItems: NavItem[] = [
	{ href: "/providers", labelKey: "aiConnections", icon: PlugZapIcon },
	{ href: "/api-keys", labelKey: "apiKeys", icon: KeyRoundIcon },
];

export const adminNavItems: NavItem[] = [
	{ href: "/usage", labelKey: "usage", icon: ActivityIcon },
	{ href: "/audit", labelKey: "activityLog", icon: ScrollTextIcon },
	{ href: "/members", labelKey: "team", icon: UsersIcon },
];

export const routeTitleKeys: Record<string, string> = {
	"/chat": "chat",
	"/agents": "assistants",
	"/providers": "aiConnections",
	"/knowledge": "knowledge",
	"/tools": "toolsHub",
	"/custom-tools": "customTools",
	"/marketplace": "marketplace",
	"/api-keys": "apiKeys",
	"/usage": "usage",
	"/audit": "activityLog",
	"/members": "team",
	"/settings": "settings",
	"/setup": "setup",
};

export function getRouteTitleKey(pathname: string): string {
	if (/^\/agents\/[^/]+$/.test(pathname)) {
		return "assistantConfig";
	}
	const match = Object.entries(routeTitleKeys)
		.sort((a, b) => b[0].length - a[0].length)
		.find(([href]) => pathname === href || pathname.startsWith(`${href}/`));
	return match?.[1] ?? "workspace";
}

export function buildMenuGroups({
	isAdmin,
	pendingToolCount,
	permissions,
}: WorkspaceShellState): NavGroup[] {
	const toolsItem: NavItem = {
		href: "/tools",
		labelKey: "toolsHub",
		icon: WrenchIcon,
		badge: pendingToolCount > 0 ? pendingToolCount : undefined,
	};

	const adminItems = adminNavItems.filter((item) => {
		if (item.href === "/usage") return permissions.canViewUsage;
		if (item.href === "/audit") return permissions.canViewAudit;
		return true;
	});

	const capabilities = capabilitiesNavItems.map((item) =>
		item.href === "/tools" ? toolsItem : item,
	);

	const groups: NavGroup[] = [
		{ labelKey: "primary", items: [...primaryNavItems, ...capabilities] },
		{
			labelKey: "advanced",
			items: [
				...advancedCapabilityNavItems,
				...configNavItems,
				...adminItems,
				...(isAdmin
					? [{ href: "/settings", labelKey: "settings", icon: SettingsIcon }]
					: []),
			],
		},
	];

	return groups.filter((group) => group.items.length > 0);
}

export function isNavItemActive(pathname: string, href: string): boolean {
	if (href === "/tools") {
		return (
			pathname === "/tools" ||
			pathname.startsWith("/tools/") ||
			pathname === "/mcp" ||
			pathname.startsWith("/mcp/")
		);
	}
	return pathname === href || pathname.startsWith(`${href}/`);
}

export type RouteBreadcrumb = {
	labelKey: string;
	href?: string;
};

export function getRouteBreadcrumbs(
	pathname: string,
): RouteBreadcrumb[] | undefined {
	const agentMatch = pathname.match(/^\/agents\/([^/]+)$/);
	if (agentMatch) {
		return [
			{ labelKey: "assistants", href: "/agents" },
			{ labelKey: "assistantConfig" },
		];
	}
	return undefined;
}
