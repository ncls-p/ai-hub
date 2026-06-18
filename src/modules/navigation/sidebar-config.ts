import { z } from "zod";

import {
	adminNavItems,
	advancedCapabilityNavItems,
	capabilitiesNavItems,
	configNavItems,
	planningNavItems,
	primaryNavItems,
	type NavGroup,
	type NavItem,
	type WorkspaceShellState,
} from "@/lib/workspace-nav";

export const DEFAULT_SIDEBAR_NAV_IDS = [
	"/chat",
	"/agents",
	"/knowledge",
	"/scheduled-tasks",
	"/tools",
	"/custom-tools",
	"/marketplace",
	"/providers",
	"/api-keys",
	"/settings",
	"/usage",
	"/audit",
	"/members",
	"/admin/settings",
] as const;

export type SidebarNavItemId = (typeof DEFAULT_SIDEBAR_NAV_IDS)[number];

export const SIDEBAR_NAV_SECTIONS = [
	"primary",
	"planning",
	"advanced",
] as const;
export type SidebarNavSection = (typeof SIDEBAR_NAV_SECTIONS)[number];

const sidebarNavItemSchema = z.object({
	id: z.string().min(1),
	visible: z.boolean(),
	section: z.enum(SIDEBAR_NAV_SECTIONS).optional(),
});

export const sidebarNavConfigSchema = z.object({
	items: z.array(sidebarNavItemSchema).min(1),
});

export type SidebarNavConfig = z.infer<typeof sidebarNavConfigSchema>;
export type SidebarNavConfigItem = SidebarNavConfig["items"][number];

const NAV_ITEM_TEMPLATES = new Map<string, Omit<NavItem, "badge">>();

function registerNavTemplates(items: Array<Omit<NavItem, "badge">>) {
	for (const item of items) {
		NAV_ITEM_TEMPLATES.set(item.href, item);
	}
}

registerNavTemplates(primaryNavItems);
registerNavTemplates(planningNavItems);
registerNavTemplates(capabilitiesNavItems);
registerNavTemplates(advancedCapabilityNavItems);
registerNavTemplates(configNavItems);
registerNavTemplates(adminNavItems);

const PRIMARY_SECTION_IDS = new Set<string>(
	primaryNavItems.map((item) => item.href),
);
const PLANNING_SECTION_IDS = new Set<string>(
	planningNavItems.map((item) => item.href),
);

export function getDefaultSectionForNavId(id: string): SidebarNavSection {
	if (PRIMARY_SECTION_IDS.has(id)) return "primary";
	if (PLANNING_SECTION_IDS.has(id)) return "planning";
	return "advanced";
}

function resolveNavItemSection(
	id: string,
	section: SidebarNavSection | undefined,
): SidebarNavSection {
	return section ?? getDefaultSectionForNavId(id);
}

function splitNavItemsBySection(items: NavItem[], config: SidebarNavConfig) {
	const sectionById = new Map(
		config.items.map((entry) => [
			entry.id,
			resolveNavItemSection(entry.id, entry.section),
		]),
	);
	const primaryItems: NavItem[] = [];
	const planningItems: NavItem[] = [];
	const advancedItems: NavItem[] = [];

	for (const item of items) {
		const section =
			sectionById.get(item.href) ?? getDefaultSectionForNavId(item.href);
		if (section === "primary") {
			primaryItems.push(item);
		} else if (section === "planning") {
			planningItems.push(item);
		} else {
			advancedItems.push(item);
		}
	}

	return { primaryItems, planningItems, advancedItems };
}

export function defaultSidebarNavConfig(): SidebarNavConfig {
	return {
		items: DEFAULT_SIDEBAR_NAV_IDS.map((id) => ({
			id,
			visible: true,
			section: getDefaultSectionForNavId(id),
		})),
	};
}

export function getSidebarNavCatalog() {
	return DEFAULT_SIDEBAR_NAV_IDS.map((id) => {
		const template = NAV_ITEM_TEMPLATES.get(id);
		return {
			id,
			labelKey: template?.labelKey ?? id,
			defaultSection: getDefaultSectionForNavId(id),
		};
	});
}

export function normalizeSidebarNavConfig(
	config: SidebarNavConfig,
): SidebarNavConfig {
	const knownIds = new Set<string>(DEFAULT_SIDEBAR_NAV_IDS);
	const seen = new Set<string>();
	const items: SidebarNavConfigItem[] = [];

	for (const item of config.items) {
		if (!knownIds.has(item.id) || seen.has(item.id)) continue;
		items.push({
			id: item.id,
			visible: item.visible,
			section: resolveNavItemSection(item.id, item.section),
		});
		seen.add(item.id);
	}

	for (const id of DEFAULT_SIDEBAR_NAV_IDS) {
		if (seen.has(id)) continue;
		items.push({
			id,
			visible: true,
			section: getDefaultSectionForNavId(id),
		});
	}

	return { items };
}

export function collectEligibleNavItems(shell: WorkspaceShellState): NavItem[] {
	const { permissions } = shell;
	const canUseToolsHub =
		permissions.canConfigureTools ||
		permissions.canViewTools ||
		permissions.canGetMcpServers;
	const toolsItem: NavItem = {
		href: "/tools",
		labelKey: "toolsHub",
		icon: NAV_ITEM_TEMPLATES.get("/tools")!.icon,
		badge: shell.pendingToolCount > 0 ? shell.pendingToolCount : undefined,
	};

	const adminItems = adminNavItems.filter((item) => {
		if (item.href === "/usage") return permissions.canViewUsage;
		if (item.href === "/audit") return permissions.canViewAudit;
		if (item.href === "/members") return shell.isAdmin;
		if (item.href === "/admin/settings") return shell.isAdmin;
		return true;
	});

	const items: NavItem[] = [];

	for (const id of DEFAULT_SIDEBAR_NAV_IDS) {
		if (id === "/tools") {
			if (canUseToolsHub) items.push(toolsItem);
			continue;
		}

		if (id === "/providers" && !permissions.canManageProviders) continue;
		if (id === "/custom-tools" && !permissions.canConfigureTools) continue;
		if (id === "/api-keys" && !permissions.canManageApiKeys) continue;

		const template = NAV_ITEM_TEMPLATES.get(id);
		if (!template) continue;

		if (adminNavItems.some((item) => item.href === id)) {
			if (!adminItems.some((item) => item.href === id)) continue;
		}

		items.push({ ...template });
	}

	return items;
}

export function applySidebarNavConfig(
	eligibleItems: NavItem[],
	config: SidebarNavConfig,
): NavItem[] {
	const normalized = normalizeSidebarNavConfig(config);
	const eligibleByHref = new Map(
		eligibleItems.map((item) => [item.href, item]),
	);
	const visibilityById = new Map(
		normalized.items.map((entry) => [entry.id, entry.visible]),
	);
	const seen = new Set<string>();
	const ordered: NavItem[] = [];

	for (const entry of normalized.items) {
		if (!entry.visible) continue;
		const item = eligibleByHref.get(entry.id);
		if (!item) continue;
		ordered.push(item);
		seen.add(entry.id);
	}

	for (const item of eligibleItems) {
		if (seen.has(item.href)) continue;
		if (visibilityById.get(item.href) === false) continue;
		ordered.push(item);
	}

	return ordered;
}

export function buildSidebarMenuGroups(
	shell: WorkspaceShellState,
	config: SidebarNavConfig,
): NavGroup[] {
	const eligibleItems = collectEligibleNavItems(shell);
	const items = applySidebarNavConfig(eligibleItems, config);
	const normalized = normalizeSidebarNavConfig(config);
	const { primaryItems, planningItems, advancedItems } = splitNavItemsBySection(
		items,
		normalized,
	);

	const groups: NavGroup[] = [];
	if (primaryItems.length > 0) {
		groups.push({ labelKey: "primary", items: primaryItems });
	}
	if (planningItems.length > 0) {
		groups.push({ labelKey: "planning", items: planningItems });
	}
	if (advancedItems.length > 0) {
		groups.push({ labelKey: "advanced", items: advancedItems });
	}
	return groups;
}

export function buildMenuGroups(shell: WorkspaceShellState): NavGroup[] {
	return buildSidebarMenuGroups(
		shell,
		shell.sidebarNavConfig ?? defaultSidebarNavConfig(),
	);
}
