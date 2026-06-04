import Link from "next/link";
import {
	ArrowLeftIcon,
	BotIcon,
	ClockIcon,
	MessageCircleIcon,
	MoreHorizontalIcon,
	SparklesIcon,
	Trash2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import type { Agent, Model, Provider } from "./types";
import { getAgentAccent } from "./utils";
import { MetricCell } from "./shared";

export function AgentHeader({
	agent,
	providers,
	models,
	form,
	totalEnabledTools,
	enabledMcpCount,
	selectedKnowledgeIds,
	onShowDeleteDialog,
}: {
	agent: Agent | null;
	providers: Provider[];
	models: Model[];
	form: { providerId: string; modelId: string; name: string };
	totalEnabledTools: number;
	enabledMcpCount: number;
	selectedKnowledgeIds: string[];
	onShowDeleteDialog: () => void;
}) {
	const selectedProvider = providers.find((p) => p.id === form.providerId);
	const selectedModel = models.find((m) => m.id === form.modelId);
	const hasModel = Boolean(form.providerId && form.modelId);
	const accent = agent ? getAgentAccent(agent.name) : getAgentAccent("?");

	return (
		<div className="glass-card p-5 sm:p-6 animate-in-scale stagger-1">
			<div className="section-kicker mb-2">Assistant</div>
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
				{/* Accent icon */}
				<div
					className={cn(
						"flex size-12 shrink-0 items-center justify-center rounded-xl",
						accent.iconBg,
						accent.text,
					)}
				>
					<BotIcon className="size-6" aria-hidden="true" />
				</div>

				{/* Name + badges */}
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="font-heading text-2xl font-semibold tracking-tight">
							{agent?.name ?? "Assistant"}
						</h2>
						{hasModel ? (
							<Badge className="gap-1 bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25">
								<SparklesIcon className="size-3" aria-hidden="true" />
								Ready
							</Badge>
						) : (
							<Badge variant="outline" className="gap-1">
								<ClockIcon className="size-3" aria-hidden="true" />
								Needs setup
							</Badge>
						)}
						{agent?.sharingMode === "marketplace" && (
							<Badge variant="secondary">Workspace</Badge>
						)}
						{agent?.sharingMode === "specific_user" && (
							<Badge variant="secondary">Shared</Badge>
						)}
					</div>
					{hasModel && (
						<p className="mt-1 text-sm text-muted-foreground">
							{selectedProvider?.name}
							{selectedModel && (
								<span className="ml-1 opacity-70">
									· {selectedModel.displayName || selectedModel.modelId}
								</span>
							)}
						</p>
					)}
					{agent?.description && !hasModel && (
						<p className="mt-1 text-sm text-muted-foreground line-clamp-1">
							{agent.description}
						</p>
					)}
				</div>

				{/* Actions */}
				<div className="flex items-center gap-2 sm:flex-col sm:items-end">
					<div className="flex items-center gap-2">
						{hasModel && (
							<Button asChild size="sm" className="shimmer">
								<Link href={`/chat?agentId=${agent?.id ?? "#"}`}>
									<MessageCircleIcon className="size-4" aria-hidden="true" />
									<span className="hidden sm:inline">Chat now</span>
								</Link>
							</Button>
						)}
						<Button asChild variant="outline" size="sm">
							<Link href="/agents">
								<ArrowLeftIcon className="size-4" aria-hidden="true" />
								<span className="hidden sm:inline">All assistants</span>
							</Link>
						</Button>
					</div>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon-sm" className="h-7 w-7">
								<MoreHorizontalIcon className="size-4" aria-hidden="true" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								className="text-destructive focus:text-destructive"
								onClick={onShowDeleteDialog}
							>
								<Trash2Icon className="size-4" aria-hidden="true" />
								Delete assistant
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			{/* Stats strip */}
			<div className="mt-5 grid grid-cols-3 gap-x-6 gap-y-3">
				<MetricCell label="Tools" value={totalEnabledTools} />
				<MetricCell label="Knowledge" value={selectedKnowledgeIds.length} />
				<MetricCell label="MCP" value={enabledMcpCount} />
			</div>
		</div>
	);
}
