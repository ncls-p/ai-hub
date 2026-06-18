"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import {
	BookMarkedIcon,
	ServerIcon,
	ShieldIcon,
	WrenchIcon,
} from "lucide-react";

import { McpServerManager } from "@/components/mcp/mcp-server-manager";
import { SkillManager } from "@/components/skills/skill-manager";
import { WorkspacePage } from "@/components/workspace-page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/hooks/use-workspace";
import { useRouter } from "@/i18n/navigation";
import { fetchWorkspacePermissions } from "@/lib/api-client";
import {
	DEFAULT_WORKSPACE_PERMISSIONS,
	type WorkspacePermissions,
} from "@/lib/workspace-nav";

import { ToolApprovalsPanel } from "./approvals-panel";
import { BuiltinToolsPanel } from "./builtin-tools-panel";

export function ToolsHub() {
	const t = useTranslations("tools");
	const router = useRouter();
	const searchParams = useSearchParams();
	const { workspaceId } = useWorkspace();
	const [permissions, setPermissions] = useState<WorkspacePermissions>(
		DEFAULT_WORKSPACE_PERMISSIONS,
	);
	const allowedTabs = useMemo(() => {
		const tabs = [] as Array<"builtin" | "mcp" | "skills" | "approvals">;
		if (permissions.canViewTools || permissions.canConfigureTools) {
			tabs.push("builtin");
		}
		if (permissions.canGetMcpServers) tabs.push("mcp");
		if (permissions.canConfigureTools) tabs.push("skills");
		if (permissions.canViewTools || permissions.canConfigureTools) {
			tabs.push("approvals");
		}
		return tabs;
	}, [permissions]);
	const requestedTab = searchParams.get("tab") ?? "builtin";
	const tab = allowedTabs.includes(requestedTab as (typeof allowedTabs)[number])
		? requestedTab
		: (allowedTabs[0] ?? "builtin");

	useEffect(() => {
		if (!workspaceId) return;
		let cancelled = false;
		void fetchWorkspacePermissions(workspaceId)
			.then((nextPermissions) => {
				if (!cancelled) setPermissions(nextPermissions);
			})
			.catch(() => {
				if (!cancelled) setPermissions(DEFAULT_WORKSPACE_PERMISSIONS);
			});
		return () => {
			cancelled = true;
		};
	}, [workspaceId]);

	function setTab(value: string) {
		router.replace(`/tools?tab=${value}`);
	}

	return (
		<WorkspacePage
			title={t("title")}
			description={t("description")}
			width="wide"
		>
			<Tabs value={tab} onValueChange={setTab}>
				<TabsList className="w-full flex-wrap sm:w-auto">
					{allowedTabs.includes("builtin") ? (
						<TabsTrigger value="builtin" className="gap-1.5">
							<WrenchIcon className="size-3.5" aria-hidden="true" />
							{t("tabs.builtin")}
						</TabsTrigger>
					) : null}
					{allowedTabs.includes("mcp") ? (
						<TabsTrigger value="mcp" className="gap-1.5">
							<ServerIcon className="size-3.5" aria-hidden="true" />
							{t("tabs.mcp")}
						</TabsTrigger>
					) : null}
					{allowedTabs.includes("skills") ? (
						<TabsTrigger value="skills" className="gap-1.5">
							<BookMarkedIcon className="size-3.5" aria-hidden="true" />
							{t("tabs.skills")}
						</TabsTrigger>
					) : null}
					{allowedTabs.includes("approvals") ? (
						<TabsTrigger value="approvals" className="gap-1.5">
							<ShieldIcon className="size-3.5" aria-hidden="true" />
							{t("tabs.approvals")}
						</TabsTrigger>
					) : null}
				</TabsList>

				{allowedTabs.includes("builtin") ? (
					<TabsContent value="builtin" className="mt-6">
						<BuiltinToolsPanel />
					</TabsContent>
				) : null}

				{allowedTabs.includes("mcp") ? (
					<TabsContent value="mcp" className="mt-6 space-y-4">
						<p className="text-sm text-muted-foreground">{t("mcpHelp")}</p>
						<McpServerManager />
					</TabsContent>
				) : null}

				{allowedTabs.includes("skills") ? (
					<TabsContent value="skills" className="mt-6 space-y-4">
						<p className="text-sm text-muted-foreground">{t("skillsHelp")}</p>
						<SkillManager />
					</TabsContent>
				) : null}

				{allowedTabs.includes("approvals") ? (
					<TabsContent value="approvals" className="mt-6 space-y-4">
						<p className="text-sm text-muted-foreground">
							{t("approvalsHelp")}
						</p>
						<ToolApprovalsPanel />
					</TabsContent>
				) : null}
			</Tabs>
		</WorkspacePage>
	);
}
