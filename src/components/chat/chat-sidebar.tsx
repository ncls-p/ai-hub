"use client";

import { Link, usePathname } from "@/i18n/navigation";
import {
	ChevronDownIcon,
	CheckIcon,
	FolderIcon,
	FolderPlusIcon,
	MoreHorizontalIcon,
	MessageSquareIcon,
	PanelLeftCloseIcon,
	PanelLeftOpenIcon,
	PencilIcon,
	PinIcon,
	PlusIcon,
	Trash2Icon,
	XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import type {
	ChatAgent,
	ChatConversation,
	ChatConversationFolder,
} from "@/components/chat/chat-types";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { Badge } from "@/components/ui/badge";
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
import {
	isNavItemActive,
	type NavGroup,
	type NavItem,
	type WorkspaceShellState,
} from "@/lib/workspace-nav";
import { buildMenuGroups } from "@/modules/navigation/sidebar-config";
import { cn } from "@/lib/utils";

interface ChatSidebarProps {
	agents: ChatAgent[];
	conversations: ChatConversation[];
	conversationFolders: ChatConversationFolder[];
	activeConversationId: string | null;
	loading?: boolean;
	onSelectConversation: (conversationId: string) => void;
	onNewConversation: () => void;
	canCreateAgent?: boolean;
	onRenameConversation?: (conversationId: string, title: string) => void;
	onDeleteConversation?: (conversationId: string) => void;
	onCreateConversationFolder?: (name: string) => void;
	onRenameConversationFolder?: (folderId: string, name: string) => void;
	onDeleteConversationFolder?: (folderId: string) => void;
	onToggleConversationPin?: (conversationId: string, pinned: boolean) => void;
	onReorderConversations?: (input: {
		conversationIds: string[];
		folderId: string | null;
		pinned?: boolean;
	}) => void;
	hasMoreConversations?: boolean;
	loadingMoreConversations?: boolean;
	onLoadMoreConversations?: () => void;
	collapsed?: boolean;
	onCollapsedChange?: (collapsed: boolean) => void;
	className?: string;
	showThemeToggle?: boolean;
	shell?: WorkspaceShellState;
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

function ChatNavLink({ item }: { item: NavItem }) {
	const pathname = usePathname();
	const t = useTranslations("nav");
	const Icon = item.icon;
	const label = t(item.labelKey);
	const active = isNavItemActive(pathname, item.href);

	return (
		<Link
			href={item.href}
			aria-current={active ? "page" : undefined}
			className={cn(
				"flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
				active
					? "bg-sidebar-accent text-sidebar-accent-foreground"
					: "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
			)}
		>
			<Icon className="size-4 shrink-0" aria-hidden="true" />
			<span className="min-w-0 flex-1 truncate">{label}</span>
			{item.badge && item.badge > 0 ? (
				<Badge variant="secondary" className="h-5 min-w-5 px-1 text-[10px]">
					{item.badge}
				</Badge>
			) : null}
		</Link>
	);
}

function ChatAppNavigation({ groups }: { groups: NavGroup[] }) {
	const tGroups = useTranslations("nav.groups");
	const [open, setOpen] = useState(false);
	const primaryItems = groups
		.filter((group) => group.labelKey !== "advanced")
		.flatMap((group) => group.items)
		.filter((item) => item.href !== "/chat")
		.slice(0, 6);
	const advancedItems = groups
		.find((group) => group.labelKey === "advanced")
		?.items.filter((item) => item.href !== "/chat");

	if (
		primaryItems.length === 0 &&
		(!advancedItems || advancedItems.length === 0)
	) {
		return null;
	}

	return (
		<div className="border-t border-sidebar-border px-3 py-3">
			<p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">
				Workspace
			</p>
			<div className="flex flex-col gap-1">
				{primaryItems.map((item) => (
					<ChatNavLink key={item.href} item={item} />
				))}
			</div>
			{advancedItems && advancedItems.length > 0 ? (
				<Collapsible open={open} onOpenChange={setOpen}>
					<CollapsibleTrigger asChild>
						<button
							type="button"
							className="mt-1 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
						>
							<span>{tGroups("advanced")}</span>
							<ChevronDownIcon
								className={cn(
									"size-3.5 transition-transform",
									open && "rotate-180",
								)}
								aria-hidden="true"
							/>
						</button>
					</CollapsibleTrigger>
					<CollapsibleContent className="mt-1 flex flex-col gap-1">
						{advancedItems.map((item) => (
							<ChatNavLink key={item.href} item={item} />
						))}
					</CollapsibleContent>
				</Collapsible>
			) : null}
		</div>
	);
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
	onTogglePin,
	onDragStart,
	onDragEnd,
	onDropBefore,
	isDragging,
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
	onTogglePin: () => void;
	onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
	onDragEnd: () => void;
	onDropBefore: (event: React.DragEvent<HTMLDivElement>) => void;
	isDragging: boolean;
}) {
	const pinned = Boolean(conversation.pinnedAt);

	return (
		<div
			draggable={!isEditing}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
			onDragOver={(event) => event.preventDefault()}
			onDrop={onDropBefore}
			className={cn(
				"group/conversation relative overflow-hidden rounded-lg border transition-colors",
				isActive
					? "border-input bg-muted"
					: "border-transparent hover:border-border hover:bg-muted/70",
				isDragging && "opacity-45",
			)}
		>
			{/* Active indicator bar */}
			{isActive && (
				<div className="absolute left-1 top-1/2 h-4 w-px -translate-y-1/2 rounded-full bg-foreground" />
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
						className="h-7 min-w-0 rounded-md px-2 text-xs"
						autoFocus
					/>
					<Button
						type="button"
						size="icon-sm"
						variant="ghost"
						aria-label="Save title"
						className="size-6 shrink-0 rounded-md"
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
						className="size-6 shrink-0 rounded-md"
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
								isActive ? "font-semibold text-foreground" : "font-medium",
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
					{pinned ? (
						<PinIcon
							className="size-3 shrink-0 text-primary"
							aria-hidden="true"
						/>
					) : null}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								type="button"
								size="icon-sm"
								variant="ghost"
								aria-label="Conversation actions"
								className={cn(
									"size-6 shrink-0 rounded-md opacity-0 transition-opacity hover:bg-background md:group-hover/conversation:opacity-100 data-[state=open]:opacity-100",
									isActive && "opacity-100",
								)}
							>
								<MoreHorizontalIcon className="size-3" aria-hidden="true" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuGroup>
								<DropdownMenuItem onSelect={onTogglePin} className="gap-2">
									<PinIcon className="size-3.5" aria-hidden="true" />
									{pinned ? "Unpin" : "Pin to top"}
								</DropdownMenuItem>
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
	conversationFolders,
	activeConversationId,
	loading,
	onSelectConversation,
	onNewConversation,
	canCreateAgent = false,
	onRenameConversation,
	onDeleteConversation,
	onCreateConversationFolder,
	onRenameConversationFolder,
	onDeleteConversationFolder,
	onToggleConversationPin,
	onReorderConversations,
	hasMoreConversations,
	loadingMoreConversations,
	onLoadMoreConversations,
	collapsed,
	onCollapsedChange,
	className,
	showThemeToggle,
	shell,
}: ChatSidebarProps) {
	const [editingConversationId, setEditingConversationId] = useState<
		string | null
	>(null);
	const [editingTitle, setEditingTitle] = useState("");
	const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
	const [editingFolderName, setEditingFolderName] = useState("");
	const [creatingFolder, setCreatingFolder] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");
	const [closedFolderIds, setClosedFolderIds] = useState<Set<string>>(
		() => new Set(),
	);
	const [draggingConversationId, setDraggingConversationId] = useState<
		string | null
	>(null);
	const agentNameById = useMemo(
		() => new Map(agents.map((agent) => [agent.id, agent.name])),
		[agents],
	);
	const navGroups = useMemo(
		() => (shell ? buildMenuGroups(shell) : []),
		[shell],
	);
	const canConfigureProviders = Boolean(shell?.permissions.canManageProviders);
	const sortedConversations = useMemo(() => {
		return [...conversations].sort((a, b) => {
			const aPinned = a.pinnedAt ? 0 : 1;
			const bPinned = b.pinnedAt ? 0 : 1;
			if (aPinned !== bPinned) return aPinned - bPinned;
			const aOrder = a.sidebarOrder ?? Number.MAX_SAFE_INTEGER;
			const bOrder = b.sidebarOrder ?? Number.MAX_SAFE_INTEGER;
			if (aOrder !== bOrder) return aOrder - bOrder;
			return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
		});
	}, [conversations]);
	const pinnedConversations = useMemo(
		() => sortedConversations.filter((conversation) => conversation.pinnedAt),
		[sortedConversations],
	);
	const unpinnedConversations = useMemo(
		() => sortedConversations.filter((conversation) => !conversation.pinnedAt),
		[sortedConversations],
	);
	const topLevelConversations = useMemo(
		() =>
			unpinnedConversations.filter((conversation) => !conversation.folderId),
		[unpinnedConversations],
	);
	const folderSections = useMemo(() => {
		return conversationFolders.map((folder) => ({
			folder,
			conversations: unpinnedConversations.filter(
				(conversation) => conversation.folderId === folder.id,
			),
		}));
	}, [conversationFolders, unpinnedConversations]);

	function orderedIdsWithInsertion(
		items: ChatConversation[],
		draggedId: string,
		beforeId?: string,
	) {
		const ids = items
			.map((conversation) => conversation.id)
			.filter((id) => id !== draggedId);
		const insertionIndex = beforeId ? ids.indexOf(beforeId) : -1;
		ids.splice(insertionIndex >= 0 ? insertionIndex : ids.length, 0, draggedId);
		return ids;
	}

	function reorderDraggedConversation({
		folderId,
		pinned,
		beforeId,
	}: {
		folderId: string | null;
		pinned: boolean;
		beforeId?: string;
	}) {
		if (!draggingConversationId || !onReorderConversations) return;
		if (beforeId === draggingConversationId) {
			setDraggingConversationId(null);
			return;
		}
		const destinationItems = pinned
			? pinnedConversations
			: folderId
				? (folderSections.find((section) => section.folder.id === folderId)
						?.conversations ?? [])
				: topLevelConversations;
		onReorderConversations({
			conversationIds: orderedIdsWithInsertion(
				destinationItems,
				draggingConversationId,
				beforeId,
			),
			folderId,
			pinned,
		});
		setDraggingConversationId(null);
	}

	function handleConversationDrop(
		event: React.DragEvent<HTMLDivElement>,
		conversation: ChatConversation,
	) {
		event.preventDefault();
		event.stopPropagation();
		reorderDraggedConversation({
			folderId: conversation.pinnedAt ? null : (conversation.folderId ?? null),
			pinned: Boolean(conversation.pinnedAt),
			beforeId: conversation.id,
		});
	}

	function startFolderCreate() {
		setCreatingFolder(true);
		setNewFolderName("");
	}

	function saveNewFolder() {
		const name = newFolderName.trim();
		if (!name) return;
		onCreateConversationFolder?.(name);
		setCreatingFolder(false);
		setNewFolderName("");
	}

	function toggleFolder(folderId: string) {
		setClosedFolderIds((current) => {
			const next = new Set(current);
			if (next.has(folderId)) next.delete(folderId);
			else next.add(folderId);
			return next;
		});
	}

	function renderConversation(conversation: ChatConversation) {
		const isActive = activeConversationId === conversation.id;
		const isEditing = editingConversationId === conversation.id;
		const agentName = agentNameById.get(conversation.agentId) ?? "Assistant";

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
				onTogglePin={() =>
					onToggleConversationPin?.(conversation.id, !conversation.pinnedAt)
				}
				onDragStart={(event) => {
					setDraggingConversationId(conversation.id);
					event.dataTransfer.effectAllowed = "move";
					event.dataTransfer.setData("text/plain", conversation.id);
				}}
				onDragEnd={() => setDraggingConversationId(null)}
				onDropBefore={(event) => handleConversationDrop(event, conversation)}
				isDragging={draggingConversationId === conversation.id}
			/>
		);
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
							className="size-9 rounded-lg"
						>
							<PlusIcon className="size-4" aria-hidden="true" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="right">New chat</TooltipContent>
				</Tooltip>
				<div className="mt-1 flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-1">
					{sortedConversations.slice(0, 10).map((conversation) => (
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
										"size-9 rounded-lg transition-colors",
										activeConversationId === conversation.id &&
											"bg-muted text-foreground",
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
		<div
			className={cn(
				"flex h-full min-h-0 flex-col rounded-none bg-sidebar text-sidebar-foreground",
				className,
			)}
		>
			<div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3">
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
					<div className="flex size-6 items-center justify-center rounded-md border bg-muted text-muted-foreground">
						<MessageSquareIcon className="size-3" aria-hidden="true" />
					</div>
					<span className="text-sm font-semibold tracking-tight">Chat</span>
				</div>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={onNewConversation}
					className="h-8 gap-1 rounded-lg px-3 text-xs font-medium"
				>
					<PlusIcon className="size-3" aria-hidden="true" />
					New
				</Button>
			</div>

			{/* Scrollable content */}
			<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
				<div className="flex items-center justify-between px-2 py-1.5">
					<span className="text-[11px] font-medium text-muted-foreground">
						Conversations
					</span>
					<div className="flex items-center gap-1">
						{conversations.length > 0 ? (
							<span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
								{conversations.length}
								{hasMoreConversations ? "+" : ""}
							</span>
						) : null}
						<Button
							type="button"
							size="icon-sm"
							variant="ghost"
							aria-label="Create folder"
							className="size-6 rounded-md text-muted-foreground"
							onClick={startFolderCreate}
						>
							<FolderPlusIcon className="size-3.5" aria-hidden="true" />
						</Button>
					</div>
				</div>

				{creatingFolder ? (
					<div className="flex items-center gap-1 rounded-lg border bg-background p-1">
						<Input
							value={newFolderName}
							onChange={(event) => setNewFolderName(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") saveNewFolder();
								if (event.key === "Escape") setCreatingFolder(false);
							}}
							placeholder="Folder name"
							className="h-7 min-w-0 rounded-md px-2 text-xs"
							autoFocus
						/>
						<Button
							type="button"
							size="icon-sm"
							variant="ghost"
							aria-label="Create folder"
							className="size-6 shrink-0"
							onClick={saveNewFolder}
						>
							<CheckIcon className="size-3" aria-hidden="true" />
						</Button>
						<Button
							type="button"
							size="icon-sm"
							variant="ghost"
							aria-label="Cancel folder creation"
							className="size-6 shrink-0"
							onClick={() => setCreatingFolder(false)}
						>
							<XIcon className="size-3" aria-hidden="true" />
						</Button>
					</div>
				) : null}

				<div className="flex min-h-0 flex-col gap-1">
					{loading ? (
						<div className="flex flex-col gap-px pt-px">
							<Skeleton className="h-8 w-full rounded" />
							<Skeleton className="h-8 w-full rounded" />
							<Skeleton className="h-8 w-full rounded" />
						</div>
					) : conversations.length === 0 && conversationFolders.length === 0 ? (
						<div className="pt-2">
							<Empty className="border border-dashed py-8">
								<EmptyHeader>
									<EmptyMedia
										variant="icon"
										className="text-muted-foreground/40"
									>
										<MessageSquareIcon className="size-5" aria-hidden="true" />
									</EmptyMedia>
									<EmptyTitle className="text-sm font-medium">
										No conversations yet
									</EmptyTitle>
									<EmptyDescription className="text-xs text-muted-foreground/60">
										Start a new chat to begin.
									</EmptyDescription>
								</EmptyHeader>
								{canConfigureProviders || canCreateAgent ? (
									<div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
										{canConfigureProviders ? (
											<Button
												asChild
												variant="link"
												size="sm"
												className="h-auto px-0 text-muted-foreground/70"
											>
												<Link href="/providers">Configure a provider</Link>
											</Button>
										) : null}
										{canCreateAgent ? (
											<Button
												asChild
												variant="link"
												size="sm"
												className="h-auto px-0 text-muted-foreground/70"
											>
												<Link href="/agents">Create an agent</Link>
											</Button>
										) : null}
									</div>
								) : null}
							</Empty>
						</div>
					) : (
						<div className="flex flex-col gap-2">
							{pinnedConversations.length > 0 ? (
								<section
									className="flex flex-col gap-px"
									onDragOver={(event) => event.preventDefault()}
									onDrop={(event) => {
										event.preventDefault();
										reorderDraggedConversation({
											folderId: null,
											pinned: true,
										});
									}}
								>
									<div className="flex items-center gap-1 px-2 pb-1 text-[11px] font-medium text-muted-foreground">
										<PinIcon className="size-3" aria-hidden="true" />
										Pinned
									</div>
									{pinnedConversations.map(renderConversation)}
								</section>
							) : null}

							{folderSections.map(
								({ folder, conversations: folderConversations }) => {
									const open = !closedFolderIds.has(folder.id);
									const isEditingFolder = editingFolderId === folder.id;

									return (
										<section key={folder.id} className="flex flex-col gap-px">
											<div
												className="group/folder flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60"
												onDragOver={(event) => event.preventDefault()}
												onDrop={(event) => {
													event.preventDefault();
													reorderDraggedConversation({
														folderId: folder.id,
														pinned: false,
													});
												}}
											>
												<FolderIcon
													className="size-3.5 shrink-0"
													aria-hidden="true"
												/>
												{isEditingFolder ? (
													<div className="flex min-w-0 flex-1 items-center gap-1">
														<Input
															value={editingFolderName}
															onChange={(event) =>
																setEditingFolderName(event.target.value)
															}
															onKeyDown={(event) => {
																if (event.key === "Enter") {
																	const name = editingFolderName.trim();
																	if (name) {
																		onRenameConversationFolder?.(
																			folder.id,
																			name,
																		);
																		setEditingFolderId(null);
																	}
																}
																if (event.key === "Escape")
																	setEditingFolderId(null);
															}}
															className="h-6 min-w-0 rounded-md px-2 text-xs"
															autoFocus
														/>
													</div>
												) : (
													<button
														type="button"
														className="flex min-w-0 flex-1 items-center gap-1 text-left"
														onClick={() => toggleFolder(folder.id)}
													>
														<ChevronDownIcon
															className={cn(
																"size-3 shrink-0 transition-transform",
																!open && "-rotate-90",
															)}
															aria-hidden="true"
														/>
														<span className="truncate font-medium">
															{folder.name}
														</span>
														<span className="text-muted-foreground/50">
															{folderConversations.length}
														</span>
													</button>
												)}
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															type="button"
															size="icon-sm"
															variant="ghost"
															className="size-6 opacity-0 group-hover/folder:opacity-100 data-[state=open]:opacity-100"
															aria-label="Folder actions"
														>
															<MoreHorizontalIcon
																className="size-3"
																aria-hidden="true"
															/>
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem
															onSelect={() => {
																setEditingFolderId(folder.id);
																setEditingFolderName(folder.name);
															}}
															className="gap-2"
														>
															<PencilIcon
																className="size-3.5"
																aria-hidden="true"
															/>
															Rename
														</DropdownMenuItem>
														<DropdownMenuItem
															variant="destructive"
															onSelect={() =>
																onDeleteConversationFolder?.(folder.id)
															}
															className="gap-2"
														>
															<Trash2Icon
																className="size-3.5"
																aria-hidden="true"
															/>
															Delete folder
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</div>
											{open ? (
												<div className="flex flex-col gap-px pl-3">
													{folderConversations.length > 0 ? (
														folderConversations.map(renderConversation)
													) : (
														<div
															className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground/60"
															onDragOver={(event) => event.preventDefault()}
															onDrop={(event) => {
																event.preventDefault();
																reorderDraggedConversation({
																	folderId: folder.id,
																	pinned: false,
																});
															}}
														>
															Drop chats here
														</div>
													)}
												</div>
											) : null}
										</section>
									);
								},
							)}

							<section
								className="flex flex-col gap-px"
								onDragOver={(event) => event.preventDefault()}
								onDrop={(event) => {
									event.preventDefault();
									reorderDraggedConversation({ folderId: null, pinned: false });
								}}
							>
								{topLevelConversations.length > 0 ? (
									<>
										<div className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">
											Recent
										</div>
										{topLevelConversations.map(renderConversation)}
									</>
								) : folderSections.length === 0 ? (
									<div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground/60">
										Drop chats here
									</div>
								) : null}
							</section>

							{hasMoreConversations && onLoadMoreConversations ? (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="mt-2 h-8 rounded-lg text-xs text-muted-foreground"
									disabled={loadingMoreConversations}
									onClick={onLoadMoreConversations}
								>
									{loadingMoreConversations ? "Loading…" : "Load older chats"}
								</Button>
							) : null}
						</div>
					)}
				</div>
			</div>

			{navGroups.length > 0 ? <ChatAppNavigation groups={navGroups} /> : null}

			{/* Footer */}
			{showThemeToggle ? (
				<div className="border-t border-border/50 p-3">
					<ThemeToggleButton className="w-full" />
				</div>
			) : null}
		</div>
	);
}
