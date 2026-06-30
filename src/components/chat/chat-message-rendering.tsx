"use client";

import dynamic from "next/dynamic";
import { memo, useMemo, useState } from "react";
import type * as React from "react";
import { createPortal } from "react-dom";
import {
	BrainIcon,
	CheckCircle2Icon,
	CheckIcon,
	ChevronDownIcon,
	ClockIcon,
	ShieldAlertIcon,
	XCircleIcon,
	XIcon,
} from "lucide-react";
import {
	Streamdown,
	type LinkSafetyConfig,
	type LinkSafetyModalProps,
} from "streamdown";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";

import { CitationBlock } from "@/components/chat/citation-block";
import {
	citationsFromMessage,
	getToolStatus,
	parseToolPart,
	renderablePartsFromMessage,
	textFromMessage,
	type ChatMessage,
	type ChatMessagePart,
	type PendingToolApproval,
} from "@/components/chat/chat-types";
import {
	ChatFileAttachmentCard,
	ChatImageAttachmentCard,
	CodeWorkspaceArtifactCard,
	CodeWorkspaceArtifactSummary,
	GitHubPublishResultCard,
	isCodeWorkspaceArtifactOutput,
	type WorkspaceArtifactDisplay,
} from "@/components/chat/code-workspace-artifact-card";
import type { RichEditorProps } from "@/components/chat/rich-editor";
import { summarizeToolInput } from "@/components/chat/tool-approval-banner";
import {
	chatFileAttachmentFromPartContent,
	chatImageAttachmentFromPartContent,
	codeSandboxInputFromInputText,
	codeSandboxInputFromUnknown,
	codeSandboxOutputFromUnknown,
	codeWorkspaceArtifactFromPartContent,
	formatToolName,
	htmlArtifactFromInputText,
	htmlArtifactFromToolInput,
	isCodeSandboxToolName,
	isGitHubPublishOutput,
	isHtmlArtifactOutput,
	summarizeToolBody,
	toolPartMatchesApproval,
} from "@/components/chat/chat-message-rendering-utils";
import {
	CodeSandboxResultCard,
	HtmlArtifactCard,
	LiveToolInputCard,
} from "@/components/chat/chat-artifact-renderers";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const RichEditor = dynamic<RichEditorProps>(
	() => import("@/components/chat/rich-editor").then((mod) => mod.RichEditor),
	{
		ssr: false,
		loading: () => <Skeleton className="h-32 w-full rounded-xl" />,
	},
);

const BUTTON_TYPE = "button";
const OUTLINE_VARIANT = "outline";
const GHOST_VARIANT = "ghost";
const COMPACT_ICON_CLASS = "size-3";

const streamdownMath = createMathPlugin({ singleDollarTextMath: true });
const STREAMDOWN_PLUGINS = { code, math: streamdownMath };

function isTrustedInternalLink(url: string) {
	if (typeof window === "undefined") return false;
	try {
		const parsed = new URL(url, window.location.origin);
		return parsed.origin === window.location.origin;
	} catch {
		return false;
	}
}

function ExternalLinkSafetyModal({
	url,
	isOpen,
	onClose,
	onConfirm,
}: LinkSafetyModalProps) {
	if (!isOpen || typeof document === "undefined") return null;

	return createPortal(
		<div
			className="fixed inset-0 z-[100] flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm"
			onClick={onClose}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="external-link-title"
				className="w-full max-w-md rounded-2xl border bg-card p-5 text-sm shadow-2xl"
				onClick={(event) => event.stopPropagation()}
			>
				<h2
					id="external-link-title"
					className="text-base font-semibold text-foreground"
				>
					Open external link?
				</h2>
				<p className="mt-2 text-muted-foreground">
					You&apos;re about to visit an external website.
				</p>
				<p className="mt-3 break-all rounded-lg bg-muted/50 p-2 font-mono text-xs text-muted-foreground">
					{url}
				</p>
				<div className="mt-5 flex flex-wrap justify-end gap-2">
					<Button type={BUTTON_TYPE} variant={GHOST_VARIANT} onClick={onClose}>
						Cancel
					</Button>
					<Button
						type={BUTTON_TYPE}
						variant={OUTLINE_VARIANT}
						onClick={() => void navigator.clipboard.writeText(url)}
					>
						Copy link
					</Button>
					<Button type={BUTTON_TYPE} onClick={onConfirm}>
						Open link
					</Button>
				</div>
			</div>
		</div>,
		document.body,
	);
}

const STREAMDOWN_LINK_SAFETY: LinkSafetyConfig = {
	enabled: true,
	onLinkCheck: isTrustedInternalLink,
	renderModal: (props) => <ExternalLinkSafetyModal {...props} />,
};

function StreamingThinking() {
	return (
		<div className="streaming-thinking" aria-label="Assistant is thinking">
			<span className="streaming-thinking__text t-shimmer" data-text="Thinking">
				Thinking
			</span>
			<span className="streaming-thinking__dots" aria-hidden="true">
				<span />
				<span />
				<span />
			</span>
		</div>
	);
}

export function StreamingStatus() {
	return (
		<span className="streaming-status" aria-label="Assistant is generating">
			<span className="streaming-status__dot" aria-hidden="true" />
			<span className="t-shimmer" data-text="Generating">
				Generating
			</span>
		</span>
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
							type={BUTTON_TYPE}
							size="sm"
							variant={OUTLINE_VARIANT}
							className="h-8 px-3 text-xs"
							onClick={() => onReject?.(pendingApproval)}
						>
							<XIcon data-icon="inline-start" aria-hidden="true" />
							Reject
						</Button>
						<Button
							type={BUTTON_TYPE}
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

function formatExpandedToolValue(value: unknown, isOpen: boolean) {
	if (!isOpen || value == null) return "";
	return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

type ToolPartCardProps = {
	part: ChatMessagePart;
	approval?: PendingToolApproval;
	workspaceId?: string;
	workspaceArtifactDisplay?: WorkspaceArtifactDisplay;
	onApprove?: (approval: PendingToolApproval) => void;
	onReject?: (approval: PendingToolApproval) => void;
};

const ToolPartCard = memo(function ToolPartCard({
	part,
	approval,
	workspaceId,
	workspaceArtifactDisplay = "full",
	onApprove,
	onReject,
}: ToolPartCardProps) {
	const [open, setOpen] = useState(false);
	const parsed = useMemo(() => parseToolPart(part.content), [part.content]);
	const fileArtifact = useMemo(
		() =>
			part.type === "file"
				? codeWorkspaceArtifactFromPartContent(part.content)
				: null,
		[part.content, part.type],
	);
	const imageAttachment = useMemo(
		() =>
			part.type === "file"
				? chatImageAttachmentFromPartContent(part.content)
				: null,
		[part.content, part.type],
	);
	const fileAttachment = useMemo(
		() =>
			part.type === "file"
				? chatFileAttachmentFromPartContent(part.content)
				: null,
		[part.content, part.type],
	);
	const friendlyName = useMemo(
		() => formatToolName(parsed.toolName),
		[parsed.toolName],
	);
	const status = useMemo(() => getToolStatus(parsed), [parsed]);
	const hasResult = parsed.output !== undefined;
	const approvalMatches = Boolean(approval);

	const inputArtifact = useMemo(
		() => htmlArtifactFromToolInput(parsed.input),
		[parsed.input],
	);
	const streamingInputArtifact = useMemo(
		() =>
			parsed.streamingInput
				? null
				: htmlArtifactFromInputText(parsed.inputText),
		[parsed.inputText, parsed.streamingInput],
	);
	const sandboxOutput = useMemo(
		() => codeSandboxOutputFromUnknown(parsed.output),
		[parsed.output],
	);
	const sandboxInput = useMemo(
		() => codeSandboxInputFromUnknown(parsed.input),
		[parsed.input],
	);
	const liveSandboxInput = useMemo(
		() =>
			isCodeSandboxToolName(parsed.toolName)
				? codeSandboxInputFromInputText(parsed.inputText)
				: null,
		[parsed.inputText, parsed.toolName],
	);
	const summaryText = useMemo(() => {
		if (status === "pending") {
			return summarizeToolInput(friendlyName, parsed.input);
		}
		if (hasResult) {
			return summarizeToolBody(parsed.toolName, parsed.output, false);
		}
		return "";
	}, [
		friendlyName,
		hasResult,
		parsed.input,
		parsed.output,
		parsed.toolName,
		status,
	]);
	const inputText = useMemo(
		() => formatExpandedToolValue(parsed.input, open),
		[open, parsed.input],
	);
	const outputText = useMemo(
		() => formatExpandedToolValue(parsed.output, open),
		[open, parsed.output],
	);

	if (fileArtifact) {
		return workspaceArtifactDisplay === "summary" ? (
			<CodeWorkspaceArtifactSummary artifact={fileArtifact} />
		) : (
			<CodeWorkspaceArtifactCard
				artifact={fileArtifact}
				workspaceId={workspaceId}
			/>
		);
	}
	if (imageAttachment) {
		return <ChatImageAttachmentCard attachment={imageAttachment} />;
	}
	if (fileAttachment) {
		return <ChatFileAttachmentCard attachment={fileAttachment} />;
	}
	if (sandboxOutput) {
		return (
			<CodeSandboxResultCard result={sandboxOutput} input={sandboxInput} />
		);
	}
	if (isHtmlArtifactOutput(parsed.output)) {
		return <HtmlArtifactCard artifact={parsed.output} />;
	}
	if (isCodeWorkspaceArtifactOutput(parsed.output)) {
		return workspaceArtifactDisplay === "summary" ? (
			<CodeWorkspaceArtifactSummary artifact={parsed.output} />
		) : (
			<CodeWorkspaceArtifactCard
				artifact={parsed.output}
				workspaceId={workspaceId}
			/>
		);
	}
	if (isGitHubPublishOutput(parsed.output)) {
		return <GitHubPublishResultCard result={parsed.output} />;
	}
	if (inputArtifact) {
		return <HtmlArtifactCard artifact={inputArtifact} isLive />;
	}
	if (parsed.streamingInput && parsed.inputText !== undefined) {
		return (
			<LiveToolInputCard
				toolName={friendlyName}
				inputText={parsed.inputText}
				sandboxInput={liveSandboxInput}
			/>
		);
	}
	if (streamingInputArtifact) {
		return <HtmlArtifactCard artifact={streamingInputArtifact} isLive />;
	}

	// Determine icon and colors based on status
	let StatusIcon: React.ComponentType<{ className?: string }>;
	let iconBgClass: string;
	if (status === "error") {
		StatusIcon = XCircleIcon;
		iconBgClass = "border-destructive/30 bg-destructive/10 text-destructive";
	} else if (approvalMatches) {
		StatusIcon = ShieldAlertIcon;
		iconBgClass = "border-warning/30 bg-warning/15 text-warning";
	} else if (status === "pending") {
		StatusIcon = ClockIcon;
		iconBgClass = "border-info/30 bg-info/10 text-info";
	} else {
		StatusIcon = CheckCircle2Icon;
		iconBgClass = "border-success/30 bg-success/10 text-success";
	}

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
					<StatusIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
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
						type={BUTTON_TYPE}
						variant={GHOST_VARIANT}
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
								type={BUTTON_TYPE}
								size="sm"
								variant={OUTLINE_VARIANT}
								className="h-7 px-2.5 text-[11px]"
								onClick={() => onReject?.(approval)}
							>
								<XIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
								Reject
							</Button>
							<Button
								type={BUTTON_TYPE}
								size="sm"
								className="h-7 px-2.5 text-[11px]"
								onClick={() => onApprove?.(approval)}
							>
								<CheckIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
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
}, areToolPartCardPropsEqual);

function areToolPartCardPropsEqual(
	previous: Readonly<ToolPartCardProps>,
	next: Readonly<ToolPartCardProps>,
) {
	return (
		previous.part === next.part &&
		previous.approval === next.approval &&
		previous.workspaceId === next.workspaceId &&
		previous.onApprove === next.onApprove &&
		previous.onReject === next.onReject
	);
}

function SuggestionsPart({
	part,
	onSuggestionClick,
}: {
	part: ChatMessagePart;
	onSuggestionClick?: (suggestion: string) => void;
}) {
	let suggestions: string[] = [];
	try {
		const parsed = JSON.parse(part.content) as unknown;
		if (Array.isArray(parsed)) {
			suggestions = parsed.filter(
				(value): value is string => typeof value === "string",
			);
		}
	} catch {
		return null;
	}
	if (suggestions.length === 0) return null;

	return (
		<div className="mt-1 flex flex-wrap gap-2">
			{suggestions.map((suggestion) => (
				<Button
					key={suggestion}
					type={BUTTON_TYPE}
					variant={OUTLINE_VARIANT}
					size="sm"
					className="h-auto rounded-full px-3 py-1.5 text-xs"
					onClick={() => onSuggestionClick?.(suggestion)}
				>
					{suggestion}
				</Button>
			))}
		</div>
	);
}

function ThinkingPart({
	part,
	isStreaming = false,
}: {
	part: ChatMessagePart;
	isStreaming?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const content = part.content.trim();

	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className={cn(
				"overflow-hidden rounded-xl border text-xs transition-colors duration-200",
				isStreaming
					? "border-primary/25 bg-primary/5"
					: "border-border/50 bg-muted/25",
			)}
		>
			<div className="flex items-center gap-3 px-3 py-2.5">
				<div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/70 text-muted-foreground">
					{isStreaming ? (
						<BrainIcon className="size-4" aria-hidden="true" />
					) : (
						<CheckCircle2Icon
							className="size-4 text-success"
							aria-hidden="true"
						/>
					)}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="font-medium text-foreground">
							{isStreaming ? "Reasoning…" : "Reasoning complete"}
						</span>
						{isStreaming ? (
							<span className="streaming-status__dot" aria-hidden="true" />
						) : null}
					</div>
				</div>
				<CollapsibleTrigger asChild>
					<Button
						type={BUTTON_TYPE}
						variant={GHOST_VARIANT}
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
						{open ? "Hide" : "View"}
					</Button>
				</CollapsibleTrigger>
			</div>
			<CollapsibleContent>
				{content ? (
					<Streamdown
						plugins={STREAMDOWN_PLUGINS}
						linkSafety={STREAMDOWN_LINK_SAFETY}
						className="border-t border-border/50 bg-background/40 px-3 py-2.5 text-xs leading-5 text-muted-foreground"
					>
						{content}
					</Streamdown>
				) : (
					<div className="border-t border-border/50 bg-background/40 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
						Reasoning is starting…
					</div>
				)}
			</CollapsibleContent>
		</Collapsible>
	);
}

type MessageContentProps = {
	message: ChatMessage;
	showSuggestions?: boolean;
	workspaceId?: string;
	workspaceArtifactDisplay?: WorkspaceArtifactDisplay;
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
	onSuggestionClick?: (suggestion: string) => void;
};

export const MessageContent = memo(function MessageContent({
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
	onSuggestionClick,
	showSuggestions = true,
	workspaceId,
	workspaceArtifactDisplay = "full",
}: MessageContentProps) {
	const content = useMemo(() => textFromMessage(message), [message]);
	const citations = useMemo(() => citationsFromMessage(message), [message]);
	const isAssistant = message.role === "assistant";
	const renderableParts = useMemo(
		() =>
			renderablePartsFromMessage(message).filter(
				(part) => part.type !== "text" || part.content,
			),
		[message],
	);
	const { approvalByPartIndex, standaloneApprovals } = useMemo(() => {
		const approvalByIndex = new Map<number, PendingToolApproval>();
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
				approvalByIndex.set(partIndex, approval);
				matchedApprovalIds.add(approval.invocationId);
			}
		}
		return {
			approvalByPartIndex: approvalByIndex,
			standaloneApprovals:
				message.status === "streaming"
					? pendingApprovals.filter(
							(approval) => !matchedApprovalIds.has(approval.invocationId),
						)
					: [],
		};
	}, [message.status, pendingApprovals, renderableParts]);

	if (isEditing) {
		return (
			<RichEditor
				value={editingContent}
				onChange={onEditingContentChange}
				onSave={onSaveEdit}
				onCancel={onCancelEdit}
				disabled={isSaving}
			/>
		);
	}

	if (!isAssistant) {
		const fileParts = renderableParts.filter((part) => part.type === "file");
		if (fileParts.length === 0) return content;
		return (
			<div className="flex flex-col gap-2">
				{content ? <div>{content}</div> : null}
				{fileParts.map((part, partIndex) => {
					const key = `${message.id}-${part.type}-${partIndex}`;
					const imageAttachment = chatImageAttachmentFromPartContent(
						part.content,
					);
					if (imageAttachment) {
						return (
							<ChatImageAttachmentCard key={key} attachment={imageAttachment} />
						);
					}
					const fileAttachment = chatFileAttachmentFromPartContent(
						part.content,
					);
					if (fileAttachment) {
						return (
							<ChatFileAttachmentCard key={key} attachment={fileAttachment} />
						);
					}
					const fileArtifact = codeWorkspaceArtifactFromPartContent(
						part.content,
					);
					if (!fileArtifact) return null;
					return workspaceArtifactDisplay === "summary" ? (
						<CodeWorkspaceArtifactSummary key={key} artifact={fileArtifact} />
					) : (
						<CodeWorkspaceArtifactCard key={key} artifact={fileArtifact} />
					);
				})}
			</div>
		);
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
					if (part.type === "suggestions") {
						if (!showSuggestions) return null;
						return (
							<SuggestionsPart
								key={`${message.id}-${part.type}-${partIndex}`}
								part={part}
								onSuggestionClick={onSuggestionClick}
							/>
						);
					}
					if (part.type === "reasoning") {
						return (
							<ThinkingPart
								key={`${message.id}-${part.type}-${partIndex}`}
								part={part}
								isStreaming={isAnimating}
							/>
						);
					}
					if (part.type === "file") {
						const key = `${message.id}-${part.type}-${partIndex}`;
						const imageAttachment = chatImageAttachmentFromPartContent(
							part.content,
						);
						if (imageAttachment) {
							return (
								<ChatImageAttachmentCard
									key={key}
									attachment={imageAttachment}
								/>
							);
						}
						const fileAttachment = chatFileAttachmentFromPartContent(
							part.content,
						);
						if (fileAttachment) {
							return (
								<ChatFileAttachmentCard key={key} attachment={fileAttachment} />
							);
						}
						const fileArtifact = codeWorkspaceArtifactFromPartContent(
							part.content,
						);
						if (!fileArtifact) return null;
						return workspaceArtifactDisplay === "summary" ? (
							<CodeWorkspaceArtifactSummary key={key} artifact={fileArtifact} />
						) : (
							<CodeWorkspaceArtifactCard
								key={key}
								artifact={fileArtifact}
								workspaceId={workspaceId}
							/>
						);
					}
					if (part.type === "tool-call" || part.type === "tool-result") {
						return (
							<ToolPartCard
								key={`${message.id}-${part.type}-${partIndex}`}
								part={part}
								approval={approvalByPartIndex.get(partIndex)}
								workspaceId={workspaceId}
								workspaceArtifactDisplay={workspaceArtifactDisplay}
								onApprove={onApproveTool}
								onReject={onRejectTool}
							/>
						);
					}
					return (
						<Streamdown
							key={`${message.id}-${part.type}-${partIndex}`}
							plugins={STREAMDOWN_PLUGINS}
							linkSafety={STREAMDOWN_LINK_SAFETY}
							className="streaming-markdown text-sm"
						>
							{part.content}
						</Streamdown>
					);
				})
			) : standaloneApprovals.length === 0 ? (
				content ? (
					<Streamdown
						plugins={STREAMDOWN_PLUGINS}
						linkSafety={STREAMDOWN_LINK_SAFETY}
						className="streaming-markdown text-sm"
					>
						{content}
					</Streamdown>
				) : isAnimating ? (
					<StreamingThinking />
				) : null
			) : null}
		</div>
	);
}, areMessageContentPropsEqual);

function areMessageContentPropsEqual(
	previous: Readonly<MessageContentProps>,
	next: Readonly<MessageContentProps>,
) {
	return (
		previous.message === next.message &&
		previous.showSuggestions === next.showSuggestions &&
		previous.workspaceId === next.workspaceId &&
		previous.workspaceArtifactDisplay === next.workspaceArtifactDisplay &&
		previous.isEditing === next.isEditing &&
		previous.editingContent === next.editingContent &&
		previous.isSaving === next.isSaving &&
		previous.isAnimating === next.isAnimating &&
		previous.pendingApprovals === next.pendingApprovals
	);
}
