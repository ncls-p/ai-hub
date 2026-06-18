import {
	ActivityIcon,
	BookOpenIcon,
	CalendarClockIcon,
	CodeIcon,
	KeyRoundIcon,
	MessageSquareIcon,
	PlugZapIcon,
	ScrollTextIcon,
	SettingsIcon,
	StoreIcon,
	UsersIcon,
	WorkflowIcon,
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
	canViewProviders: boolean;
	canManageProviders: boolean;
	canConfigureTools: boolean;
	canViewTools: boolean;
	canGetMcpServers: boolean;
	canManageKnowledgeBases: boolean;
	canCreateAgent: boolean;
	canManageApiKeys: boolean;
	canManageWorkspace: boolean;
};

export const DEFAULT_WORKSPACE_PERMISSIONS: WorkspacePermissions = {
	canViewUsage: false,
	canViewAudit: false,
	canViewProviders: false,
	canManageProviders: false,
	canConfigureTools: false,
	canViewTools: false,
	canGetMcpServers: false,
	canManageKnowledgeBases: false,
	canCreateAgent: false,
	canManageApiKeys: false,
	canManageWorkspace: false,
};

export type WorkspaceShellState = {
	displayName?: string;
	currentUserId?: string;
	isAdmin?: boolean;
	pendingToolCount: number;
	permissions: WorkspacePermissions;
	sidebarNavConfig?: {
		items: Array<{
			id: string;
			visible: boolean;
			section?: "primary" | "planning" | "advanced";
		}>;
	};
};

export const primaryNavItems: NavItem[] = [
	{ href: "/chat", labelKey: "chat", icon: MessageSquareIcon },
	{ href: "/agents", labelKey: "assistants", icon: WorkflowIcon },
	{ href: "/knowledge", labelKey: "knowledge", icon: BookOpenIcon },
];

export const planningNavItems: NavItem[] = [
	{
		href: "/scheduled-tasks",
		labelKey: "scheduledTasks",
		icon: CalendarClockIcon,
	},
];

export const capabilitiesNavItems: NavItem[] = [
	{ href: "/tools", labelKey: "toolsHub", icon: WrenchIcon },
];

export const advancedCapabilityNavItems: NavItem[] = [
	{ href: "/custom-tools", labelKey: "customTools", icon: CodeIcon },
	{ href: "/marketplace", labelKey: "marketplace", icon: StoreIcon },
];

export const configNavItems: NavItem[] = [
	{ href: "/providers", labelKey: "aiConnections", icon: PlugZapIcon },
	{ href: "/api-keys", labelKey: "apiKeys", icon: KeyRoundIcon },
	{ href: "/settings", labelKey: "settings", icon: SettingsIcon },
];

export const adminNavItems: NavItem[] = [
	{ href: "/usage", labelKey: "usage", icon: ActivityIcon },
	{ href: "/audit", labelKey: "activityLog", icon: ScrollTextIcon },
	{ href: "/members", labelKey: "team", icon: UsersIcon },
	{ href: "/admin/settings", labelKey: "adminSettings", icon: SettingsIcon },
];

export const routeTitleKeys: Record<string, string> = {
	"/chat": "chat",
	"/agents": "assistants",
	"/scheduled-tasks": "scheduledTasks",
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
	"/admin/settings": "adminSettings",
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
