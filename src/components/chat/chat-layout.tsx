"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
	PanelLeftOpenIcon,
	PlusIcon,
	Settings2Icon,
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
		<>
			<Select
				value={selectedAgentId ?? undefined}
				onValueChange={onSelectAgent}
			>
							<SelectTrigger
								size="sm"
								className="h-9 min-w-0 max-w-[min(100%,11rem)] flex-1 rounded-lg border-border/60 bg-background/80 px-2 font-semibold shadow-sm sm:max-w-60 sm:min-w-44 sm:px-3"
								aria-label="Current assistant"
							>
					<SelectValue placeholder="Choose assistant" />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						{agents.map((agent) => (
							<SelectItem key={agent.id} value={agent.id}>
								{agent.name}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
			{canChat ? null : (
				<Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
					needs setup
				</Badge>
			)}
		</>
	);

	return (
		<div className="flex h-full min-h-0">
			{sidebarOpen ? (
				<aside className="hidden h-full min-h-0 w-80 shrink-0 border-r border-border/70 bg-background/85 shadow-sm md:flex">
					<ChatSidebar
						{...desktopSidebarProps}
						className="w-full"
					/>
				</aside>
			) : null}
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<AppHeader
					className="px-2 sm:px-4"
					title="Chat"
					subtitle="Conversations"
					leading={
						<>
							<WorkspaceSidebarMobileTrigger shell={shell} />
							{sidebarOpen ? null : (
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="hidden md:inline-flex"
									aria-label="Open conversations"
									onClick={() => updateSidebarOpen(true)}
								>
									<PanelLeftOpenIcon aria-hidden="true" />
								</Button>
							)}
							<Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
								<SheetTrigger asChild>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="md:hidden"
										aria-label="Open conversations"
									>
										<PanelLeftOpenIcon aria-hidden="true" />
									</Button>
								</SheetTrigger>
								<SheetContent side="left" className="w-[min(100vw-2rem,22rem)] p-0">
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
						<>
							<Button
								type="button"
								size="icon"
								variant="ghost"
								aria-label="New conversation"
								onClick={onNewConversation}
							>
								<PlusIcon aria-hidden="true" />
							</Button>
							{!canChat ? (
								<Button
									type="button"
									size="sm"
									onClick={() => setSetupOpen(true)}
								>
									<Settings2Icon data-icon="inline-start" aria-hidden="true" />
									Finish setup
								</Button>
							) : null}
							<Button
								asChild
								variant="ghost"
								size="icon"
								aria-label="Configure assistant"
							>
								<Link href={selectedAgentId ? `/agents/${selectedAgentId}` : "/agents"}>
									<Settings2Icon aria-hidden="true" />
								</Link>
							</Button>
						</>
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
