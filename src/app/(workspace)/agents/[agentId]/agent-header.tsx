import Link from "next/link";
import {
	ArrowLeftIcon,
	BrainIcon,
	MessageCircleIcon,
	MoreHorizontalIcon,
	ServerIcon,
	SlidersIcon,
	SparklesIcon,
	Trash2Icon,
	ZapIcon,
	AlertCircleIcon,
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
import { getAvatarColor, getInitials, getProviderKindIcon } from "./utils";
import { StatCard } from "./shared";

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

	const avatarColor = agent
		? getAvatarColor(agent.name)
		: "from-violet-500 to-indigo-600";
	const initials = agent ? getInitials(agent.name) : "?";

	return (
		<div className="rounded-2xl border border-border/60 bg-gradient-to-br from-muted/40 to-muted/20 p-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
				{/* Avatar */}
				<div
					className={cn(
						"flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg",
						avatarColor,
					)}
				>
					<span className="text-xl font-bold">{initials}</span>
				</div>

				{/* Name + badges */}
				<div className="flex-1 min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="text-2xl font-semibold tracking-tight">
							{agent?.name ?? "Assistant"}
						</h2>
						{hasModel ? (
							<Badge className="gap-1 bg-emerald-500/15 text-emerald-600">
								<SparklesIcon className="size-3" aria-hidden="true" />
								{selectedProvider ? selectedProvider.name : "Model bound"}
								{selectedModel && (
									<span className="ml-1 opacity-70">
										· {selectedModel.displayName || selectedModel.modelId}
									</span>
								)}
							</Badge>
						) : (
							<Badge variant="outline" className="gap-1">
								<AlertCircleIcon className="size-3" aria-hidden="true" />
								No model
							</Badge>
						)}
						{agent?.sharingMode === "marketplace" && (
							<Badge variant="secondary">Workspace</Badge>
						)}
						{agent?.sharingMode === "specific_user" && (
							<Badge variant="secondary">Shared</Badge>
						)}
					</div>
					{agent?.description && (
						<p className="mt-1 text-sm text-muted-foreground line-clamp-1">
							{agent.description}
						</p>
					)}
				</div>

				{/* Quick Stats */}
				<div className="flex gap-3 sm:gap-4">
					<StatCard
						icon={SlidersIcon}
						value={totalEnabledTools}
						label="Tools"
					/>
					<StatCard
						icon={BrainIcon}
						value={selectedKnowledgeIds.length}
						label="Knowledge"
					/>
					<StatCard icon={ZapIcon} value={enabledMcpCount} label="MCP" />
				</div>
			</div>
		</div>
	);
}

export function PageActions({
	agentId,
	onShowDeleteDialog,
}: {
	agentId: string;
	onShowDeleteDialog: () => void;
}) {
	return (
		<div className="flex items-center gap-2">
			<Button asChild variant="outline" size="sm">
				<Link href={`/chat?agentId=${agentId}`}>
					<MessageCircleIcon className="size-4" aria-hidden="true" />
					<span className="hidden sm:inline">Chat now</span>
				</Link>
			</Button>
			<Button asChild variant="outline" size="sm">
				<Link href="/agents">
					<ArrowLeftIcon className="size-4" aria-hidden="true" />
					<span className="hidden sm:inline">All assistants</span>
				</Link>
			</Button>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon" className="h-8 w-8">
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
	);
}
