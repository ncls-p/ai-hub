"use client";

import { memo, useState } from "react";
import {
	CheckIcon,
	ChevronDownIcon,
	MoreHorizontalIcon,
	PencilIcon,
	RefreshCcwIcon,
	Trash2Icon,
	WrenchIcon,
	XIcon,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";

import { CitationBlock } from "@/components/chat/citation-block";
import {
	citationsFromMessage,
	parseToolPart,
	renderablePartsFromMessage,
	textFromMessage,
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
			className="rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs shadow-sm"
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

function ThinkingPart({ part }: { part: ChatMessagePart }) {
	const [open, setOpen] = useState(false);
	const preview = part.content.trim().slice(0, 180);

	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className="rounded-xl border border-border/50 bg-muted/45 px-3 py-2 text-xs"
		>
			<div className="flex items-center gap-2 text-muted-foreground">
				<span className="font-medium">Thinking</span>
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
						{open ? "Hide" : "Show"}
					</Button>
				</CollapsibleTrigger>
			</div>
			{!open && preview ? (
				<p className="mt-1 line-clamp-2 text-muted-foreground">{preview}</p>
			) : null}
			<CollapsibleContent>
				<Streamdown
					plugins={{ code }}
					className="mt-2 text-xs leading-5 text-muted-foreground"
				>
					{part.content}
				</Streamdown>
			</CollapsibleContent>
		</Collapsible>
	);
}

const MessageContent = memo(function MessageContent({
	message,
	isEditing,
	editingContent,
	isSaving,
	isAnimating,
	onEditingContentChange,
	onCancelEdit,
	onSaveEdit,
}: {
	message: ChatMessage;
	isEditing: boolean;
	editingContent: string;
	isSaving: boolean;
	isAnimating: boolean;
	onEditingContentChange?: (content: string) => void;
	onCancelEdit?: () => void;
	onSaveEdit?: () => void;
}) {
	const content = textFromMessage(message);
	const citations = citationsFromMessage(message);
	const isAssistant = message.role === "assistant";
	const renderableParts = renderablePartsFromMessage(message).filter(
		(part) => part.type !== "text" || part.content,
	);

	if (isEditing) {
		return (
			<div className="flex min-w-72 flex-col gap-2">
				<Textarea
					value={editingContent}
					onChange={(event) => onEditingContentChange?.(event.target.value)}
					rows={3}
					disabled={isSaving}
					className="min-h-24 bg-background/80 text-foreground"
				/>
				<div className="flex justify-end gap-2">
					<Button
						type="button"
						size="sm"
						variant="ghost"
						disabled={isSaving}
						onClick={onCancelEdit}
					>
						<XIcon data-icon="inline-start" aria-hidden="true" />
						Cancel
					</Button>
					<Button
						type="button"
						size="sm"
						disabled={isSaving || !editingContent.trim()}
						onClick={onSaveEdit}
					>
						<CheckIcon data-icon="inline-start" aria-hidden="true" />
						Save
					</Button>
				</div>
			</div>
		);
	}

	if (!isAssistant) {
		return content;
	}

	return (
		<div className="flex flex-col gap-2">
			{citations.length > 0 ? <CitationBlock citations={citations} /> : null}
			{renderableParts.length > 0 ? (
				renderableParts.map((part, partIndex) => {
					if (part.type === "reasoning") {
						return (
							<ThinkingPart
								key={`${message.id}-${part.type}-${partIndex}`}
								part={part}
							/>
						);
					}
					if (part.type === "tool-call" || part.type === "tool-result") {
						return (
							<ToolPartCard
								key={`${message.id}-${part.type}-${partIndex}`}
								part={part}
							/>
						);
					}
					return (
						<Streamdown
							key={`${message.id}-${part.type}-${partIndex}`}
							plugins={{ code }}
							caret="block"
							isAnimating={isAnimating}
							className="text-sm"
						>
							{part.content}
						</Streamdown>
					);
				})
			) : (
				<Streamdown
					plugins={{ code }}
					caret="block"
					isAnimating={isAnimating}
					className="text-sm"
				>
					{content || "Thinking..."}
				</Streamdown>
			)}
		</div>
	);
});

interface ChatMessageListProps {
	messages: ChatMessage[];
	sending: boolean;
	loading?: boolean;
	bottomRef: React.RefObject<HTMLDivElement | null>;
	onEditMessage?: (message: ChatMessage, content: string) => Promise<void> | void;
	onDeleteMessage?: (message: ChatMessage) => Promise<void> | void;
	onResendMessage?: (message: ChatMessage) => Promise<void> | void;
}

export function ChatMessageList({
	messages,
	sending,
	loading,
	bottomRef,
	onEditMessage,
	onDeleteMessage,
	onResendMessage,
}: ChatMessageListProps) {
	const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
	const [editingContent, setEditingContent] = useState("");
	const [savingMessageId, setSavingMessageId] = useState<string | null>(null);

	if (loading) {
		return (
			<div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
				<Skeleton className="h-20 w-2/3 rounded-2xl" />
				<Skeleton className="ml-auto h-16 w-1/2 rounded-2xl" />
				<Skeleton className="h-24 w-3/4 rounded-2xl" />
			</div>
		);
	}

	if (messages.length === 0) {
		return <div ref={bottomRef} />;
	}

	return (
		<div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
			{messages.map((message, index) => {
				const content = textFromMessage(message);
				const isAssistant = message.role === "assistant";
				const isUser = message.role === "user";
				const canEdit = Boolean(onEditMessage) && (isUser || isAssistant);
				const canDelete = Boolean(onDeleteMessage);
				const canResend = Boolean(onResendMessage) && isUser;
				const isEditing = editingMessageId === message.id;
				const isAnimating =
					sending &&
					index === messages.length - 1 &&
					message.status === "streaming";

				return (
					<article
						key={message.id}
						className={cn(
							"group/message flex gap-2",
							message.role === "user" ? "justify-end" : "justify-start",
						)}
					>
						{message.role !== "user" && (canEdit || canDelete) ? (
							<MessageActions
								message={message}
								sending={sending}
								canEdit={canEdit}
								canDelete={canDelete}
								canResend={canResend}
								onEdit={() => {
									setEditingMessageId(message.id);
									setEditingContent(content);
								}}
								onDelete={() => void onDeleteMessage?.(message)}
								onResend={() => void onResendMessage?.(message)}
							/>
						) : null}
						<div
							className={cn(
								"max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm",
								message.role === "user"
									? "bg-primary text-primary-foreground shadow-primary/10"
									: "border border-border/60 bg-card/90 shadow-foreground/5 backdrop-blur-sm",
							)}
						>
							<MessageContent
								message={message}
								isEditing={isEditing}
								editingContent={isEditing ? editingContent : ""}
								isSaving={savingMessageId === message.id}
								isAnimating={isAnimating}
								onEditingContentChange={
									isEditing ? setEditingContent : undefined
								}
								onCancelEdit={
									isEditing
										? () => {
												setEditingMessageId(null);
												setEditingContent("");
											}
										: undefined
								}
								onSaveEdit={
									isEditing
										? async () => {
												setSavingMessageId(message.id);
												try {
													await onEditMessage?.(
														message,
														editingContent.trim(),
													);
													setEditingMessageId(null);
													setEditingContent("");
												} finally {
													setSavingMessageId(null);
												}
											}
										: undefined
								}
							/>
						</div>
						{message.role === "user" && (canEdit || canDelete || canResend) ? (
							<MessageActions
								message={message}
								sending={sending}
								canEdit={canEdit}
								canDelete={canDelete}
								canResend={canResend}
								onEdit={() => {
									setEditingMessageId(message.id);
									setEditingContent(content);
								}}
								onDelete={() => void onDeleteMessage?.(message)}
								onResend={() => void onResendMessage?.(message)}
							/>
						) : null}
					</article>
				);
			})}
			<div ref={bottomRef} />
		</div>
	);
}

function MessageActions({
	sending,
	canEdit,
	canDelete,
	canResend,
	onEdit,
	onDelete,
	onResend,
}: {
	message: ChatMessage;
	sending: boolean;
	canEdit: boolean;
	canDelete: boolean;
	canResend: boolean;
	onEdit: () => void;
	onDelete: () => void;
	onResend: () => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					size="icon-sm"
					variant="ghost"
					aria-label="Message actions"
					className="mt-1 opacity-100 transition-opacity md:opacity-0 md:group-hover/message:opacity-100 data-open:opacity-100"
					disabled={sending}
				>
					<MoreHorizontalIcon aria-hidden="true" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuGroup>
					{canResend ? (
						<DropdownMenuItem onSelect={onResend}>
							<RefreshCcwIcon aria-hidden="true" />
							Resend
						</DropdownMenuItem>
					) : null}
					{canEdit ? (
						<DropdownMenuItem onSelect={onEdit}>
							<PencilIcon aria-hidden="true" />
							Edit
						</DropdownMenuItem>
					) : null}
					{canDelete ? (
						<DropdownMenuItem variant="destructive" onSelect={onDelete}>
							<Trash2Icon aria-hidden="true" />
							Delete
						</DropdownMenuItem>
					) : null}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
