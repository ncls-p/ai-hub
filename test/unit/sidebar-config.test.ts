import { MessageSquareIcon } from "lucide-react";
import { describe, expect, it } from "vitest";

import {
	applySidebarNavConfig,
	buildSidebarMenuGroups,
	defaultSidebarNavConfig,
	getDefaultSectionForNavId,
	normalizeSidebarNavConfig,
} from "@/modules/navigation/sidebar-config";
import type { NavItem } from "@/lib/workspace-nav";

const sampleItems: NavItem[] = [
	{ href: "/chat", labelKey: "chat", icon: MessageSquareIcon },
	{ href: "/agents", labelKey: "assistants", icon: MessageSquareIcon },
	{ href: "/settings", labelKey: "settings", icon: MessageSquareIcon },
];

describe("normalizeSidebarNavConfig", () => {
	it("appends missing default items", () => {
		const normalized = normalizeSidebarNavConfig({
			items: [
				{ id: "/chat", visible: true },
				{ id: "/agents", visible: false },
			],
		});
		expect(normalized.items[0]).toEqual({
			id: "/chat",
			visible: true,
			section: "primary",
		});
		expect(normalized.items[1]).toEqual({
			id: "/agents",
			visible: false,
			section: "primary",
		});
		expect(normalized.items.some((item) => item.id === "/tools")).toBe(true);
	});
});

describe("applySidebarNavConfig", () => {
	it("reorders and hides items", () => {
		const config = {
			items: [
				{ id: "/settings", visible: true },
				{ id: "/chat", visible: true },
				{ id: "/agents", visible: false },
			],
		};
		const result = applySidebarNavConfig(sampleItems, config);
		expect(result.map((item) => item.href)).toEqual(["/settings", "/chat"]);
	});

	it("falls back to default order when config matches defaults", () => {
		const result = applySidebarNavConfig(
			sampleItems,
			defaultSidebarNavConfig(),
		);
		expect(result.map((item) => item.href)).toEqual([
			"/chat",
			"/agents",
			"/settings",
		]);
	});
});

describe("buildSidebarMenuGroups", () => {
	it("keeps primary and advanced sections when using custom config", () => {
		const config = normalizeSidebarNavConfig({
			items: [
				{ id: "/settings", visible: true },
				{ id: "/chat", visible: true },
				{ id: "/marketplace", visible: true },
				{ id: "/agents", visible: true },
			],
		});
		const groups = buildSidebarMenuGroups(
			{
				pendingToolCount: 0,
				permissions: { canViewUsage: true, canViewAudit: true },
				isAdmin: true,
				sidebarNavConfig: config,
			},
			config,
		);

		expect(groups.map((group) => group.labelKey)).toEqual(["primary", "advanced"]);
		expect(groups[0]?.items[0]?.href).toBe("/chat");
		expect(groups[1]?.items[0]?.href).toBe("/settings");
		expect(groups[1]?.items[1]?.href).toBe("/marketplace");
	});

	it("respects custom section assignments from admin config", () => {
		const config = normalizeSidebarNavConfig({
			items: [
				{ id: "/chat", visible: true, section: "advanced" },
				{ id: "/settings", visible: true, section: "primary" },
			],
		});
		const groups = buildSidebarMenuGroups(
			{
				pendingToolCount: 0,
				permissions: { canViewUsage: true, canViewAudit: true },
				isAdmin: true,
				sidebarNavConfig: config,
			},
			config,
		);

		expect(groups.find((group) => group.labelKey === "primary")?.items).toEqual(
			expect.arrayContaining([expect.objectContaining({ href: "/settings" })]),
		);
		expect(
			groups.find((group) => group.labelKey === "advanced")?.items,
		).toEqual(
			expect.arrayContaining([expect.objectContaining({ href: "/chat" })]),
		);
	});
});

describe("getDefaultSectionForNavId", () => {
	it("maps legacy defaults", () => {
		expect(getDefaultSectionForNavId("/chat")).toBe("primary");
		expect(getDefaultSectionForNavId("/marketplace")).toBe("advanced");
	});
});
