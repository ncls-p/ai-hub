"use client";

import Link from "next/link";
import { BotIcon, MessageSquareIcon, PlusIcon, SparklesIcon } from "lucide-react";

import type { ChatAgent, ChatConversation } from "@/components/chat/chat-types";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ChatSidebarProps {
	agents: ChatAgent[];
	conversations: ChatConversation[];
	selectedAgentId: string | null;
	activeConversationId: string | null;
	canChat: boolean;
	loading?: boolean;
	onSelectAgent: (agentId: string) => void;
	onSelectConversation: (conversationId: string) => void;
	onNewConversation: () => void;
	className?: string;
	showThemeToggle?: boolean;
}

export function ChatSidebar({
	agents,
	conversations,
	selectedAgentId,
	activeConversationId,
	canChat,
	loading,
	onSelectAgent,
	onSelectConversation,
	onNewConversation,
	className,
	showThemeToggle,
}: ChatSidebarProps) {
	return (
		<div className={cn("flex h-full min-h-0 flex-col", className)}>
			<div className="flex items-center justify-between border-b border-border/70 p-3">
				<div className="flex items-center gap-2 text-sm font-medium">
					<SparklesIcon aria-hidden="true" />
					Chat
				</div>
				<Button type="button" size="sm" variant="outline" onClick={onNewConversation}>
					<PlusIcon data-icon="inline-start" aria-hidden="true" />
					New
				</Button>
			</div>

			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
				<div className="flex flex-col gap-2">
					<div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Agents
					</div>
					{loading ? (
						<div className="flex flex-col gap-2">
							<Skeleton className="h-12 w-full rounded-xl" />
							<Skeleton className="h-12 w-full rounded-xl" />
						</div>
					) : agents.length === 0 ? (
						<Empty className="border border-dashed border-border/70 py-6">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<BotIcon aria-hidden="true" />
								</EmptyMedia>
								<EmptyTitle className="text-sm">No assistants</EmptyTitle>
								<EmptyDescription className="text-xs">
									Create an assistant to start chatting.
								</EmptyDescription>
							</EmptyHeader>
							<EmptyContent>
								<Button asChild size="sm" variant="outline">
									<Link href="/agents">Create assistant</Link>
								</Button>
							</EmptyContent>
						</Empty>
					) : (
						agents.map((agent) => (
							<button
								key={agent.id}
								type="button"
								onClick={() => onSelectAgent(agent.id)}
								className={cn(
									"rounded-xl border border-transparent px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
									selectedAgentId === agent.id &&
										"border-border bg-card shadow-sm",
								)}
							>
								<span className="block font-medium">{agent.name}</span>
								<span className="block truncate text-xs text-muted-foreground">
									{agent.id === selectedAgentId && !canChat
										? "Needs configuration"
										: "Agent workspace"}
								</span>
							</button>
						))
					)}
				</div>

				<div className="flex flex-col gap-2">
					<div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Conversations
					</div>
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
							<button
								key={conversation.id}
								type="button"
								onClick={() => onSelectConversation(conversation.id)}
								className={cn(
									"rounded-xl border border-transparent px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
									activeConversationId === conversation.id &&
										"border-border bg-card shadow-sm",
								)}
							>
								<span className="block truncate font-medium">
									{conversation.title}
								</span>
								<span className="block text-xs text-muted-foreground">
									{new Date(conversation.updatedAt).toLocaleDateString()}
								</span>
							</button>
						))
					)}
				</div>
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
