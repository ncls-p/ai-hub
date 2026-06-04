"use client";

import { Link } from "@/i18n/navigation";
import {
	ChevronDownIcon,
	CheckIcon,
	MoreHorizontalIcon,
	MessageSquareIcon,
	PanelLeftCloseIcon,
	PanelLeftOpenIcon,
	PencilIcon,
	PlusIcon,
	SparklesIcon,
	Trash2Icon,
	XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import type { ChatAgent, ChatConversation } from "@/components/chat/chat-types";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ChatSidebarProps {
	agents: ChatAgent[];
	conversations: ChatConversation[];
	activeConversationId: string | null;
	loading?: boolean;
	onSelectConversation: (conversationId: string) => void;
	onNewConversation: () => void;
	onRenameConversation?: (conversationId: string, title: string) => void;
	onDeleteConversation?: (conversationId: string) => void;
	collapsed?: boolean;
	onCollapsedChange?: (collapsed: boolean) => void;
	className?: string;
	showThemeToggle?: boolean;
}

function formatRelativeTime(dateStr: string): string {
	const now = new Date();
	const date = new Date(dateStr);
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return "just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;
	return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ConversationItem({
	conversation,
	isActive,
	isEditing,
	editingTitle,
	agentName,
	onSelect,
	onRename,
	onDelete,
	onEditStart,
	onEditChange,
	onEditCancel,
}: {
	conversation: ChatConversation;
	isActive: boolean;
	isEditing: boolean;
	editingTitle: string;
	agentName: string;
	onSelect: () => void;
	onRename: (title: string) => void;
	onDelete: () => void;
	onEditStart: () => void;
	onEditChange: (title: string) => void;
	onEditCancel: () => void;
}) {
	return (
		<div
			className={cn(
				"group/conversation relative overflow-hidden rounded-md border transition-colors",
				isActive
					? "border-primary/20 bg-primary/[0.06]"
					: "border-transparent hover:border-border/40 hover:bg-muted/50",
			)}
		>
			{/* Active glow bar */}
			{isActive && (
				<div className="absolute left-0 top-1/2 h-3/5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary shadow-[0_0_6px_-1px_var(--primary)]" />
			)}

			{isEditing ? (
				<div className="flex min-w-0 flex-1 items-center gap-1 p-1 pl-2.5">
					<Input
						value={editingTitle}
						onChange={(event) => onEditChange(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								const nextTitle = editingTitle.trim();
								if (nextTitle) {
									onRename(nextTitle);
								}
							}
							if (event.key === "Escape") {
								onEditCancel();
							}
						}}
						className="h-6 min-w-0 rounded border-primary/30 bg-background/80 px-2 text-xs focus-visible:ring-primary/30"
						autoFocus
					/>
					<Button
						type="button"
						size="icon-sm"
						variant="ghost"
						aria-label="Save title"
						className="size-5 shrink-0 rounded text-primary hover:bg-primary/10 hover:text-primary"
						onClick={() => {
							const nextTitle = editingTitle.trim();
							if (!nextTitle) return;
							onRename(nextTitle);
						}}
					>
						<CheckIcon className="size-3" aria-hidden="true" />
					</Button>
					<Button
						type="button"
						size="icon-sm"
						variant="ghost"
						aria-label="Cancel title edit"
						className="size-5 shrink-0 rounded"
						onClick={onEditCancel}
					>
						<XIcon className="size-3" aria-hidden="true" />
					</Button>
				</div>
			) : (
				<div className="flex items-center gap-0.5 px-2.5 py-1.5">
					<button
						type="button"
						onClick={onSelect}
						className="min-w-0 flex-1 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40"
					>
						<span
							className={cn(
								"block truncate text-xs leading-tight transition-colors",
								isActive ? "font-semibold text-primary" : "font-medium",
							)}
						>
							{conversation.title}
						</span>
						<span className="mt-0.5 flex items-center gap-1 text-[11px] leading-none text-muted-foreground/50">
							<span className="truncate">{agentName}</span>
							<span className="shrink-0 text-muted-foreground/25">·</span>
							<span className="shrink-0">
								{formatRelativeTime(conversation.updatedAt)}
							</span>
						</span>
					</button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								type="button"
								size="icon-sm"
								variant="ghost"
								aria-label="Conversation actions"
								className={cn(
									"size-5 shrink-0 rounded opacity-0 transition-all hover:bg-muted/60 md:group-hover/conversation:opacity-100 data-[state=open]:opacity-100",
									isActive && "opacity-100",
								)}
							>
								<MoreHorizontalIcon className="size-3" aria-hidden="true" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuGroup>
								<DropdownMenuItem onSelect={onEditStart} className="gap-2">
									<PencilIcon className="size-3.5" aria-hidden="true" />
									Rename
								</DropdownMenuItem>
								<DropdownMenuItem
									variant="destructive"
									onSelect={onDelete}
									className="gap-2"
								>
									<Trash2Icon className="size-3.5" aria-hidden="true" />
									Delete
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			)}
		</div>
	);
}

export function ChatSidebar({
	agents,
	conversations,
	activeConversationId,
	loading,
	onSelectConversation,
	onNewConversation,
	onRenameConversation,
	onDeleteConversation,
	collapsed,
	onCollapsedChange,
	className,
	showThemeToggle,
}: ChatSidebarProps) {
	const [conversationsOpen, setConversationsOpen] = useState(true);
	const [editingConversationId, setEditingConversationId] = useState<
		string | null
	>(null);
	const [editingTitle, setEditingTitle] = useState("");
	const agentNameById = new Map(agents.map((agent) => [agent.id, agent.name]));

	useEffect(() => {
		const stored = window.localStorage.getItem("chat-conversations-open");
		if (stored) {
			queueMicrotask(() => setConversationsOpen(stored === "true"));
		}
	}, []);

	function updateConversationsOpen(open: boolean) {
		setConversationsOpen(open);
		window.localStorage.setItem("chat-conversations-open", String(open));
	}

	if (collapsed) {
		return (
			<div
				className={cn(
					"flex h-full min-h-0 flex-col items-center gap-1.5 py-3",
					className,
				)}
			>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							aria-label="Expand chat sidebar"
							onClick={() => onCollapsedChange?.(false)}
							className="size-9 rounded-lg transition-all duration-200 hover:bg-muted"
						>
							<PanelLeftOpenIcon className="size-4" aria-hidden="true" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="right">Expand sidebar</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							aria-label="New conversation"
							onClick={onNewConversation}
							className="size-9 rounded-lg transition-all duration-200 hover:bg-primary/10 hover:text-primary"
						>
							<PlusIcon className="size-4" aria-hidden="true" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="right">New chat</TooltipContent>
				</Tooltip>
				<div className="mt-1 flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-1">
					{conversations.slice(0, 10).map((conversation) => (
						<Tooltip key={conversation.id}>
							<TooltipTrigger asChild>
								<Button
									type="button"
									size="icon"
									variant={
										activeConversationId === conversation.id
											? "secondary"
											: "ghost"
									}
									aria-label={conversation.title}
									onClick={() => onSelectConversation(conversation.id)}
									className={cn(
										"size-9 rounded-lg transition-all duration-200",
										activeConversationId === conversation.id &&
											"bg-primary/10 text-primary shadow-sm",
									)}
								>
									<MessageSquareIcon className="size-4" aria-hidden="true" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="right">{conversation.title}</TooltipContent>
						</Tooltip>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className={cn("flex h-full min-h-0 flex-col", className)}>
			{/* Header — glass surface matching composer */}
			<div className="flex items-center justify-between border-b border-border/50 px-4 py-3 backdrop-blur-xl">
				<div className="flex items-center gap-2">
					{onCollapsedChange ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									size="icon"
									variant="ghost"
									aria-label="Collapse chat sidebar"
									onClick={() => onCollapsedChange(true)}
									className="size-7 rounded-md"
								>
									<PanelLeftCloseIcon className="size-3.5" aria-hidden="true" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Collapse sidebar</TooltipContent>
						</Tooltip>
					) : null}
					<div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
						<SparklesIcon className="size-3" aria-hidden="true" />
					</div>
					<span className="text-sm font-semibold tracking-tight">Chat</span>
				</div>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={onNewConversation}
					className="h-8 gap-1 rounded-lg border-border/50 bg-background/60 px-3 text-xs font-medium shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm hover:shadow-primary/10 hover:bg-background active:translate-y-0"
				>
					<PlusIcon className="size-3" aria-hidden="true" />
					New
				</Button>
			</div>

			{/* Scrollable content */}
			<div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
				<Collapsible
					open={conversationsOpen}
					onOpenChange={updateConversationsOpen}
					className="flex min-h-0 flex-col"
				>
					{/* Section trigger */}
					<CollapsibleTrigger asChild>
						<button
							type="button"
							className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary/40"
						>
							<span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
								Conversations
								{conversations.length > 0 && (
									<span className="ml-1.5 inline-flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
										{conversations.length}
									</span>
								)}
							</span>
							<ChevronDownIcon
								aria-hidden="true"
								className={cn(
									"size-3.5 text-muted-foreground/50 transition-transform duration-200",
									!conversationsOpen && "-rotate-90",
								)}
							/>
						</button>
					</CollapsibleTrigger>

					<CollapsibleContent className="flex min-h-0 flex-col gap-1">
						{loading ? (
							<div className="flex flex-col gap-px pt-px">
								<Skeleton className="h-8 w-full rounded" />
								<Skeleton className="h-8 w-full rounded" />
								<Skeleton className="h-8 w-full rounded" />
							</div>
						) : conversations.length === 0 ? (
							<div className="pt-2">
								<Empty className="border border-dashed border-border/50 bg-background/30 py-8">
									<EmptyHeader>
										<EmptyMedia
											variant="icon"
											className="text-muted-foreground/40"
										>
											<MessageSquareIcon
												className="size-5"
												aria-hidden="true"
											/>
										</EmptyMedia>
										<EmptyTitle className="text-sm font-medium">
											No conversations yet
										</EmptyTitle>
										<EmptyDescription className="text-xs text-muted-foreground/60">
											Start a new chat to begin.
										</EmptyDescription>
									</EmptyHeader>
									<div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
										<Button
											asChild
											variant="link"
											size="sm"
											className="h-auto px-0 text-muted-foreground/70"
										>
											<Link href="/providers">Configure a provider</Link>
										</Button>
										<Button
											asChild
											variant="link"
											size="sm"
											className="h-auto px-0 text-muted-foreground/70"
										>
											<Link href="/agents">Create an agent</Link>
										</Button>
									</div>
								</Empty>
							</div>
						) : (
							<div className="flex flex-col gap-px">
								{conversations.map((conversation) => {
									const isActive = activeConversationId === conversation.id;
									const isEditing = editingConversationId === conversation.id;
									const agentName =
										agentNameById.get(conversation.agentId) ?? "Assistant";

									return (
										<ConversationItem
											key={conversation.id}
											conversation={conversation}
											isActive={isActive}
											isEditing={isEditing}
											editingTitle={isEditing ? editingTitle : ""}
											agentName={agentName}
											onSelect={() => onSelectConversation(conversation.id)}
											onRename={(title) => {
												onRenameConversation?.(conversation.id, title);
												setEditingConversationId(null);
											}}
											onDelete={() => onDeleteConversation?.(conversation.id)}
											onEditStart={() => {
												setEditingConversationId(conversation.id);
												setEditingTitle(conversation.title);
											}}
											onEditChange={setEditingTitle}
											onEditCancel={() => setEditingConversationId(null)}
										/>
									);
								})}
							</div>
						)}
					</CollapsibleContent>
				</Collapsible>
			</div>

			{/* Footer */}
			{showThemeToggle ? (
				<div className="border-t border-border/50 p-3 backdrop-blur-xl">
					<ThemeToggleButton className="w-full" />
				</div>
			) : null}
		</div>
	);
}
