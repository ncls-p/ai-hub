"use client";

import Link from "next/link";
import { useState } from "react";
import { PanelLeftIcon, PlusIcon, Settings2Icon } from "lucide-react";

import { WorkspaceMenuButton } from "@/components/app-shell";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import type { ChatAgent, ChatConversation } from "@/components/chat/chat-types";
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
	const [setupOpen, setSetupOpen] = useState(false);

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

	return (
		<div className="flex h-full min-h-0 bg-muted/20">
			<main className="flex min-h-0 flex-1 flex-col">
				<header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-background/85 px-3 shadow-sm shadow-foreground/5 backdrop-blur-xl sm:px-4">
					<div className="flex min-w-0 flex-1 items-center gap-2">
						<WorkspaceMenuButton />
						<Sheet>
							<SheetTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="rounded-full border border-border/60 bg-background/80 shadow-sm hover:bg-muted/80"
									aria-label="Open conversations"
								>
									<PanelLeftIcon aria-hidden="true" />
								</Button>
							</SheetTrigger>
							<SheetContent side="left" className="w-[min(100vw-2rem,22rem)] p-0">
								<SheetHeader className="sr-only">
									<SheetTitle>Conversations</SheetTitle>
								</SheetHeader>
								<ChatSidebar
									{...sidebarProps}
									showThemeToggle
								/>
							</SheetContent>
						</Sheet>
						<Select
							value={selectedAgentId ?? undefined}
							onValueChange={onSelectAgent}
						>
							<SelectTrigger
								size="sm"
								className="h-9 max-w-60 min-w-0 flex-1 rounded-full border-border/60 bg-background/80 px-3 font-semibold shadow-sm sm:min-w-44"
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
						{canChat ? null : <Badge variant="outline">needs setup</Badge>}
					</div>
					<div className="flex shrink-0 items-center gap-1">
						<Button
							type="button"
							size="icon"
							variant="ghost"
							className="rounded-full border border-transparent hover:border-border/60 hover:bg-background/80"
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
							className="rounded-full border border-transparent hover:border-border/60 hover:bg-background/80"
							aria-label="Configure assistant"
						>
							<Link href={selectedAgentId ? `/agents/${selectedAgentId}` : "/agents"}>
								<Settings2Icon aria-hidden="true" />
							</Link>
						</Button>
					</div>
				</header>
				{children}
			</main>

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
