"use client";

import Link from "next/link";
import { useState } from "react";
import { PanelLeftIcon, Settings2Icon } from "lucide-react";

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
	onSetupComplete?: () => void;
	children: React.ReactNode;
}

export function ChatLayout({
	agents,
	conversations,
	selectedAgent,
	selectedAgentId,
	activeConversationId,
	canChat,
	loadingSidebar,
	onSelectAgent,
	onSelectConversation,
	onNewConversation,
	onSetupComplete,
	children,
}: ChatLayoutProps) {
	const [setupOpen, setSetupOpen] = useState(false);

	const sidebarProps = {
		agents,
		conversations,
		selectedAgentId,
		activeConversationId,
		canChat,
		loading: loadingSidebar,
		onSelectAgent,
		onSelectConversation,
		onNewConversation,
	};

	return (
		<div className="grid h-full min-h-0 bg-background lg:grid-cols-[18rem_1fr]">
			<aside className="hidden min-h-0 border-r border-border/70 bg-card/40 lg:flex lg:flex-col">
				<ChatSidebar {...sidebarProps} />
			</aside>

			<main className="flex min-h-0 flex-col">
				<header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
					<div className="flex min-w-0 items-center gap-2">
						<Sheet>
							<SheetTrigger asChild>
								<Button
									type="button"
									variant="outline"
									size="icon"
									className="lg:hidden"
									aria-label="Open chat sidebar"
								>
									<PanelLeftIcon aria-hidden="true" />
								</Button>
							</SheetTrigger>
							<SheetContent side="left" className="w-72 p-0">
								<SheetHeader className="sr-only">
									<SheetTitle>Chat navigation</SheetTitle>
								</SheetHeader>
								<ChatSidebar {...sidebarProps} showThemeToggle />
							</SheetContent>
						</Sheet>
						<div className="min-w-0">
							<div className="flex items-center gap-2">
								<h1 className="truncate font-semibold">
									{selectedAgent?.name ?? "Chat"}
								</h1>
								{canChat ? (
									<Badge variant="secondary">configured</Badge>
								) : (
									<Badge variant="outline">needs setup</Badge>
								)}
							</div>
							<p className="truncate text-xs text-muted-foreground">
								{selectedAgent?.description ||
									"Ask your configured assistant anything."}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
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
						<Button asChild variant="outline" size="sm">
							<Link href="/agents">Assistants</Link>
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
