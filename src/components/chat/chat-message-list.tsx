"use client";

import dynamic from "next/dynamic";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
	BrainIcon,
	CheckCircle2Icon,
	CheckIcon,
	ChevronDownIcon,
	ClockIcon,
	CopyIcon,
	Maximize2Icon,
	PencilIcon,
	RefreshCcwIcon,
	ShieldAlertIcon,
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
import type { RichEditorProps } from "@/components/chat/rich-editor";
import { summarizeToolInput } from "@/components/chat/tool-approval-banner";
import { Button } from "@/components/ui/button";
import { markdownToHtml } from "@/lib/markdown-to-html";
import { copyRichHtml } from "@/lib/rich-clipboard";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const RichEditor = dynamic<RichEditorProps>(
	() => import("@/components/chat/rich-editor").then((mod) => mod.RichEditor),
	{
		ssr: false,
		loading: () => <Skeleton className="h-32 w-full rounded-xl" />,
	},
);

const INITIAL_VISIBLE_MESSAGES = 60;
const LOAD_MORE_MESSAGES = 30;
const MAX_LIVE_TOOL_INPUT_CHARS = 8000;
const EMPTY_PENDING_APPROVALS: PendingToolApproval[] = [];

const STREAMDOWN_PLUGINS = { code };

function StreamingThinking() {
	return (
		<div className="streaming-thinking" aria-label="Assistant is thinking">
			<span className="streaming-thinking__text">Thinking</span>
			<span className="streaming-thinking__dots" aria-hidden="true">
				<span />
				<span />
				<span />
			</span>
		</div>
	);
}

function StreamingStatus() {
	return (
		<span className="streaming-status" aria-label="Assistant is generating">
			<span className="streaming-status__dot" aria-hidden="true" />
			<span>Generating</span>
		</span>
	);
}

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
	if (isHtmlArtifactOutput(body)) return `Rendered ${body.title}.`;
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

type HtmlArtifactOutput = {
	kind: "html_artifact";
	title: string;
	html: string;
	css: string;
	js: string;
	height: number;
};

function isHtmlArtifactOutput(value: unknown): value is HtmlArtifactOutput {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		record.kind === "html_artifact" &&
		typeof record.title === "string" &&
		typeof record.html === "string" &&
		typeof record.css === "string" &&
		typeof record.js === "string" &&
		typeof record.height === "number"
	);
}

function htmlArtifactFromToolInput(value: unknown): HtmlArtifactOutput | null {
	if (typeof value !== "object" || value === null) return null;
	const record = value as Record<string, unknown>;
	if (typeof record.html !== "string") return null;
	return {
		kind: "html_artifact",
		title:
			typeof record.title === "string" ? record.title : "Interactive preview",
		html: record.html,
		css: typeof record.css === "string" ? record.css : "",
		js: typeof record.js === "string" ? record.js : "",
		height: typeof record.height === "number" ? record.height : 420,
	};
}

function decodeJsonStringFragment(raw: string) {
	const safeRaw = raw.endsWith("\\") ? raw.slice(0, -1) : raw;
	try {
		return JSON.parse(`"${safeRaw}"`) as string;
	} catch {
		return safeRaw
			.replace(/\\n/g, "\n")
			.replace(/\\t/g, "\t")
			.replace(/\\"/g, '"')
			.replace(/\\\\/g, "\\");
	}
}

function extractJsonStringField(inputText: string, field: string) {
	const fieldIndex = inputText.indexOf(`"${field}"`);
	if (fieldIndex === -1) return null;
	const colonIndex = inputText.indexOf(":", fieldIndex);
	if (colonIndex === -1) return null;
	const valueStart = inputText.indexOf('"', colonIndex + 1);
	if (valueStart === -1) return null;

	let escaped = false;
	let raw = "";
	for (let index = valueStart + 1; index < inputText.length; index += 1) {
		const char = inputText[index];
		if (escaped) {
			raw += `\\${char}`;
			escaped = false;
			continue;
		}
		if (char === "\\") {
			escaped = true;
			continue;
		}
		if (char === '"') break;
		raw += char;
	}
	if (escaped) raw += "\\";
	return decodeJsonStringFragment(raw);
}

function htmlArtifactFromInputText(inputText: string | undefined) {
	if (!inputText) return null;
	try {
		return htmlArtifactFromToolInput(JSON.parse(inputText));
	} catch {
		const html = extractJsonStringField(inputText, "html");
		if (!html) return null;
		const heightMatch = inputText.match(/"height"\s*:\s*(\d+)/);
		return {
			kind: "html_artifact" as const,
			title:
				extractJsonStringField(inputText, "title") ?? "Generating preview…",
			html,
			css: extractJsonStringField(inputText, "css") ?? "",
			js: extractJsonStringField(inputText, "js") ?? "",
			height: heightMatch ? Number(heightMatch[1]) : 420,
		};
	}
}

function escapeClosingTags(value: string) {
	return value.replace(/<\/(script|style)/gi, "<\\/$1");
}

function artifactSourceDocument(
	artifact: HtmlArtifactOutput,
	options: { fullscreen?: boolean } = {},
) {
	const fullscreenCss = options.fullscreen
		? `
html, body { width: 100%; min-height: 100%; }
body { overflow: auto; }
body > .container,
body > .grid,
body > main,
body > section,
body > article,
body > div:first-child {
	width: 100% !important;
	max-width: none !important;
}
body > .container,
body > main,
body > section,
body > article,
body > div:first-child {
	min-height: 100dvh;
}
`
		: "";

	return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: https:; font-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'" />
<style>
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
${escapeClosingTags(artifact.css)}
${fullscreenCss}
</style>
</head>
<body>
${artifact.html}
<script>
${escapeClosingTags(artifact.js)}
</script>
</body>
</html>`;
}

function artifactCombinedCode(artifact: HtmlArtifactOutput) {
	return `<style>\n${artifact.css}\n</style>\n\n${artifact.html}\n\n<script>\n${artifact.js}\n</script>`;
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

function ArtifactCodeBlocks({ artifact }: { artifact: HtmlArtifactOutput }) {
	return (
		<div className="grid gap-2 border-t border-border/50 bg-muted/20 p-3">
			{[
				["HTML", artifact.html],
				["CSS", artifact.css],
				["JavaScript", artifact.js],
			].map(([label, source]) => (
				<div key={label}>
					<div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
						{label}
					</div>
					<pre className="max-h-64 overflow-auto rounded-md border border-border/50 bg-background/80 p-2 font-mono text-[11px] leading-4 text-muted-foreground">
						{source || "// empty"}
					</pre>
				</div>
			))}
		</div>
	);
}

function LazyArtifactFrame({
	title,
	srcDoc,
	height,
}: {
	title: string;
	srcDoc: string;
	height: number;
}) {
	const frameRootRef = useRef<HTMLDivElement | null>(null);
	const [isReady, setIsReady] = useState(false);

	useEffect(() => {
		if (isReady) return;
		const node = frameRootRef.current;
		if (!node) return;
		if (!("IntersectionObserver" in window)) {
			queueMicrotask(() => setIsReady(true));
			return;
		}

		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry?.isIntersecting) return;
				setIsReady(true);
				observer.disconnect();
			},
			{ rootMargin: "640px 0px" },
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, [isReady]);

	return (
		<div
			ref={frameRootRef}
			className="flex w-full items-center justify-center bg-white text-xs text-muted-foreground"
			style={{ height }}
		>
			{isReady ? (
				<iframe
					title={title}
					srcDoc={srcDoc}
					sandbox="allow-scripts allow-modals"
					loading="lazy"
					className="h-full w-full bg-white"
				/>
			) : (
				<span>Preview loads when visible.</span>
			)}
		</div>
	);
}

function HtmlArtifactCard({
	artifact,
	isLive = false,
}: {
	artifact: HtmlArtifactOutput;
	isLive?: boolean;
}) {
	const [codeOpen, setCodeOpen] = useState(false);
	const [fullscreenOpen, setFullscreenOpen] = useState(false);
	const [fullscreenCodeOpen, setFullscreenCodeOpen] = useState(false);
	const [copied, setCopied] = useState(false);
	const codeText = useMemo(() => artifactCombinedCode(artifact), [artifact]);
	const srcDoc = useMemo(() => artifactSourceDocument(artifact), [artifact]);
	const fullscreenSrcDoc = useMemo(
		() => artifactSourceDocument(artifact, { fullscreen: true }),
		[artifact],
	);

	async function copyCode() {
		await navigator.clipboard.writeText(codeText);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}

	return (
		<div className="overflow-hidden rounded-xl border border-primary/20 bg-background text-xs shadow-sm">
			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-muted/35 px-3 py-2.5">
				<div className="min-w-0">
					<p className="truncate font-medium text-foreground">
						{artifact.title}
					</p>
					<p className="text-[11px] text-muted-foreground">
						{isLive
							? "Live HTML/CSS/JS preview"
							: "Interactive HTML/CSS/JS preview"}
					</p>
				</div>
				<div className="flex items-center gap-1.5">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-7 px-2.5 text-[11px]"
						onClick={() => setFullscreenOpen(true)}
					>
						<Maximize2Icon className="size-3" aria-hidden="true" />
						Fullscreen
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-7 px-2.5 text-[11px]"
						onClick={copyCode}
					>
						{copied ? "Copied" : "Copy code"}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-7 px-2.5 text-[11px]"
						onClick={() => setCodeOpen((current) => !current)}
					>
						{codeOpen ? "Hide code" : "View code"}
					</Button>
				</div>
			</div>
			<LazyArtifactFrame
				title={artifact.title}
				srcDoc={srcDoc}
				height={artifact.height}
			/>
			<Collapsible open={codeOpen} onOpenChange={setCodeOpen}>
				<CollapsibleContent>
					<ArtifactCodeBlocks artifact={artifact} />
				</CollapsibleContent>
			</Collapsible>
			<Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
				<DialogContent className="!fixed !inset-0 flex !h-dvh !w-full !translate-x-0 !translate-y-0 flex-col overflow-hidden !rounded-none !border-0 bg-background p-0 sm:!max-w-none">
					<div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3 sm:px-6">
						<div className="min-w-0">
							<DialogTitle className="truncate text-base font-semibold">
								{artifact.title}
							</DialogTitle>
							<p className="mt-0.5 text-xs text-muted-foreground">
								Fullscreen HTML/CSS/JS preview
							</p>
						</div>
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="h-8 px-3 text-xs"
								onClick={copyCode}
							>
								{copied ? "Copied" : "Copy code"}
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="h-8 px-3 text-xs"
								onClick={() => setFullscreenCodeOpen((current) => !current)}
							>
								{fullscreenCodeOpen ? "Hide code" : "View code"}
							</Button>
						</div>
					</div>
					<div className="flex min-h-0 flex-1 flex-col gap-4 bg-muted/30 p-4 sm:p-6 lg:flex-row">
						<div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-white shadow-2xl shadow-black/10 ring-1 ring-black/5 lg:min-w-0">
							<iframe
								title={`${artifact.title} fullscreen`}
								srcDoc={fullscreenSrcDoc}
								sandbox="allow-scripts allow-modals"
								className="h-full w-full bg-white"
							/>
						</div>
						<Collapsible
							open={fullscreenCodeOpen}
							onOpenChange={setFullscreenCodeOpen}
						>
							<CollapsibleContent className="flex max-h-[45%] flex-1 flex-col overflow-hidden rounded-xl border border-border/70 bg-background shadow-xl lg:max-h-none lg:min-w-[22rem] lg:max-w-[32rem]">
								<div className="flex-1 overflow-auto">
									<ArtifactCodeBlocks artifact={artifact} />
								</div>
							</CollapsibleContent>
						</Collapsible>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function LiveToolInputCard({
	toolName,
	inputText,
}: {
	toolName: string;
	inputText: string;
}) {
	const visibleInputText = useMemo(() => {
		if (inputText.length <= MAX_LIVE_TOOL_INPUT_CHARS) return inputText;
		return `…${inputText.length - MAX_LIVE_TOOL_INPUT_CHARS} earlier characters hidden while streaming\n${inputText.slice(-MAX_LIVE_TOOL_INPUT_CHARS)}`;
	}, [inputText]);

	return (
		<div className="overflow-hidden rounded-xl border border-primary/20 bg-background text-xs shadow-sm">
			<div className="flex items-center justify-between gap-2 border-b border-border/50 bg-muted/35 px-3 py-2.5">
				<div>
					<p className="font-medium text-foreground">{toolName}</p>
					<p className="text-[11px] text-muted-foreground">
						Generating interface code…
					</p>
				</div>
				<span className="size-2 rounded-full bg-primary/70 animate-pulse" />
			</div>
			<pre className="max-h-72 overflow-auto bg-muted/20 p-3 font-mono text-[11px] leading-4 text-muted-foreground">
				{visibleInputText || "Waiting for streamed tool input…"}
			</pre>
		</div>
	);
}

function formatExpandedToolValue(value: unknown, open: boolean) {
	if (!open || value == null) return "";
	return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

type ToolPartCardProps = {
	part: ChatMessagePart;
	approval?: PendingToolApproval;
	onApprove?: (approval: PendingToolApproval) => void;
	onReject?: (approval: PendingToolApproval) => void;
};

const ToolPartCard = memo(function ToolPartCard({
	part,
	approval,
	onApprove,
	onReject,
}: ToolPartCardProps) {
	const [open, setOpen] = useState(false);
	const parsed = useMemo(() => parseToolPart(part.content), [part.content]);
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

	if (isHtmlArtifactOutput(parsed.output)) {
		return <HtmlArtifactCard artifact={parsed.output} />;
	}
	if (inputArtifact) {
		return <HtmlArtifactCard artifact={inputArtifact} isLive />;
	}
	if (parsed.streamingInput && parsed.inputText !== undefined) {
		return (
			<LiveToolInputCard toolName={friendlyName} inputText={parsed.inputText} />
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
}, areToolPartCardPropsEqual);

function areToolPartCardPropsEqual(
	previous: Readonly<ToolPartCardProps>,
	next: Readonly<ToolPartCardProps>,
) {
	return (
		previous.part === next.part &&
		previous.approval === next.approval &&
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
					type="button"
					variant="outline"
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
						{open ? "Hide" : "View"}
					</Button>
				</CollapsibleTrigger>
			</div>
			<CollapsibleContent>
				{content ? (
					<Streamdown
						plugins={STREAMDOWN_PLUGINS}
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
	onSuggestionClick,
	showSuggestions = true,
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
							plugins={STREAMDOWN_PLUGINS}
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
		previous.isEditing === next.isEditing &&
		previous.editingContent === next.editingContent &&
		previous.isSaving === next.isSaving &&
		previous.isAnimating === next.isAnimating &&
		previous.pendingApprovals === next.pendingApprovals
	);
}

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
	onRegenerateAssistant?: (message: ChatMessage) => Promise<void> | void;
	pendingApprovals?: PendingToolApproval[];
	onApproveTool?: (approval: PendingToolApproval) => void;
	onRejectTool?: (approval: PendingToolApproval) => void;
	onSuggestionClick?: (suggestion: string) => void;
}

export function ChatMessageList({
	messages,
	sending,
	loading,
	bottomRef,
	onEditMessage,
	onDeleteMessage,
	onResendMessage,
	onRegenerateAssistant,
	pendingApprovals = [],
	onApproveTool,
	onRejectTool,
	onSuggestionClick,
}: ChatMessageListProps) {
	const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
	const [editingContent, setEditingContent] = useState("");
	const [savingMessageId, setSavingMessageId] = useState<string | null>(null);
	const [visibleMessageCount, setVisibleMessageCount] = useState(
		INITIAL_VISIBLE_MESSAGES,
	);
	const hiddenMessageCount = Math.max(0, messages.length - visibleMessageCount);
	const visibleMessages = useMemo(
		() =>
			hiddenMessageCount > 0 ? messages.slice(hiddenMessageCount) : messages,
		[hiddenMessageCount, messages],
	);
	const messageListMeta = useMemo(() => {
		const precedingUserByMessageId = new Map<string, ChatMessage | null>();
		let lastUserMessage: ChatMessage | null = null;
		let lastAssistantMessageId: string | undefined;
		for (const message of visibleMessages) {
			precedingUserByMessageId.set(message.id, lastUserMessage);
			if (message.role === "assistant") lastAssistantMessageId = message.id;
			if (message.role === "user") lastUserMessage = message;
		}
		return { lastAssistantMessageId, precedingUserByMessageId };
	}, [visibleMessages]);
	const lastMessageId = messages[messages.length - 1]?.id ?? null;

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

	const { lastAssistantMessageId, precedingUserByMessageId } = messageListMeta;

	return (
		<div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
			{hiddenMessageCount > 0 ? (
				<div className="flex justify-center">
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="rounded-full text-xs text-muted-foreground"
						onClick={() =>
							setVisibleMessageCount((count) => count + LOAD_MORE_MESSAGES)
						}
					>
						{`Show ${Math.min(LOAD_MORE_MESSAGES, hiddenMessageCount)} older messages`}
					</Button>
				</div>
			) : null}
			{visibleMessages.map((message) => {
				const content = textFromMessage(message);
				const isAssistant = message.role === "assistant";
				const isUser = message.role === "user";
				const canEdit = Boolean(onEditMessage) && (isUser || isAssistant);
				const canDelete = Boolean(onDeleteMessage);
				const canRegenerate =
					Boolean(onRegenerateAssistant) &&
					isAssistant &&
					message.status !== "streaming";
				const precedingUserMsg =
					precedingUserByMessageId.get(message.id) ?? null;
				const isEditing = editingMessageId === message.id;
				const isLast = message.id === lastMessageId;
				const isAnimating = sending && isLast && message.status === "streaming";
				const messagePendingApprovals =
					message.status === "streaming"
						? pendingApprovals
						: EMPTY_PENDING_APPROVALS;

				return (
					<article
						key={message.id}
						className={cn(
							"group/message flex gap-3 animate-in-up [contain-intrinsic-size:auto_160px] [content-visibility:auto]",
							message.role === "user" ? "justify-end" : "justify-start",
						)}
						style={{ animationDelay: isLast ? "0s" : undefined }}
					>
						<div
							className={cn(
								"flex flex-col transition-opacity duration-150",
								isUser ? "max-w-[82%]" : "max-w-[min(100%,48rem)]",
								isLast && isAnimating && "animate-in-fade",
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
									showSuggestions={message.id === lastAssistantMessageId}
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
									pendingApprovals={messagePendingApprovals}
									onApproveTool={onApproveTool}
									onRejectTool={onRejectTool}
									onSuggestionClick={onSuggestionClick}
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
									{message.status === "streaming" ? <StreamingStatus /> : null}
								</div>
							)}

							{/* Quick action bar */}
							<MessageActionBar
								message={message}
								sending={sending}
								canEdit={canEdit}
								canDelete={canDelete}
								canRegenerate={canRegenerate}
								onCopy={async () => {
									await copyRichHtml(markdownToHtml(content));
								}}
								onEdit={() => {
									setEditingMessageId(message.id);
									setEditingContent(content);
								}}
								onDelete={() => void onDeleteMessage?.(message)}
								onRegenerate={() => {
									if (precedingUserMsg) {
										void onResendMessage?.(precedingUserMsg);
									}
								}}
							/>
						</div>
					</article>
				);
			})}
			<div ref={bottomRef} />
		</div>
	);
}

function MessageActionBar({
	message,
	sending,
	canEdit,
	canDelete,
	canRegenerate,
	onCopy,
	onEdit,
	onDelete,
	onRegenerate,
}: {
	message: ChatMessage;
	sending: boolean;
	canEdit: boolean;
	canDelete: boolean;
	canRegenerate: boolean;
	onCopy: () => void;
	onEdit: () => void;
	onDelete: () => void;
	onRegenerate: () => void;
}) {
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		onCopy();
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div
			className={cn(
				"mt-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100",
				message.role === "user" ? "justify-end" : "justify-start",
			)}
		>
			<Button
				type="button"
				size="icon-sm"
				variant="ghost"
				aria-label={copied ? "Copied" : "Copy message"}
				className="size-6"
				disabled={sending}
				onClick={handleCopy}
			>
				{copied ? (
					<CheckIcon className="size-3 text-success" aria-hidden="true" />
				) : (
					<CopyIcon className="size-3" aria-hidden="true" />
				)}
			</Button>
			{canEdit ? (
				<Button
					type="button"
					size="icon-sm"
					variant="ghost"
					aria-label="Edit message"
					className="size-6"
					disabled={sending}
					onClick={onEdit}
				>
					<PencilIcon className="size-3" aria-hidden="true" />
				</Button>
			) : null}
			{canDelete ? (
				<Button
					type="button"
					size="icon-sm"
					variant="ghost"
					aria-label="Delete message"
					className="size-6 text-destructive/70 hover:text-destructive"
					disabled={sending}
					onClick={onDelete}
				>
					<Trash2Icon className="size-3" aria-hidden="true" />
				</Button>
			) : null}
			{canRegenerate ? (
				<Button
					type="button"
					size="sm"
					variant="ghost"
					aria-label="Regenerate response"
					className="h-6 gap-1 px-2 text-[11px]"
					disabled={sending}
					onClick={onRegenerate}
				>
					<RefreshCcwIcon className="size-3" aria-hidden="true" />
					Regenerate
				</Button>
			) : null}
		</div>
	);
}
