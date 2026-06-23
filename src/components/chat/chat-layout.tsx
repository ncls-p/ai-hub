"use client";

import { Link } from "@/i18n/navigation";
import { useState, useSyncExternalStore, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import {
	ChevronDownIcon,
	MessageSquarePlusIcon,
	PanelLeftCloseIcon,
	PanelLeftOpenIcon,
	SearchIcon,
	Settings2Icon,
	StarIcon,
} from "lucide-react";

import { useWorkspaceShell } from "@/components/app-shell";
import { DeodisLogo } from "@/components/deodis-logo";
import { ModelLogo } from "@/components/providers/model-logo";
import { AppHeader } from "@/components/app-header";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import type {
	ChatAgent,
	ChatConversation,
	ChatConversationFolder,
} from "@/components/chat/chat-types";
import { SetupWizard } from "@/components/setup/setup-wizard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const HISTORY_OPEN_STORAGE_KEY = "chat-unified-sidebar-open";
const HISTORY_OPEN_STORAGE_EVENT = "chat-unified-sidebar-open-change";
const HISTORY_WIDTH_STORAGE_KEY = "chat-unified-sidebar-width";
const HISTORY_WIDTH_STORAGE_EVENT = "chat-unified-sidebar-width-change";
const DEFAULT_HISTORY_OPEN = true;
const DEFAULT_HISTORY_WIDTH = 320;
const MIN_HISTORY_WIDTH = 260;
const MAX_HISTORY_WIDTH = 480;

function clampHistoryWidth(value: number) {
	return Math.min(
		MAX_HISTORY_WIDTH,
		Math.max(MIN_HISTORY_WIDTH, Math.round(value)),
	);
}

function subscribeHistoryOpen(callback: () => void) {
	window.addEventListener("storage", callback);
	window.addEventListener(HISTORY_OPEN_STORAGE_EVENT, callback);
	return () => {
		window.removeEventListener("storage", callback);
		window.removeEventListener(HISTORY_OPEN_STORAGE_EVENT, callback);
	};
}

function getStoredHistoryOpen(): boolean {
	const stored = window.localStorage.getItem(HISTORY_OPEN_STORAGE_KEY);
	if (stored === null) return DEFAULT_HISTORY_OPEN;
	return stored === "true";
}

function setStoredHistoryOpen({ open }: { open: boolean }) {
	window.localStorage.setItem(HISTORY_OPEN_STORAGE_KEY, String(open));
	window.dispatchEvent(new Event(HISTORY_OPEN_STORAGE_EVENT));
}

function subscribeHistoryWidth(callback: () => void) {
	window.addEventListener("storage", callback);
	window.addEventListener(HISTORY_WIDTH_STORAGE_EVENT, callback);
	return () => {
		window.removeEventListener("storage", callback);
		window.removeEventListener(HISTORY_WIDTH_STORAGE_EVENT, callback);
	};
}

function getStoredHistoryWidth(): number {
	const stored = window.localStorage.getItem(HISTORY_WIDTH_STORAGE_KEY);
	const parsed = stored ? Number.parseInt(stored, 10) : DEFAULT_HISTORY_WIDTH;
	return Number.isFinite(parsed)
		? clampHistoryWidth(parsed)
		: DEFAULT_HISTORY_WIDTH;
}

function setStoredHistoryWidth(width: number) {
	window.localStorage.setItem(
		HISTORY_WIDTH_STORAGE_KEY,
		String(clampHistoryWidth(width)),
	);
	window.dispatchEvent(new Event(HISTORY_WIDTH_STORAGE_EVENT));
}

type ChatSidebarCollapsedChangeHandler = NonNullable<
	ComponentProps<typeof ChatSidebar>["onCollapsedChange"]
>;

interface ChatLayoutProps {
	agents: ChatAgent[];
	conversations: ChatConversation[];
	conversationFolders: ChatConversationFolder[];
	selectedAgent: ChatAgent | null;
	selectedAgentId: string | null;
	activeConversationId: string | null;
	organizationDefaultAgentId?: string | null;
	userDefaultAgentId?: string | null;
	canChat: boolean;
	canCreateAgent?: boolean;
	canRunSetup?: boolean;
	loadingSidebar?: boolean;
	onSelectAgent: (agentId: string) => void;
	onSelectConversation: (conversationId: string) => void;
	onNewConversation: () => void;
	onSetUserDefaultAgent?: (agentId: string | null) => void;
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
	onSetupComplete?: () => void;
	children: React.ReactNode;
}

export function ChatLayout({
	agents,
	conversations,
	conversationFolders,
	selectedAgent,
	selectedAgentId,
	activeConversationId,
	organizationDefaultAgentId,
	userDefaultAgentId,
	canChat,
	canCreateAgent = false,
	canRunSetup = false,
	loadingSidebar,
	onSelectAgent,
	onSelectConversation,
	onNewConversation,
	onSetUserDefaultAgent,
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
	onSetupComplete,
	children,
}: ChatLayoutProps) {
	const t = useTranslations("chat");
	const shell = useWorkspaceShell();
	const [setupOpen, setSetupOpen] = useState(false);
	const [agentSearch, setAgentSearch] = useState("");
	const sidebarOpen = useSyncExternalStore(
		subscribeHistoryOpen,
		getStoredHistoryOpen,
		() => DEFAULT_HISTORY_OPEN,
	);
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
	const [resizingSidebar, setResizingSidebar] = useState(false);
	const sidebarWidth = useSyncExternalStore(
		subscribeHistoryWidth,
		getStoredHistoryWidth,
		() => DEFAULT_HISTORY_WIDTH,
	);

	function updateSidebarOpen({ open }: { open: boolean }) {
		setStoredHistoryOpen({ open });
	}

	function startSidebarResize(event: React.PointerEvent<HTMLDivElement>) {
		if (!sidebarOpen) return;
		event.preventDefault();
		const startX = event.clientX;
		const startWidth = sidebarWidth;
		setResizingSidebar(true);
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";

		function onPointerMove(moveEvent: PointerEvent) {
			setStoredHistoryWidth(startWidth + moveEvent.clientX - startX);
		}

		function onPointerUp() {
			setResizingSidebar(false);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
			document.removeEventListener("pointermove", onPointerMove);
			document.removeEventListener("pointerup", onPointerUp);
		}

		document.addEventListener("pointermove", onPointerMove);
		document.addEventListener("pointerup", onPointerUp, { once: true });
	}

	function adjustSidebarWidth(delta: number) {
		setStoredHistoryWidth(sidebarWidth + delta);
	}

	const sidebarProps = {
		agents,
		conversations,
		conversationFolders,
		activeConversationId,
		loading: loadingSidebar,
		onSelectConversation,
		onNewConversation,
		canCreateAgent,
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
		collapsed: false,
		onCollapsedChange: undefined,
		shell,
		showThemeToggle: true,
	};
	const handleDesktopSidebarCollapsedChange = ((collapsed) => {
		updateSidebarOpen({ open: !collapsed });
	}) satisfies ChatSidebarCollapsedChangeHandler;
	const desktopSidebarProps = {
		...sidebarProps,
		onCollapsedChange: handleDesktopSidebarCollapsedChange,
	};
	const mobileSidebarProps = {
		...sidebarProps,
		onSelectConversation: (conversationId: string) => {
			onSelectConversation(conversationId);
			setMobileSidebarOpen(false);
		},
	};

	const selectedAgentLabel = selectedAgent?.name ?? t("chooseAssistant");
	const normalizedAgentSearch = agentSearch.trim().toLowerCase();
	const visibleAgents = normalizedAgentSearch
		? agents.filter(
				(agent) =>
					agent.name.toLowerCase().includes(normalizedAgentSearch) ||
					(agent.description ?? "")
						.toLowerCase()
						.includes(normalizedAgentSearch),
			)
		: agents;
	const organizationAgents = visibleAgents.filter(
		(agent) => agent.isGlobal || agent.isRecommended || agent.canEdit === false,
	);
	const personalAgents = visibleAgents.filter(
		(agent) =>
			agent.isGlobal !== true &&
			agent.isRecommended !== true &&
			agent.canEdit !== false,
	);
	const defaultLabelForAgent = (agent: ChatAgent) => {
		if (agent.id === userDefaultAgentId) return t("myDefault");
		if (
			agent.id === organizationDefaultAgentId ||
			agent.isOrganizationDefault
		) {
			return t("organizationDefault");
		}
		return null;
	};
	const agentSelector = (
		<div className="relative z-10 flex min-w-0 items-center gap-2">
			<DropdownMenu onOpenChange={(open) => !open && setAgentSearch("")}>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-8 min-w-0 max-w-[min(100%,13rem)] justify-between gap-2 px-2 font-medium sm:max-w-72 sm:min-w-56"
						aria-label={t("currentAssistant")}
					>
						<span className="flex min-w-0 items-center gap-2">
							{selectedAgent ? (
								<ModelLogo
									logoUrl={selectedAgent.logoUrl}
									label={selectedAgentLabel}
									size="sm"
									imageFit="cover"
									className="rounded-full"
								/>
							) : null}
							<span className="truncate">{selectedAgentLabel}</span>
						</span>
						<ChevronDownIcon
							className="size-3.5 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="center" className="w-80">
					<div className="p-1" onKeyDown={(event) => event.stopPropagation()}>
						<div className="relative">
							<SearchIcon
								className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
								aria-hidden="true"
							/>
							<Input
								name="assistant-search"
								autoComplete="off"
								value={agentSearch}
								onChange={(event) => setAgentSearch(event.target.value)}
								placeholder={t("assistantSearch")}
								className="h-8 pl-8 text-sm"
							/>
						</div>
					</div>
					{organizationAgents.length > 0 ? (
						<>
							<DropdownMenuLabel>
								{t("organizationAssistants")}
							</DropdownMenuLabel>
							{organizationAgents.map((agent) => (
								<DropdownMenuItem
									key={agent.id}
									className="gap-2"
									onClick={() => onSelectAgent(agent.id)}
								>
									<ModelLogo
										logoUrl={agent.logoUrl}
										label={agent.name}
										size="sm"
										imageFit="cover"
										className="rounded-full"
									/>
									<span className="min-w-0 flex-1 truncate">{agent.name}</span>
									{defaultLabelForAgent(agent) ? (
										<span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
											<StarIcon className="size-3" aria-hidden="true" />
											{defaultLabelForAgent(agent)}
										</span>
									) : (
										<span className="shrink-0 text-[11px] text-muted-foreground">
											{agent.modelDisplayName
												? t("statusReady")
												: t("statusNeedsSetup")}
										</span>
									)}
								</DropdownMenuItem>
							))}
						</>
					) : null}
					{personalAgents.length > 0 ? (
						<>
							{organizationAgents.length > 0 ? <DropdownMenuSeparator /> : null}
							<DropdownMenuLabel>{t("myAssistants")}</DropdownMenuLabel>
							{personalAgents.map((agent) => (
								<DropdownMenuItem
									key={agent.id}
									className="gap-2"
									onClick={() => onSelectAgent(agent.id)}
								>
									<ModelLogo
										logoUrl={agent.logoUrl}
										label={agent.name}
										size="sm"
										imageFit="cover"
										className="rounded-full"
									/>
									<span className="min-w-0 flex-1 truncate">{agent.name}</span>
									{defaultLabelForAgent(agent) ? (
										<span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
											<StarIcon className="size-3" aria-hidden="true" />
											{defaultLabelForAgent(agent)}
										</span>
									) : (
										<span className="shrink-0 text-[11px] text-muted-foreground">
											{agent.modelDisplayName
												? t("statusReady")
												: t("statusNeedsSetup")}
										</span>
									)}
								</DropdownMenuItem>
							))}
						</>
					) : null}
					{visibleAgents.length === 0 ? (
						<p className="px-2 py-3 text-center text-sm text-muted-foreground">
							{t("noAssistantMatches")}
						</p>
					) : null}
					{selectedAgent && onSetUserDefaultAgent ? (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="gap-2"
								onClick={() => onSetUserDefaultAgent(selectedAgent.id)}
							>
								<StarIcon className="size-4" aria-hidden="true" />
								{selectedAgent.id === userDefaultAgentId
									? t("myDefaultCurrent")
									: t("setMyDefault")}
							</DropdownMenuItem>
							{userDefaultAgentId ? (
								<DropdownMenuItem onClick={() => onSetUserDefaultAgent(null)}>
									{t("clearMyDefault")}
								</DropdownMenuItem>
							) : null}
						</>
					) : null}
					{canCreateAgent ? (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem asChild>
								<Link href="/agents" className="gap-2">
									<MessageSquarePlusIcon
										className="size-4"
										aria-hidden="true"
									/>
									{t("createAgent")}
								</Link>
							</DropdownMenuItem>
						</>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>
			{!canChat ? (
				<Badge
					variant="outline"
					className="hidden shrink-0 items-center gap-1 rounded-lg border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning sm:inline-flex"
				>
					<Settings2Icon className="size-3" aria-hidden="true" />
					{t("statusNeedsSetup")}
				</Badge>
			) : null}
		</div>
	);

	return (
		<div className="chat-shell-brand flex h-full min-h-0 overflow-hidden">
			{/* Desktop sidebar with smooth transition */}
			<div
				className={cn(
					"hidden ease-[cubic-bezier(0.4,0,0.2,1)] md:block",
					!resizingSidebar && "transition-[opacity,width] duration-300",
				)}
				style={{
					width: sidebarOpen ? `${sidebarWidth}px` : 0,
					opacity: sidebarOpen ? 1 : 0,
				}}
			>
				{sidebarOpen && (
					<aside className="relative h-full w-full rounded-none border-r bg-sidebar">
						<ChatSidebar {...desktopSidebarProps} className="w-full" />
						<div
							role="separator"
							aria-label={t("resizeConversations")}
							aria-orientation="vertical"
							aria-valuemin={MIN_HISTORY_WIDTH}
							aria-valuemax={MAX_HISTORY_WIDTH}
							aria-valuenow={sidebarWidth}
							tabIndex={0}
							className="group absolute inset-y-0 right-0 z-20 w-2 translate-x-1 cursor-col-resize outline-none"
							onPointerDown={startSidebarResize}
							onKeyDown={(event) => {
								if (event.key === "ArrowLeft") adjustSidebarWidth(-12);
								if (event.key === "ArrowRight") adjustSidebarWidth(12);
							}}
						>
							<div className="mx-auto h-full w-px bg-transparent transition-colors group-hover:bg-primary/40 group-focus-visible:bg-primary/60" />
						</div>
					</aside>
				)}
			</div>

			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<AppHeader
					className="relative z-30 border-primary/10 bg-background/95 px-2 sm:px-4"
					leading={
						<>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="hidden size-8 rounded-lg md:inline-flex"
								aria-label={
									sidebarOpen ? t("closeConversations") : t("openConversations")
								}
								onClick={() => updateSidebarOpen({ open: !sidebarOpen })}
							>
								{sidebarOpen ? (
									<PanelLeftCloseIcon className="size-4" aria-hidden="true" />
								) : (
									<PanelLeftOpenIcon className="size-4" aria-hidden="true" />
								)}
							</Button>
							<Sheet
								open={mobileSidebarOpen}
								onOpenChange={setMobileSidebarOpen}
							>
								<SheetTrigger asChild>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="size-8 rounded-lg md:hidden"
										aria-label={t("openConversations")}
									>
										<PanelLeftOpenIcon className="size-4" aria-hidden="true" />
									</Button>
								</SheetTrigger>
								<SheetContent
									side="left"
									className="w-[min(100vw-2rem,22rem)] p-0"
								>
									<SheetHeader className="sr-only">
										<SheetTitle>{t("conversations")}</SheetTitle>
									</SheetHeader>
									<ChatSidebar {...mobileSidebarProps} />
								</SheetContent>
							</Sheet>
							{!sidebarOpen ? (
								<DeodisLogo
									href="/chat"
									className="hidden h-5 w-auto md:block"
									priority
									label="Deodis chat"
								/>
							) : null}
							<DeodisLogo
								href="/chat"
								className="h-5 w-auto md:hidden"
								priority
								label="Deodis chat"
							/>
						</>
					}
					center={agentSelector}
					actions={
						<div className="flex items-center gap-1">
							{!sidebarOpen ? (
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="hidden h-8 gap-1.5 rounded-lg px-3 text-xs font-medium sm:inline-flex"
									aria-label={t("newConversation")}
									onClick={onNewConversation}
								>
									<MessageSquarePlusIcon
										className="size-3.5"
										aria-hidden="true"
									/>
									{t("newConversation")}
								</Button>
							) : null}
							<Button
								type="button"
								size="icon"
								variant="ghost"
								className="size-8 rounded-lg sm:hidden"
								aria-label={t("newConversation")}
								onClick={onNewConversation}
							>
								<MessageSquarePlusIcon className="size-4" aria-hidden="true" />
							</Button>
							{!canChat && canRunSetup ? (
								<Button
									type="button"
									size="sm"
									className="h-8 gap-1.5 rounded-lg px-3 text-xs font-medium"
									onClick={() => setSetupOpen(true)}
								>
									<Settings2Icon className="size-3.5" aria-hidden="true" />
									{t("finishSetup")}
								</Button>
							) : null}
							<Button
								asChild
								variant="ghost"
								size="icon"
								className="size-8 rounded-lg"
								aria-label={t("configureAssistant")}
							>
								<Link
									href={
										selectedAgentId ? `/agents/${selectedAgentId}` : "/agents"
									}
								>
									<Settings2Icon className="size-4" aria-hidden="true" />
								</Link>
							</Button>
						</div>
					}
				/>
				<main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
					{children}
				</main>
			</div>

			<Dialog open={canRunSetup && setupOpen} onOpenChange={setSetupOpen}>
				<DialogContent className="max-h-[calc(100svh-2rem)] max-w-2xl overflow-y-auto">
					<DialogHeader>
						<DialogTitle>{t("finishSetup")}</DialogTitle>
						<DialogDescription>{t("setupDialogDescription")}</DialogDescription>
					</DialogHeader>
					<SetupWizard
						mode="dialog"
						initialAgentId={selectedAgentId}
						onCancelAction={() => setSetupOpen(false)}
						onCompleteAction={() => {
							setSetupOpen(false);
							onSetupComplete?.();
						}}
					/>
				</DialogContent>
			</Dialog>
		</div>
	);
}
