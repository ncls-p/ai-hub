"use client";

import Link from "next/link";
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
	const [editingConversationId, setEditingConversationId] = useState<string | null>(
		null,
	);
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
			<div className={cn("flex h-full min-h-0 flex-col items-center gap-2 p-2", className)}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							aria-label="Expand chat sidebar"
							onClick={() => onCollapsedChange?.(false)}
						>
							<PanelLeftOpenIcon aria-hidden="true" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="right">Expand sidebar</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							size="icon"
							variant="outline"
							aria-label="New conversation"
							onClick={onNewConversation}
						>
							<PlusIcon aria-hidden="true" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="right">New chat</TooltipContent>
				</Tooltip>
				<div className="mt-1 flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto">
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
								>
									<MessageSquareIcon aria-hidden="true" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="right">
								{conversation.title}
							</TooltipContent>
						</Tooltip>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className={cn("flex h-full min-h-0 flex-col", className)}>
			<div className="flex items-center justify-between border-b border-border/70 p-3">
				<div className="flex items-center gap-2 text-sm font-medium">
					<SparklesIcon aria-hidden="true" />
					Chat
				</div>
				<div className="flex items-center gap-1">
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={onNewConversation}
					>
						<PlusIcon data-icon="inline-start" aria-hidden="true" />
						New
					</Button>
					{onCollapsedChange ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									size="icon"
									variant="ghost"
									aria-label="Collapse chat sidebar"
									onClick={() => onCollapsedChange(true)}
								>
									<PanelLeftCloseIcon aria-hidden="true" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Collapse sidebar</TooltipContent>
						</Tooltip>
					) : null}
				</div>
			</div>

			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
				<Collapsible
					open={conversationsOpen}
					onOpenChange={updateConversationsOpen}
					className="flex min-h-0 flex-col gap-2"
				>
					<div className="flex items-center justify-between gap-2">
						<div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							Conversations
						</div>
						<CollapsibleTrigger asChild>
							<Button
								type="button"
								size="icon"
								variant="ghost"
								aria-label={
									conversationsOpen
										? "Collapse conversations"
										: "Expand conversations"
								}
							>
								<ChevronDownIcon
									aria-hidden="true"
									className={cn(
										"transition-transform",
										!conversationsOpen && "-rotate-90",
									)}
								/>
							</Button>
						</CollapsibleTrigger>
					</div>
					<CollapsibleContent className="flex min-h-0 flex-col gap-2">
						{loading ? (
							<div className="flex flex-col gap-2">
								<Skeleton className="h-10 w-full rounded-xl" />
								<Skeleton className="h-10 w-full rounded-xl" />
							</div>
						) : conversations.length === 0 ? (
							<Empty className="border border-dashed border-border/70 py-6">
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<MessageSquareIcon aria-hidden="true" />
									</EmptyMedia>
									<EmptyTitle className="text-sm">No conversations</EmptyTitle>
									<EmptyDescription className="text-xs">
										Start a new chat to begin.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						) : (
							conversations.map((conversation) => (
								<div
									key={conversation.id}
									className={cn(
										"group/conversation flex items-center gap-1 rounded-xl border border-transparent px-2 py-2 text-sm transition-colors hover:bg-accent",
										activeConversationId === conversation.id &&
											"border-border bg-card shadow-sm",
									)}
								>
									{editingConversationId === conversation.id ? (
										<div className="flex min-w-0 flex-1 items-center gap-1">
											<Input
												value={editingTitle}
												onChange={(event) =>
													setEditingTitle(event.target.value)
												}
												onKeyDown={(event) => {
													if (event.key === "Enter") {
														const nextTitle = editingTitle.trim();
														if (nextTitle) {
															onRenameConversation?.(
																conversation.id,
																nextTitle,
															);
															setEditingConversationId(null);
														}
													}
													if (event.key === "Escape") {
														setEditingConversationId(null);
													}
												}}
												className="h-8 min-w-0"
												autoFocus
											/>
											<Button
												type="button"
												size="icon-sm"
												variant="ghost"
												aria-label="Save title"
												onClick={() => {
													const nextTitle = editingTitle.trim();
													if (!nextTitle) return;
													onRenameConversation?.(conversation.id, nextTitle);
													setEditingConversationId(null);
												}}
											>
												<CheckIcon aria-hidden="true" />
											</Button>
											<Button
												type="button"
												size="icon-sm"
												variant="ghost"
												aria-label="Cancel title edit"
												onClick={() => setEditingConversationId(null)}
											>
												<XIcon aria-hidden="true" />
											</Button>
										</div>
									) : (
										<>
											<button
												type="button"
												onClick={() => onSelectConversation(conversation.id)}
												className="min-w-0 flex-1 text-left"
											>
												<span className="block truncate font-medium">
													{conversation.title}
												</span>
												<span className="block truncate text-xs text-muted-foreground">
													{agentNameById.get(conversation.agentId) ??
														"Assistant"}{" "}
													·{" "}
													{new Date(
														conversation.updatedAt,
													).toLocaleDateString()}
												</span>
											</button>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														type="button"
														size="icon-sm"
														variant="ghost"
														aria-label="Conversation actions"
														className="opacity-100 md:opacity-0 md:group-hover/conversation:opacity-100 data-open:opacity-100"
													>
														<MoreHorizontalIcon aria-hidden="true" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuGroup>
														<DropdownMenuItem
															onSelect={() => {
																setEditingConversationId(conversation.id);
																setEditingTitle(conversation.title);
															}}
														>
															<PencilIcon aria-hidden="true" />
															Rename
														</DropdownMenuItem>
														<DropdownMenuItem
															variant="destructive"
															onSelect={() =>
																onDeleteConversation?.(conversation.id)
															}
														>
															<Trash2Icon aria-hidden="true" />
															Delete
														</DropdownMenuItem>
													</DropdownMenuGroup>
												</DropdownMenuContent>
											</DropdownMenu>
										</>
									)}
								</div>
							))
						)}
					</CollapsibleContent>
				</Collapsible>
			</div>

			{showThemeToggle ? (
				<div className="border-t border-border/70 p-3">
					<ThemeToggleButton className="w-full" />
				</div>
			) : null}
		</div>
	);
}

export function ChatSidebarEmptyLinks() {
	return (
		<div className="flex flex-wrap gap-2 text-xs">
			<Button asChild variant="link" size="sm" className="h-auto px-0">
				<Link href="/providers">Configure a provider</Link>
			</Button>
			<Button asChild variant="link" size="sm" className="h-auto px-0">
				<Link href="/agents">Create an agent</Link>
			</Button>
		</div>
	);
}
