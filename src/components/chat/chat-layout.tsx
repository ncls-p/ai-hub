"use client";

import { Link } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import {
	BotIcon,
	MessageSquarePlusIcon,
	PanelLeftCloseIcon,
	PanelLeftOpenIcon,
	Settings2Icon,
	SparklesIcon,
} from "lucide-react";

import { useWorkspaceShell } from "@/components/app-shell";
import { AppHeader } from "@/components/app-header";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import type { ChatAgent, ChatConversation } from "@/components/chat/chat-types";
import { SetupWizard } from "@/components/setup/setup-wizard";
import { WorkspaceSidebarMobileTrigger } from "@/components/workspace-sidebar";
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
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

interface ChatLayoutProps {
	agents: ChatAgent[];
	conversations: ChatConversation[];
	selectedAgent: ChatAgent | null;
	selectedAgentId: string | null;
	activeConversationId: string | null;
	canChat: boolean;
	loadingSidebar?: boolean;
	onSelectAgent: (agentId: string) => void;
	onSelectConversation: (conversationId: string) => void;
	onNewConversation: () => void;
	onRenameConversation?: (conversationId: string, title: string) => void;
	onDeleteConversation?: (conversationId: string) => void;
	onSetupComplete?: () => void;
	children: React.ReactNode;
}

export function ChatLayout({
	agents,
	conversations,
	selectedAgentId,
	activeConversationId,
	canChat,
	loadingSidebar,
	onSelectAgent,
	onSelectConversation,
	onNewConversation,
	onRenameConversation,
	onDeleteConversation,
	onSetupComplete,
	children,
}: ChatLayoutProps) {
	const shell = useWorkspaceShell();
	const [setupOpen, setSetupOpen] = useState(false);
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

	useEffect(() => {
		const stored = window.localStorage.getItem("chat-sidebar-open");
		if (stored) {
			queueMicrotask(() => setSidebarOpen(stored === "true"));
		}
	}, []);

	function updateSidebarOpen(open: boolean) {
		setSidebarOpen(open);
		window.localStorage.setItem("chat-sidebar-open", String(open));
	}

	const sidebarProps = {
		agents,
		conversations,
		activeConversationId,
		loading: loadingSidebar,
		onSelectConversation,
		onNewConversation,
		onRenameConversation,
		onDeleteConversation,
		collapsed: false,
		onCollapsedChange: undefined,
	};
	const desktopSidebarProps = {
		...sidebarProps,
		onCollapsedChange: (collapsed: boolean) => updateSidebarOpen(!collapsed),
	};
	const mobileSidebarProps = {
		...sidebarProps,
		onSelectConversation: (conversationId: string) => {
			onSelectConversation(conversationId);
			setMobileSidebarOpen(false);
		},
	};

	const agentSelector = (
		<div className="flex items-center gap-2">
			<div className="hidden items-center gap-1.5 sm:flex">
				<div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
					<BotIcon className="size-3" aria-hidden="true" />
				</div>
			</div>
			<Select
				value={selectedAgentId ?? undefined}
				onValueChange={onSelectAgent}
			>
				<SelectTrigger
					size="sm"
					className="h-9 min-w-0 max-w-[min(100%,11rem)] flex-1 rounded-xl border-border/50 bg-background/60 px-3 font-medium shadow-sm transition-all duration-200 hover:border-border sm:max-w-60 sm:min-w-48"
					aria-label="Current assistant"
				>
					<SelectValue placeholder="Choose assistant" />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						{agents.map((agent) => (
							<SelectItem key={agent.id} value={agent.id} className="gap-2">
								<div className="flex items-center gap-2">
									<SparklesIcon
										className="size-3.5 text-primary"
										aria-hidden="true"
									/>
									{agent.name}
								</div>
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
			{!canChat ? (
				<Badge
					variant="outline"
					className="hidden shrink-0 items-center gap-1 rounded-lg border-amber-500/30 bg-amber-500/8 px-2 py-0.5 text-[11px] font-medium text-amber-600 sm:inline-flex"
				>
					<Settings2Icon className="size-3" aria-hidden="true" />
					needs setup
				</Badge>
			) : null}
		</div>
	);

	return (
		<div className="flex h-full min-h-0">
			{/* Desktop sidebar with smooth transition */}
			<div
				className="hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] md:block"
				style={{
					width: sidebarOpen ? "20rem" : 0,
					opacity: sidebarOpen ? 1 : 0,
				}}
			>
				{sidebarOpen && (
					<aside className="h-full w-80 border-r border-border/60 bg-background/95 backdrop-blur-xl shadow-sm">
						<ChatSidebar {...desktopSidebarProps} className="w-full" />
					</aside>
				)}
			</div>

			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<AppHeader
					className="px-2 sm:px-4"
					title="Chat"
					subtitle="Conversations"
					leading={
						<>
							<WorkspaceSidebarMobileTrigger shell={shell} />
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="hidden size-8 rounded-lg transition-all duration-200 hover:bg-muted md:inline-flex"
								aria-label={
									sidebarOpen ? "Close conversations" : "Open conversations"
								}
								onClick={() => updateSidebarOpen(!sidebarOpen)}
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
										aria-label="Open conversations"
									>
										<PanelLeftOpenIcon className="size-4" aria-hidden="true" />
									</Button>
								</SheetTrigger>
								<SheetContent
									side="left"
									className="w-[min(100vw-2rem,22rem)] p-0"
								>
									<SheetHeader className="sr-only">
										<SheetTitle>Conversations</SheetTitle>
									</SheetHeader>
									<ChatSidebar {...mobileSidebarProps} />
								</SheetContent>
							</Sheet>
						</>
					}
					center={agentSelector}
					actions={
						<div className="flex items-center gap-1">
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="hidden h-8 gap-1.5 rounded-lg border-border/50 bg-background/60 px-3 text-xs font-medium transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm hover:bg-background active:translate-y-0 sm:inline-flex"
								aria-label="New conversation"
								onClick={onNewConversation}
							>
								<MessageSquarePlusIcon
									className="size-3.5"
									aria-hidden="true"
								/>
								New chat
							</Button>
							<Button
								type="button"
								size="icon"
								variant="ghost"
								className="size-8 rounded-lg sm:hidden"
								aria-label="New conversation"
								onClick={onNewConversation}
							>
								<MessageSquarePlusIcon className="size-4" aria-hidden="true" />
							</Button>
							{!canChat ? (
								<Button
									type="button"
									size="sm"
									className="h-8 gap-1.5 rounded-lg px-3 text-xs font-medium transition-all duration-200 hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-0.5 active:translate-y-0"
									onClick={() => setSetupOpen(true)}
								>
									<Settings2Icon className="size-3.5" aria-hidden="true" />
									Finish setup
								</Button>
							) : null}
							<Button
								asChild
								variant="ghost"
								size="icon"
								className="size-8 rounded-lg transition-all duration-200 hover:bg-muted"
								aria-label="Configure assistant"
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

			<Dialog open={setupOpen} onOpenChange={setSetupOpen}>
				<DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Finish assistant setup</DialogTitle>
						<DialogDescription>
							Connect a model so you can start chatting.
						</DialogDescription>
					</DialogHeader>
					<SetupWizard
						mode="dialog"
						initialAgentId={selectedAgentId}
						onCancel={() => setSetupOpen(false)}
						onComplete={() => {
							setSetupOpen(false);
							onSetupComplete?.();
						}}
					/>
				</DialogContent>
			</Dialog>
		</div>
	);
}
