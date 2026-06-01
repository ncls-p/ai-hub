"use client";

import { memo, useState } from "react";
import {
	BrainIcon,
	CheckCircle2Icon,
	CheckIcon,
	ChevronDownIcon,
	ClockIcon,
	MoreHorizontalIcon,
	PencilIcon,
	RefreshCcwIcon,
	ShieldAlertIcon,
	SparklesIcon,
	Trash2Icon,
	XCircleIcon,
	XIcon,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";

import { CitationBlock } from "@/components/chat/citation-block";
import {
	citationsFromMessage,
	getToolStatus,
	parseToolPart,
	renderablePartsFromMessage,
	textFromMessage,
	toolNameMatches,
	type ChatMessage,
	type ChatMessagePart,
	type PendingToolApproval,
} from "@/components/chat/chat-types";
import { summarizeToolInput } from "@/components/chat/tool-approval-banner";
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

function stringifyForMatch(value: unknown) {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function formatToolName(toolName: string | undefined) {
	if (!toolName) return "Tool";
	const withoutPrefix = toolName.replace(/^mcp_[0-9a-f_]{36,}_(.+)$/i, "$1");
	return withoutPrefix
		.replace(/__+/g, " ")
		.replace(/_/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function summarizeToolBody(
	toolName: string | undefined,
	body: unknown,
	isCall: boolean,
) {
	if (isCall) return summarizeToolInput(formatToolName(toolName), body);
	if (body === null || body === undefined) return "The tool finished.";
	if (typeof body === "string") return body.slice(0, 180);
	if (Array.isArray(body))
		return `Returned ${body.length} item${body.length === 1 ? "" : "s"}.`;
	if (typeof body === "object") {
		const record = body as Record<string, unknown>;
		if (typeof record.text === "string") return record.text.slice(0, 180);
		if (typeof record.content === "string") return record.content.slice(0, 180);
		const keys = Object.keys(record);
		return keys.length > 0
			? `Returned ${keys.slice(0, 3).join(", ")}${keys.length > 3 ? "…" : ""}.`
			: "The tool finished.";
	}
	return String(body).slice(0, 180);
}

function toolPartMatchesApproval(
	part: ChatMessagePart,
	pendingApproval: PendingToolApproval | null | undefined,
) {
	if (!pendingApproval || part.type !== "tool-call") return false;
	const parsed = parseToolPart(part.content);
	return (
		toolNameMatches(parsed.toolName, pendingApproval.toolName) &&
		(parsed.input === undefined ||
			stringifyForMatch(pendingApproval.input) ===
				stringifyForMatch(parsed.input))
	);
}

function PendingApprovalCard({
	pendingApproval,
	onApprove,
	onReject,
}: {
	pendingApproval: PendingToolApproval;
	onApprove?: (approval: PendingToolApproval) => void;
	onReject?: (approval: PendingToolApproval) => void;
}) {
	const friendlyName = formatToolName(pendingApproval.toolName);
	const summary = summarizeToolInput(friendlyName, pendingApproval.input);

	return (
		<div className="overflow-hidden rounded-xl border border-warning/45 bg-warning/5 text-xs shadow-sm">
			<div className="flex items-start gap-3 px-3 py-2.5">
				<div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-warning/35 bg-warning/15 text-warning">
					<ShieldAlertIcon className="size-4" aria-hidden="true" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-medium text-foreground">Needs approval</span>
						<span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-4 text-muted-foreground">
							{friendlyName}
						</span>
					</div>
					<p className="mt-1 line-clamp-2 text-muted-foreground">{summary}</p>
				</div>
			</div>
			<div className="border-t border-warning/25 bg-warning/10 px-3 py-2.5">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-xs text-foreground">
						The assistant is waiting before running this action.
					</p>
					<div className="flex shrink-0 justify-end gap-2">
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="h-8 px-3 text-xs"
							onClick={() => onReject?.(pendingApproval)}
						>
							<XIcon data-icon="inline-start" aria-hidden="true" />
							Reject
						</Button>
						<Button
							type="button"
							size="sm"
							className="h-8 px-3 text-xs"
							onClick={() => onApprove?.(pendingApproval)}
						>
							<CheckIcon data-icon="inline-start" aria-hidden="true" />
							Approve
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

function ToolPartCard({
	part,
	approval,
	onApprove,
	onReject,
}: {
	part: ChatMessagePart;
	approval?: PendingToolApproval;
	onApprove?: (approval: PendingToolApproval) => void;
	onReject?: (approval: PendingToolApproval) => void;
}) {
	const [open, setOpen] = useState(false);
	const parsed = parseToolPart(part.content);
	const friendlyName = formatToolName(parsed.toolName);
	const status = getToolStatus(parsed);
	const hasResult = parsed.output !== undefined;
	const approvalMatches = Boolean(approval);

	// Build a concise summary line
	let summaryText = "";
	if (status === "pending") {
		summaryText = summarizeToolInput(friendlyName, parsed.input);
	} else if (hasResult) {
		summaryText = summarizeToolBody(parsed.toolName, parsed.output, false);
	}

	// Determine icon and colors based on status
	let StatusIcon: React.ComponentType<{ className?: string }>;
	let iconBgClass: string;
	if (status === "error") {
		StatusIcon = XCircleIcon;
		iconBgClass = "border-red-400/30 bg-red-400/10 text-red-500";
	} else if (approvalMatches) {
		StatusIcon = ShieldAlertIcon;
		iconBgClass = "border-amber-400/30 bg-amber-400/15 text-amber-500";
	} else if (status === "pending") {
		StatusIcon = ClockIcon;
		iconBgClass = "border-blue-400/30 bg-blue-400/10 text-blue-500";
	} else {
		StatusIcon = CheckCircle2Icon;
		iconBgClass = "border-emerald-400/30 bg-emerald-400/10 text-emerald-500";
	}

	// For expanded view: show input and output
	const inputText =
		parsed.input != null
			? typeof parsed.input === "string"
				? parsed.input
				: JSON.stringify(parsed.input, null, 2)
			: "";
	const outputText =
		parsed.output != null
			? typeof parsed.output === "string"
				? parsed.output
				: JSON.stringify(parsed.output, null, 2)
			: "";

	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className={cn(
				"group/tool overflow-hidden rounded-lg border text-[11px] transition-colors",
				approvalMatches
					? "border-warning/30 bg-warning/[0.04]"
					: "border-border/40 bg-muted/[0.3] hover:bg-muted/[0.45]",
			)}
		>
			<div className="flex items-center gap-2 px-2.5 py-1.5">
				<div
					className={cn(
						"flex size-5 shrink-0 items-center justify-center rounded border",
						iconBgClass,
					)}
				>
					<StatusIcon className="size-3" aria-hidden="true" />
				</div>
				<span className="shrink-0 font-medium text-foreground/80">
					{friendlyName}
				</span>
				{summaryText ? (
					<span className="truncate text-muted-foreground">
						· {summaryText}
					</span>
				) : null}
				<CollapsibleTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="ml-auto h-5 shrink-0 px-1.5 text-[11px] opacity-0 group-hover/tool:opacity-100"
					>
						<ChevronDownIcon
							className={cn(
								"size-3 transition-transform",
								open && "rotate-180",
							)}
							aria-hidden="true"
						/>
					</Button>
				</CollapsibleTrigger>
			</div>
			{approval ? (
				<div className="border-t border-warning/20 bg-warning/[0.06] px-3 py-2">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<p className="text-[11px] text-muted-foreground">
							Waiting for approval before running this action.
						</p>
						<div className="flex shrink-0 justify-end gap-1.5">
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="h-7 px-2.5 text-[11px]"
								onClick={() => onReject?.(approval)}
							>
								<XIcon className="size-3" aria-hidden="true" />
								Reject
							</Button>
							<Button
								type="button"
								size="sm"
								className="h-7 px-2.5 text-[11px]"
								onClick={() => onApprove?.(approval)}
							>
								<CheckIcon className="size-3" aria-hidden="true" />
								Approve
							</Button>
						</div>
					</div>
				</div>
			) : null}
			<CollapsibleContent>
				<div className="border-t border-border/30 bg-muted/20 px-3 py-2">
					{inputText ? (
						<div className="mb-2">
							<div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
								Input
							</div>
							<pre className="max-h-40 overflow-auto rounded bg-background/60 p-2 leading-4 text-[11px] text-muted-foreground">
								{inputText}
							</pre>
						</div>
					) : null}
					{outputText ? (
						<div>
							<div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
								Output
							</div>
							<pre className="max-h-60 overflow-auto rounded bg-background/60 p-2 leading-4 text-[11px] text-muted-foreground">
								{outputText}
							</pre>
						</div>
					) : null}
				</div>
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
			className="overflow-hidden rounded-xl border border-border/50 bg-muted/35 text-xs"
		>
			<div className="flex items-start gap-3 px-3 py-2.5">
				<div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/70 text-muted-foreground">
					<BrainIcon className="size-4" aria-hidden="true" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="font-medium text-foreground">
							Assistant is reasoning
						</span>
						<span className="size-1.5 rounded-full bg-primary/70 animate-pulse" />
					</div>
					{preview ? (
						<p className="mt-1 line-clamp-2 text-muted-foreground">{preview}</p>
					) : null}
				</div>
				<CollapsibleTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-7 shrink-0 px-2 text-xs"
					>
						<ChevronDownIcon
							className={cn(
								"size-3 transition-transform",
								open && "rotate-180",
							)}
							aria-hidden="true"
						/>
						{open ? "Hide" : "Notes"}
					</Button>
				</CollapsibleTrigger>
			</div>
			<CollapsibleContent>
				<Streamdown
					plugins={{ code }}
					className="border-t border-border/50 bg-background/50 px-3 py-2.5 text-xs leading-5 text-muted-foreground"
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
	pendingApprovals,
	onApproveTool,
	onRejectTool,
}: {
	message: ChatMessage;
	isEditing: boolean;
	editingContent: string;
	isSaving: boolean;
	isAnimating: boolean;
	onEditingContentChange?: (content: string) => void;
	onCancelEdit?: () => void;
	onSaveEdit?: () => void;
	pendingApprovals: PendingToolApproval[];
	onApproveTool?: (approval: PendingToolApproval) => void;
	onRejectTool?: (approval: PendingToolApproval) => void;
}) {
	const content = textFromMessage(message);
	const citations = citationsFromMessage(message);
	const isAssistant = message.role === "assistant";
	const renderableParts = renderablePartsFromMessage(message).filter(
		(part) => part.type !== "text" || part.content,
	);
	const approvalByPartIndex = new Map<number, PendingToolApproval>();
	const matchedApprovalIds = new Set<string>();
	if (message.status === "streaming") {
		for (
			let partIndex = renderableParts.length - 1;
			partIndex >= 0;
			partIndex -= 1
		) {
			const part = renderableParts[partIndex];
			if (part.type !== "tool-call") continue;
			const approval = pendingApprovals.find(
				(item) =>
					!matchedApprovalIds.has(item.invocationId) &&
					toolPartMatchesApproval(part, item),
			);
			if (!approval) continue;
			approvalByPartIndex.set(partIndex, approval);
			matchedApprovalIds.add(approval.invocationId);
		}
	}
	const standaloneApprovals =
		message.status === "streaming"
			? pendingApprovals.filter(
					(approval) => !matchedApprovalIds.has(approval.invocationId),
				)
			: [];

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
			{standaloneApprovals.length > 0
				? standaloneApprovals.map((approval) => (
						<PendingApprovalCard
							key={approval.invocationId}
							pendingApproval={approval}
							onApprove={onApproveTool}
							onReject={onRejectTool}
						/>
					))
				: null}
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
								approval={approvalByPartIndex.get(partIndex)}
								onApprove={onApproveTool}
								onReject={onRejectTool}
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
			) : standaloneApprovals.length === 0 ? (
				<Streamdown
					plugins={{ code }}
					caret="block"
					isAnimating={isAnimating}
					className="text-sm"
				>
					{content || "Thinking…"}
				</Streamdown>
			) : null}
		</div>
	);
});

interface ChatMessageListProps {
	messages: ChatMessage[];
	sending: boolean;
	loading?: boolean;
	bottomRef: React.RefObject<HTMLDivElement | null>;
	onEditMessage?: (
		message: ChatMessage,
		content: string,
	) => Promise<void> | void;
	onDeleteMessage?: (message: ChatMessage) => Promise<void> | void;
	onResendMessage?: (message: ChatMessage) => Promise<void> | void;
	pendingApprovals?: PendingToolApproval[];
	onApproveTool?: (approval: PendingToolApproval) => void;
	onRejectTool?: (approval: PendingToolApproval) => void;
}

export function ChatMessageList({
	messages,
	sending,
	loading,
	bottomRef,
	onEditMessage,
	onDeleteMessage,
	onResendMessage,
	pendingApprovals = [],
	onApproveTool,
	onRejectTool,
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
				const isLast = index === messages.length - 1;
				const hasActions = canEdit || canDelete || canResend;
				const actionsProps = {
					message,
					sending,
					canEdit,
					canDelete,
					canResend,
					onEdit: () => {
						setEditingMessageId(message.id);
						setEditingContent(content);
					},
					onDelete: () => void onDeleteMessage?.(message),
					onResend: () => void onResendMessage?.(message),
				};

				return (
					<article
						key={message.id}
						className={cn(
							"group/message flex gap-3 animate-in-up",
							message.role === "user" ? "justify-end" : "justify-start",
						)}
						style={{ animationDelay: isLast ? "0s" : undefined }}
					>
						{/* Assistant avatar */}
						{message.role !== "user" && (
							<div className="mt-1.5 flex size-7 shrink-0 items-center justify-center">
								<div
									className={cn(
										"flex size-6 items-center justify-center rounded-full text-[10px] font-bold shadow-sm",
										isAssistant
											? "bg-primary/15 text-primary ring-1 ring-primary/20"
											: "bg-muted text-muted-foreground",
									)}
								>
									{isAssistant ? (
										<SparklesIcon className="size-3" aria-hidden="true" />
									) : (
										"S"
									)}
								</div>
							</div>
						)}

						<div
							className={cn(
								"flex max-w-[85%] flex-col transition-all duration-200",
								isLast && isAnimating && "animate-in-up",
							)}
						>
							{/* Message bubble */}
							<div
								className={cn(
									"transition-all duration-200",
									message.role === "user"
										? "msg-bubble--user"
										: "msg-bubble--assistant",
									isEditing && "ring-2 ring-primary/25",
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
									pendingApprovals={pendingApprovals}
									onApproveTool={onApproveTool}
									onRejectTool={onRejectTool}
								/>
							</div>

							{/* Timestamp + status */}
							{message.createdAt && (
								<div
									className={cn(
										"mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground/50",
										isUser ? "justify-end" : "justify-start",
									)}
								>
									<span>
										{new Date(message.createdAt).toLocaleTimeString([], {
											hour: "2-digit",
											minute: "2-digit",
										})}
									</span>
									{message.status === "streaming" && (
										<span className="flex items-center gap-1">
											<span className="size-1 rounded-full bg-primary/60 animate-pulse" />
											<span>typing</span>
										</span>
									)}
								</div>
							)}
						</div>

						{/* Message actions */}
						{hasActions && (
							<div
								className={cn(
									"flex shrink-0 items-center",
									isUser ? "self-end" : "self-start mt-1.5",
								)}
							>
								<MessageActions {...actionsProps} />
							</div>
						)}

						{/* User avatar */}
						{message.role === "user" && (
							<div className="mt-1.5 flex size-7 shrink-0 items-center justify-center">
								<div className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-1 ring-border/50">
									U
								</div>
							</div>
						)}
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
