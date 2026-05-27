"use client";

import { useState } from "react";
import { ChevronDownIcon, MessageSquareIcon, WrenchIcon } from "lucide-react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";

import { CitationBlock } from "@/components/chat/citation-block";
import {
	citationsFromMessage,
	parseToolPart,
	reasoningFromMessage,
	textFromMessage,
	toolPartsFromMessage,
	type ChatMessage,
	type ChatMessagePart,
} from "@/components/chat/chat-types";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function ToolPartCard({ part }: { part: ChatMessagePart }) {
	const [open, setOpen] = useState(false);
	const parsed = parseToolPart(part.content);
	const isCall = part.type === "tool-call";
	const body = isCall ? parsed.input : parsed.output;
	const bodyText =
		typeof body === "string" ? body : JSON.stringify(body ?? {}, null, 2);
	const preview =
		typeof body === "string"
			? body.slice(0, 140)
			: JSON.stringify(body ?? {}).slice(0, 140);

	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className="rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-xs"
		>
			<div className="flex items-center gap-2 text-foreground">
				<WrenchIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
				<span className="font-medium">
					{isCall ? "Tool call" : "Tool result"}
				</span>
				<span className="text-muted-foreground">{parsed.toolName ?? "tool"}</span>
				<CollapsibleTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="ml-auto h-6 px-2 text-xs"
					>
						<ChevronDownIcon
							className={cn(
								"size-3 transition-transform",
								open && "rotate-180",
							)}
							aria-hidden="true"
						/>
						{open ? "Hide" : "Details"}
					</Button>
				</CollapsibleTrigger>
			</div>
			{!open && preview ? (
				<p className="mt-1 line-clamp-2 text-muted-foreground">{preview}</p>
			) : null}
			<CollapsibleContent>
				<pre className="mt-2 max-h-72 overflow-auto rounded-md bg-muted/50 p-2 text-[11px] leading-5 text-muted-foreground">
					{bodyText || "(no body)"}
				</pre>
			</CollapsibleContent>
		</Collapsible>
	);
}

interface ChatMessageListProps {
	messages: ChatMessage[];
	sending: boolean;
	loading?: boolean;
	bottomRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatMessageList({
	messages,
	sending,
	loading,
	bottomRef,
}: ChatMessageListProps) {
	if (loading) {
		return (
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
				<Skeleton className="h-20 w-2/3 rounded-2xl" />
				<Skeleton className="ml-auto h-16 w-1/2 rounded-2xl" />
				<Skeleton className="h-24 w-3/4 rounded-2xl" />
			</div>
		);
	}

	if (messages.length === 0) {
		return (
			<div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center py-12">
				<Empty className="border border-dashed border-border/70 bg-background/40">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<MessageSquareIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>Start the conversation</EmptyTitle>
						<EmptyDescription>
							Send a message below. Your assistant can use tools, knowledge, and
							integrations configured for this workspace.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
			{messages.map((message, index) => {
				const content = textFromMessage(message);
				const reasoning = reasoningFromMessage(message);
				const citations = citationsFromMessage(message);
				const isAssistant = message.role === "assistant";

				return (
					<article
						key={message.id}
						className={cn(
							"flex",
							message.role === "user" ? "justify-end" : "justify-start",
						)}
					>
						<div
							className={cn(
								"max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6",
								message.role === "user"
									? "bg-primary text-primary-foreground"
									: "border border-border/70 bg-card",
							)}
						>
							{isAssistant ? (
								<div className="flex flex-col gap-2">
									{reasoning ? (
										<div className="rounded-lg border border-border/70 bg-muted/35 px-3 py-2 text-xs">
											<div className="font-medium text-muted-foreground">
												Thinking
											</div>
											<Streamdown
												plugins={{ code }}
												className="mt-2 text-xs leading-5 text-muted-foreground"
											>
												{reasoning}
											</Streamdown>
										</div>
									) : null}
									{toolPartsFromMessage(message).map((part, partIndex) => (
										<ToolPartCard
											key={`${message.id}-${part.type}-${partIndex}`}
											part={part}
										/>
									))}
									{citations.length > 0 ? (
										<CitationBlock citations={citations} />
									) : null}
									{content || !reasoning ? (
										<Streamdown
											plugins={{ code }}
											caret="block"
											isAnimating={
												sending &&
												index === messages.length - 1 &&
												message.status === "streaming"
											}
											className="text-sm"
										>
											{content || "Thinking..."}
										</Streamdown>
									) : null}
								</div>
							) : (
								content
							)}
						</div>
					</article>
				);
			})}
			<div ref={bottomRef} />
		</div>
	);
}
