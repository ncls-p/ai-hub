"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ServerIcon, ShieldIcon, WrenchIcon } from "lucide-react";

import { McpServerManager } from "@/components/mcp/mcp-server-manager";
import { Badge } from "@/components/ui/badge";
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
					<TabsTrigger value="approvals" className="gap-1.5">
						<ShieldIcon className="size-3.5" aria-hidden="true" />
						{t("tabs.approvals")}
					</TabsTrigger>
				</TabsList>

				<TabsContent value="builtin" className="mt-6 space-y-4">
					<div className="rounded-2xl border border-border/70 bg-card/75 p-4 shadow-sm">
						<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
							<div>
								<p className="text-sm font-medium">Native tools</p>
								<p className="mt-1 text-sm text-muted-foreground">
									{t("builtinHelp")}
								</p>
							</div>
							<Badge variant="secondary" className="w-fit rounded-full">
								{builtinTools.length} available
							</Badge>
						</div>
					</div>
					<ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
						{builtinTools.map((tool) => (
							<li
								key={tool.id}
								className="rounded-2xl border border-border/60 bg-background/70 p-3 transition-colors hover:border-primary/30 hover:bg-muted/25"
							>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<div className="flex flex-wrap items-center gap-1.5">
											<p className="truncate text-sm font-medium">
												{tool.displayName}
											</p>
											<Badge variant="outline" className="text-[10px]">
												{tool.category}
											</Badge>
										</div>
										<p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
											{tool.description}
										</p>
									</div>
									<Badge
										variant={
											tool.riskLevel === "high"
												? "destructive"
												: tool.riskLevel === "medium"
													? "secondary"
													: "outline"
										}
										className="shrink-0 text-[10px]"
									>
										{tool.riskLevel}
									</Badge>
								</div>
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
