"use client";

import { Link } from "@/i18n/navigation";
import {
	ArrowLeftIcon,
	CheckCircle2Icon,
	ClockIcon,
	MessageCircleIcon,
	MoreHorizontalIcon,
	Trash2Icon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { MetricCell } from "./shared";
import type { Agent, Model, Provider } from "./types";

export function AgentHeader({
	agent,
	providers,
	models,
	form,
	totalEnabledTools,
	enabledMcpCount,
	selectedKnowledgeIds,
	onShowDeleteDialogAction: onShowDeleteDialog,
}: {
	agent: Agent | null;
	providers: Provider[];
	models: Model[];
	form: { providerId: string; modelId: string; name: string };
	totalEnabledTools: number;
	enabledMcpCount: number;
	selectedKnowledgeIds: string[];
	onShowDeleteDialogAction: () => void;
}) {
	const t = useTranslations("agents");
	const selectedProvider = providers.find((p) => p.id === form.providerId);
	const selectedModel = models.find((m) => m.id === form.modelId);
	const hasModel = Boolean(form.providerId && form.modelId);

	return (
		<div className="rounded-2xl border bg-card p-5 sm:p-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
				<div className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-muted text-muted-foreground">
					<MessageCircleIcon className="size-6" aria-hidden="true" />
				</div>

				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="font-heading text-2xl font-semibold tracking-tight">
							{agent?.name ?? form.name}
						</h2>
						{hasModel ? (
							<Badge
								variant="outline"
								className="gap-1 border-success/30 bg-success/10 text-success"
							>
								<CheckCircle2Icon className="size-3" aria-hidden="true" />
								{t("statusReady")}
							</Badge>
						) : (
							<Badge variant="outline" className="gap-1">
								<ClockIcon className="size-3" aria-hidden="true" />
								{t("statusMissingModel")}
							</Badge>
						)}
					</div>
					{hasModel ? (
						<p className="mt-1 text-sm text-muted-foreground">
							{selectedProvider?.name}
							{selectedModel ? (
								<span className="ml-1 opacity-70">
									· {selectedModel.displayName || selectedModel.modelId}
								</span>
							) : null}
						</p>
					) : agent?.description ? (
						<p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
							{agent.description}
						</p>
					) : null}
				</div>

				<div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
					{hasModel && agent?.id ? (
						<Button asChild size="sm">
							<Link href={`/chat?agentId=${agent.id}`}>
								<MessageCircleIcon className="size-4" aria-hidden="true" />
								{t("chat")}
							</Link>
						</Button>
					) : null}
					<Button asChild variant="outline" size="sm">
						<Link href="/agents">
							<ArrowLeftIcon className="size-4" aria-hidden="true" />
							<span className="hidden sm:inline">
								{t("configurePage.back")}
							</span>
						</Link>
					</Button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon-sm" className="size-8">
								<MoreHorizontalIcon className="size-4" aria-hidden="true" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								className="text-destructive focus:text-destructive"
								onClick={onShowDeleteDialog}
							>
								<Trash2Icon className="size-4" aria-hidden="true" />
								{t("configurePage.delete")}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			<div className="mt-5 grid grid-cols-3 gap-x-6 gap-y-3 border-t border-border pt-5">
				<MetricCell label={t("tabs.tools")} value={totalEnabledTools} />
				<MetricCell
					label={t("tabs.knowledge")}
					value={selectedKnowledgeIds.length}
				/>
				<MetricCell label="MCP" value={enabledMcpCount} />
			</div>
		</div>
	);
}
