"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ServerIcon, ShieldIcon, WrenchIcon } from "lucide-react";

import { McpServerManager } from "@/components/mcp/mcp-server-manager";
import { WorkspacePage } from "@/components/workspace-page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from "@/i18n/navigation";
import { listBuiltInToolSummaries } from "@/modules/tool/builtin-tools-catalog";

import { ToolApprovalsPanel } from "./approvals-panel";

const builtinTools = listBuiltInToolSummaries();

export function ToolsHub() {
	const t = useTranslations("tools");
	const router = useRouter();
	const searchParams = useSearchParams();
	const tab = searchParams.get("tab") ?? "approvals";

	function setTab(value: string) {
		router.replace(`/tools?tab=${value}`);
	}

	return (
		<WorkspacePage title={t("title")} description={t("description")} width="wide">
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
					<TabsTrigger value="approvals" className="gap-1.5">
						<ShieldIcon className="size-3.5" aria-hidden="true" />
						{t("tabs.approvals")}
					</TabsTrigger>
				</TabsList>

				<TabsContent value="builtin" className="mt-6 space-y-4">
					<p className="text-sm text-muted-foreground">{t("builtinHelp")}</p>
					<ul className="grid gap-3 sm:grid-cols-2">
						{builtinTools.map((tool) => (
							<li
								key={tool.id}
								className="rounded-xl border border-border/60 bg-background/60 p-4"
							>
								<p className="font-medium">{tool.displayName}</p>
								<p className="mt-1 text-sm text-muted-foreground">
									{tool.description}
								</p>
							</li>
						))}
					</ul>
				</TabsContent>

				<TabsContent value="mcp" className="mt-6 space-y-4">
					<p className="text-sm text-muted-foreground">{t("mcpHelp")}</p>
					<McpServerManager />
				</TabsContent>

				<TabsContent value="approvals" className="mt-6 space-y-4">
					<p className="text-sm text-muted-foreground">{t("approvalsHelp")}</p>
					<ToolApprovalsPanel />
				</TabsContent>
			</Tabs>
		</WorkspacePage>
	);
}
