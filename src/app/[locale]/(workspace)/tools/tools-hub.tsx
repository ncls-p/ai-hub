"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { useRouter } from "@/i18n/navigation";

import { ToolApprovalsPanel } from "./approvals-panel";
import { BuiltinToolsPanel } from "./builtin-tools-panel";

export function ToolsHub() {
	const t = useTranslations("tools");
	const router = useRouter();
	const searchParams = useSearchParams();
	const tab = searchParams.get("tab") ?? "builtin";

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
					<TabsTrigger value="builtin" className="gap-1.5">
						<WrenchIcon className="size-3.5" aria-hidden="true" />
						{t("tabs.builtin")}
					</TabsTrigger>
					<TabsTrigger value="mcp" className="gap-1.5">
						<ServerIcon className="size-3.5" aria-hidden="true" />
						{t("tabs.mcp")}
					</TabsTrigger>
					<TabsTrigger value="skills" className="gap-1.5">
						<BookMarkedIcon className="size-3.5" aria-hidden="true" />
						{t("tabs.skills")}
					</TabsTrigger>
					<TabsTrigger value="approvals" className="gap-1.5">
						<ShieldIcon className="size-3.5" aria-hidden="true" />
						{t("tabs.approvals")}
					</TabsTrigger>
				</TabsList>

				<TabsContent value="builtin" className="mt-6">
					<BuiltinToolsPanel />
				</TabsContent>

				<TabsContent value="mcp" className="mt-6 space-y-4">
					<p className="text-sm text-muted-foreground">{t("mcpHelp")}</p>
					<McpServerManager />
				</TabsContent>

				<TabsContent value="skills" className="mt-6 space-y-4">
					<p className="text-sm text-muted-foreground">{t("skillsHelp")}</p>
					<SkillManager />
				</TabsContent>

				<TabsContent value="approvals" className="mt-6 space-y-4">
					<p className="text-sm text-muted-foreground">{t("approvalsHelp")}</p>
					<ToolApprovalsPanel />
				</TabsContent>
			</Tabs>
		</WorkspacePage>
	);
}
