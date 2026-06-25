"use client";

import dynamic from "next/dynamic";
import {
	memo,
	useEffect,
	useMemo,
	useRef,
	useState,
	type SVGProps,
} from "react";
import { createPortal } from "react-dom";
import {
	BrainIcon,
	CheckCircle2Icon,
	CheckIcon,
	ChevronDownIcon,
	ClockIcon,
	CopyIcon,
	DownloadIcon,
	FileIcon,
	FolderIcon,
	Maximize2Icon,
	PencilIcon,
	RefreshCcwIcon,
	SaveIcon,
	UploadCloudIcon,
	ShieldAlertIcon,
	Trash2Icon,
	XCircleIcon,
	XIcon,
} from "lucide-react";
import {
	Streamdown,
	type LinkSafetyConfig,
	type LinkSafetyModalProps,
} from "streamdown";
import { code } from "@streamdown/code";

import { CitationBlock } from "@/components/chat/citation-block";
import {
	citationsFromMessage,
	getToolStatus,
	parseToolPart,
	renderablePartsFromMessage,
	textFromMessage,
	toolNameMatches,
	type ChatFileAttachment,
	type ChatImageAttachment,
	type ChatMessage,
	type ChatMessagePart,
	type CodeWorkspaceArtifact,
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
const BUTTON_TYPE = "button";
const OUTLINE_VARIANT = "outline";
const GHOST_VARIANT = "ghost";
const COMPACT_ICON_CLASS = "size-3";

const STREAMDOWN_PLUGINS = { code };

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

function GithubIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 24 24" fill="currentColor" {...props}>
			<path d="M12 0.5C5.65 0.5 0.5 5.65 0.5 12c0 5.08 3.29 9.39 7.85 10.92 0.57 0.11 0.78-0.25 0.78-0.55 0-0.27-0.01-1.17-0.02-2.12-3.19 0.69-3.86-1.36-3.86-1.36-0.52-1.32-1.27-1.67-1.27-1.67-1.04-0.71 0.08-0.7 0.08-0.7 1.15 0.08 1.75 1.18 1.75 1.18 1.02 1.74 2.67 1.24 3.32 0.95 0.1-0.74 0.4-1.24 0.73-1.53-2.55-0.29-5.23-1.27-5.23-5.67 0-1.25 0.45-2.28 1.18-3.08-0.12-0.29-0.51-1.46 0.11-3.04 0 0 0.96-0.31 3.15 1.18A10.9 10.9 0 0 1 12 6.12c0.98 0 1.96 0.13 2.88 0.39 2.18-1.49 3.14-1.18 3.14-1.18 0.62 1.58 0.23 2.75 0.11 3.04 0.74 0.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.24 5.66 0.41 0.36 0.78 1.06 0.78 2.14 0 1.54-0.01 2.78-0.01 3.16 0 0.31 0.21 0.67 0.79 0.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35 0.5 12 0.5Z" />
		</svg>
	);
}

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

function StreamingStatus() {
	return (
		<span className="streaming-status" aria-label="Assistant is generating">
			<span className="streaming-status__dot" aria-hidden="true" />
			<span className="t-shimmer" data-text="Generating">
				Generating
			</span>
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
	if (isCodeWorkspaceArtifactOutput(body)) return `Updated ${body.title}.`;
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

function isCodeWorkspaceArtifactOutput(
	value: unknown,
): value is CodeWorkspaceArtifact {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		record.kind === "code_workspace_artifact" &&
		typeof record.projectId === "string" &&
		typeof record.title === "string" &&
		typeof record.version === "number" &&
		Array.isArray(record.files)
	);
}

type GitHubPublishOutput = {
	kind: "github_publish_result";
	mode: "pull_request" | "direct_push";
	repository: string;
	targetBranch: string;
	sourceBranch: string | null;
	commitSha: string;
	pullRequestUrl: string | null;
	message: string;
};

function isGitHubPublishOutput(value: unknown): value is GitHubPublishOutput {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		record.kind === "github_publish_result" &&
		typeof record.repository === "string" &&
		typeof record.targetBranch === "string" &&
		typeof record.commitSha === "string"
	);
}

function codeWorkspaceArtifactFromPartContent(content: string) {
	try {
		const parsed = JSON.parse(content) as unknown;
		return isCodeWorkspaceArtifactOutput(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function isChatImageAttachmentOutput(
	value: unknown,
): value is ChatImageAttachment {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		record.kind === "chat_image" &&
		typeof record.id === "string" &&
		typeof record.fileName === "string" &&
		typeof record.mimeType === "string" &&
		typeof record.url === "string"
	);
}

function chatImageAttachmentFromPartContent(content: string) {
	try {
		const parsed = JSON.parse(content) as unknown;
		return isChatImageAttachmentOutput(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function isChatFileAttachmentOutput(
	value: unknown,
): value is ChatFileAttachment {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		record.kind === "chat_file" &&
		typeof record.id === "string" &&
		typeof record.fileName === "string" &&
		typeof record.mimeType === "string" &&
		typeof record.url === "string" &&
		typeof record.extractionStatus === "string" &&
		typeof record.extractedTextChars === "number"
	);
}

function chatFileAttachmentFromPartContent(content: string) {
	try {
		const parsed = JSON.parse(content) as unknown;
		return isChatFileAttachmentOutput(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

type CodeSandboxFileOutput = {
	path: string;
	size: number;
	mimeType: string;
	textPreview?: string;
	truncated?: boolean;
	contentOmitted?: "too_large" | "total_limit";
	downloadUrl?: string;
	downloadError?: string;
	attachment?: ChatFileAttachment | ChatImageAttachment;
};

type CodeSandboxLanguage = "python" | "node" | "bash";

type CodeSandboxOutput = {
	kind: "code_sandbox_result";
	ok: boolean;
	language: CodeSandboxLanguage;
	exitCode: number | null;
	timedOut: boolean;
	durationMs: number;
	stdout: string;
	stderr: string;
	files: CodeSandboxFileOutput[];
};

type CodeSandboxInputPreview = {
	language: CodeSandboxLanguage | null;
	code: string;
	files: Array<{ path: string }>;
	attachments: Array<{ id: string; path?: string }>;
};

function isCodeSandboxFileOutput(
	value: unknown,
): value is CodeSandboxFileOutput {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.path === "string" &&
		typeof record.size === "number" &&
		typeof record.mimeType === "string"
	);
}

function normalizeSandboxAttachment(
	value: unknown,
): ChatFileAttachment | ChatImageAttachment | undefined {
	if (isChatFileAttachmentOutput(value) || isChatImageAttachmentOutput(value)) {
		return value;
	}
	return undefined;
}

function normalizeSandboxFileOutput(
	value: unknown,
): CodeSandboxFileOutput | null {
	if (!isCodeSandboxFileOutput(value)) return null;
	const record = value as Record<string, unknown>;
	return {
		path: value.path,
		size: value.size,
		mimeType: value.mimeType,
		...(typeof record.textPreview === "string"
			? { textPreview: record.textPreview }
			: {}),
		...(typeof record.truncated === "boolean"
			? { truncated: record.truncated }
			: {}),
		...(record.contentOmitted === "too_large" ||
		record.contentOmitted === "total_limit"
			? { contentOmitted: record.contentOmitted }
			: {}),
		...(typeof record.downloadUrl === "string"
			? { downloadUrl: record.downloadUrl }
			: {}),
		...(typeof record.downloadError === "string"
			? { downloadError: record.downloadError }
			: {}),
		...(normalizeSandboxAttachment(record.attachment)
			? { attachment: normalizeSandboxAttachment(record.attachment) }
			: {}),
	};
}

function isCodeSandboxOutput(value: unknown): value is CodeSandboxOutput {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		record.kind === "code_sandbox_result" &&
		typeof record.ok === "boolean" &&
		(record.language === "python" ||
			record.language === "node" ||
			record.language === "bash") &&
		Array.isArray(record.files)
	);
}

function codeSandboxOutputFromUnknown(
	value: unknown,
): CodeSandboxOutput | null {
	if (!isCodeSandboxOutput(value)) return null;
	const record = value as Record<string, unknown>;
	return {
		kind: "code_sandbox_result",
		ok: value.ok,
		language: value.language,
		exitCode: typeof record.exitCode === "number" ? record.exitCode : null,
		timedOut: record.timedOut === true,
		durationMs: typeof record.durationMs === "number" ? record.durationMs : 0,
		stdout: typeof record.stdout === "string" ? record.stdout : "",
		stderr: typeof record.stderr === "string" ? record.stderr : "",
		files: value.files.flatMap((file) => {
			const normalized = normalizeSandboxFileOutput(file);
			return normalized ? [normalized] : [];
		}),
	};
}

function normalizeCodeSandboxLanguage(
	value: unknown,
): CodeSandboxLanguage | null {
	return value === "python" || value === "node" || value === "bash"
		? value
		: null;
}

function codeSandboxInputFromUnknown(
	value: unknown,
): CodeSandboxInputPreview | null {
	if (typeof value !== "object" || value === null) return null;
	const record = value as Record<string, unknown>;
	if (typeof record.code !== "string") return null;
	const files = Array.isArray(record.files)
		? record.files.flatMap((file) => {
				if (typeof file !== "object" || file === null) return [];
				const fileRecord = file as Record<string, unknown>;
				return typeof fileRecord.path === "string"
					? [{ path: fileRecord.path }]
					: [];
			})
		: [];
	const attachments = Array.isArray(record.attachments)
		? record.attachments.flatMap((attachment) => {
				if (typeof attachment !== "object" || attachment === null) return [];
				const attachmentRecord = attachment as Record<string, unknown>;
				return typeof attachmentRecord.id === "string"
					? [
							{
								id: attachmentRecord.id,
								...(typeof attachmentRecord.path === "string"
									? { path: attachmentRecord.path }
									: {}),
							},
						]
					: [];
			})
		: [];
	return {
		language: normalizeCodeSandboxLanguage(record.language),
		code: record.code,
		files,
		attachments,
	};
}

function isCodeSandboxToolName(toolName: string | undefined) {
	return (
		toolName === "run_code_sandbox" ||
		Boolean(toolName?.endsWith("_run_code_sandbox"))
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

function codeSandboxInputFromInputText(inputText: string | undefined) {
	if (!inputText) return null;
	try {
		return codeSandboxInputFromUnknown(JSON.parse(inputText));
	} catch {
		const code = extractJsonStringField(inputText, "code");
		if (!code) return null;
		return {
			language: normalizeCodeSandboxLanguage(
				extractJsonStringField(inputText, "language"),
			),
			code,
			files: [],
			attachments: [],
		};
	}
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
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: https:; font-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" />
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
						type={BUTTON_TYPE}
						variant={GHOST_VARIANT}
						size="sm"
						className="h-7 px-2.5 text-[11px]"
						onClick={() => setFullscreenOpen(true)}
					>
						<Maximize2Icon className={COMPACT_ICON_CLASS} aria-hidden="true" />
						Fullscreen
					</Button>
					<Button
						type={BUTTON_TYPE}
						variant={OUTLINE_VARIANT}
						size="sm"
						className="h-7 px-2.5 text-[11px]"
						onClick={copyCode}
					>
						{copied ? "Copied" : "Copy code"}
					</Button>
					<Button
						type={BUTTON_TYPE}
						variant={GHOST_VARIANT}
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
								type={BUTTON_TYPE}
								variant={OUTLINE_VARIANT}
								size="sm"
								className="h-8 px-3 text-xs"
								onClick={copyCode}
							>
								{copied ? "Copied" : "Copy code"}
							</Button>
							<Button
								type={BUTTON_TYPE}
								variant={GHOST_VARIANT}
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

export const CODE_WORKSPACE_ARTIFACT_EVENT = "code-workspace-artifact-updated";

function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
	return `${Math.round(bytes / 1024 / 102.4) / 10} MB`;
}

function escapeCodeHtml(value: string) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function spanCodeToken(value: string, color: string) {
	return `<span style="color:${color}">${escapeCodeHtml(value)}</span>`;
}

function highlightWithRegex(
	value: string,
	pattern: RegExp,
	classify: (token: string) => string | null,
) {
	let result = "";
	let cursor = 0;
	for (const match of value.matchAll(pattern)) {
		const index = match.index ?? cursor;
		const token = match[0];
		result += escapeCodeHtml(value.slice(cursor, index));
		const color = classify(token);
		result += color ? spanCodeToken(token, color) : escapeCodeHtml(token);
		cursor = index + token.length;
	}
	return `${result}${escapeCodeHtml(value.slice(cursor))}`;
}

const CODE_TOKEN_COLORS = {
	comment: "#6b7280",
	keyword: "#2563eb",
	property: "#9333ea",
	string: "#16a34a",
	number: "#ea580c",
	color: "#dc2626",
} as const;

type CodeHighlightConfig = {
	pattern: RegExp;
	classify: (token: string) => string | null;
};

const isQuotedToken = (token: string) =>
	['"', "'", "`"].some((quote) => token.startsWith(quote));

const CODE_HIGHLIGHTERS: Record<string, CodeHighlightConfig> = {
	html: {
		pattern:
			/<!--[\s\S]*?-->|<\/?[\w:-]+\b|\/?>|\b[\w:-]+(?=\=)|"[^"]*"|'[^']*'/g,
		classify: (token) => {
			if (token.startsWith("<!--")) return CODE_TOKEN_COLORS.comment;
			if (token.startsWith("<") || token === ">" || token === "/>") {
				return CODE_TOKEN_COLORS.keyword;
			}
			return isQuotedToken(token)
				? CODE_TOKEN_COLORS.string
				: CODE_TOKEN_COLORS.property;
		},
	},
	css: {
		pattern:
			/\/\*[\s\S]*?\*\/|#[\da-fA-F]{3,8}\b|\b[a-zA-Z-]+(?=\s*:)|"[^"]*"|'[^']*'|\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw)?\b/g,
		classify: (token) => {
			if (token.startsWith("/*")) return CODE_TOKEN_COLORS.comment;
			if (token.startsWith("#")) return CODE_TOKEN_COLORS.color;
			if (isQuotedToken(token)) return CODE_TOKEN_COLORS.string;
			return /^\d/.test(token)
				? CODE_TOKEN_COLORS.number
				: CODE_TOKEN_COLORS.property;
		},
	},
	js: {
		pattern:
			/\/\*[\s\S]*?\*\/|\/\/[^\n]*|`(?:\\.|[^`])*`|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\b(?:const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b/g,
		classify: (token) => {
			if (token.startsWith("/*") || token.startsWith("//")) {
				return CODE_TOKEN_COLORS.comment;
			}
			if (isQuotedToken(token)) return CODE_TOKEN_COLORS.string;
			return /^\d/.test(token)
				? CODE_TOKEN_COLORS.number
				: CODE_TOKEN_COLORS.keyword;
		},
	},
};

const CODE_HIGHLIGHTER_ALIASES: Record<string, string> = {
	htm: "html",
	xml: "html",
	svg: "html",
	mjs: "js",
	cjs: "js",
	json: "js",
};

function highlightCode(value: string, filePath: string | null) {
	const extension = filePath?.split(".").pop()?.toLowerCase() ?? "";
	const highlighterKey = CODE_HIGHLIGHTER_ALIASES[extension] ?? extension;
	const highlighter = CODE_HIGHLIGHTERS[highlighterKey];

	return highlighter
		? highlightWithRegex(value, highlighter.pattern, highlighter.classify)
		: escapeCodeHtml(value);
}

type CodeWorkspaceTreeNode = {
	name: string;
	path: string;
	type: "directory" | "file";
	file?: CodeWorkspaceArtifact["files"][number];
	children: CodeWorkspaceTreeNode[];
};

function buildCodeWorkspaceTree(files: CodeWorkspaceArtifact["files"]) {
	const root: CodeWorkspaceTreeNode = {
		name: "",
		path: "",
		type: "directory",
		children: [],
	};
	for (const file of files) {
		const parts = file.path.split("/").filter(Boolean);
		let current = root;
		parts.forEach((part, index) => {
			const isFile = index === parts.length - 1;
			const nodePath = parts.slice(0, index + 1).join("/");
			let child = current.children.find(
				(item) =>
					item.name === part && item.type === (isFile ? "file" : "directory"),
			);
			if (!child) {
				child = {
					name: part,
					path: nodePath,
					type: isFile ? "file" : "directory",
					file: isFile ? file : undefined,
					children: [],
				};
				current.children.push(child);
			}
			current = child;
		});
	}
	const sortNodes = (nodes: CodeWorkspaceTreeNode[]) => {
		nodes.sort((a, b) => {
			if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
		nodes.forEach((node) => sortNodes(node.children));
	};
	sortNodes(root.children);
	return root.children;
}

function CodeWorkspaceFileTree({
	nodes,
	selectedPath,
	onSelect,
	level = 0,
}: {
	nodes: CodeWorkspaceTreeNode[];
	selectedPath: string | null;
	onSelect: (path: string) => void;
	level?: number;
}) {
	return (
		<div className={level === 0 ? "space-y-0.5" : undefined}>
			{nodes.map((node) => {
				if (node.type === "directory") {
					return (
						<div key={node.path}>
							<div
								className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground"
								style={{ paddingLeft: 8 + level * 12 }}
							>
								<FolderIcon className="size-3 shrink-0" aria-hidden="true" />
								<span className="truncate">{node.name}</span>
							</div>
							<CodeWorkspaceFileTree
								nodes={node.children}
								selectedPath={selectedPath}
								onSelect={onSelect}
								level={level + 1}
							/>
						</div>
					);
				}
				return (
					<button
						key={node.path}
						type={BUTTON_TYPE}
						className={cn(
							"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-muted",
							selectedPath === node.path && "bg-muted text-foreground",
						)}
						style={{ paddingLeft: 8 + level * 12 }}
						onClick={() => onSelect(node.path)}
					>
						<FileIcon
							className="size-3 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
						<span className="min-w-0 flex-1 truncate">{node.name}</span>
						{node.file ? (
							<span className="shrink-0 text-[10px] text-muted-foreground/70">
								{node.file.binary ? "asset" : formatBytes(node.file.size)}
							</span>
						) : null}
					</button>
				);
			})}
		</div>
	);
}

function CodeWorkspaceEditor({
	value,
	filePath,
	disabled,
	onChange,
	className,
}: {
	value: string;
	filePath: string | null;
	disabled?: boolean;
	onChange: (value: string) => void;
	className?: string;
}) {
	const highlightRef = useRef<HTMLPreElement | null>(null);
	const highlighted = useMemo(
		() => highlightCode(value, filePath),
		[filePath, value],
	);

	function syncScroll(event: React.UIEvent<HTMLTextAreaElement>) {
		if (!highlightRef.current) return;
		highlightRef.current.scrollTop = event.currentTarget.scrollTop;
		highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
	}

	return (
		<div
			className={cn(
				"relative min-h-[420px] flex-1 overflow-hidden bg-background",
				className,
			)}
		>
			<pre
				ref={highlightRef}
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 overflow-auto p-3 font-mono text-[11px] leading-4 whitespace-pre text-foreground"
				dangerouslySetInnerHTML={{ __html: highlighted || " " }}
			/>
			<textarea
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onScroll={syncScroll}
				disabled={disabled}
				spellCheck={false}
				wrap="off"
				className="absolute inset-0 h-full w-full resize-none overflow-auto border-0 bg-transparent p-3 font-mono text-[11px] leading-4 text-transparent caret-foreground outline-none selection:bg-primary/20 focus:ring-0 disabled:opacity-70"
			/>
		</div>
	);
}

type CodeWorkspaceArtifactEventDetail = {
	artifact: CodeWorkspaceArtifact;
	activate?: boolean;
};

function codeWorkspaceArtifactFromEvent(event: Event) {
	const detail = (event as CustomEvent<CodeWorkspaceArtifactEventDetail>)
		.detail;
	return detail?.artifact ?? null;
}

function dispatchCodeWorkspaceArtifact(
	artifact: CodeWorkspaceArtifact,
	options: { activate?: boolean } = {},
) {
	window.dispatchEvent(
		new CustomEvent<CodeWorkspaceArtifactEventDetail>(
			CODE_WORKSPACE_ARTIFACT_EVENT,
			{
				detail: { artifact, activate: options.activate },
			},
		),
	);
}

type WorkspaceArtifactDisplay = "full" | "summary";

function CodeWorkspaceArtifactSummary({
	artifact,
}: {
	artifact: CodeWorkspaceArtifact;
}) {
	return (
		<button
			type={BUTTON_TYPE}
			className="flex w-full items-center gap-2 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-left text-xs transition-colors hover:bg-primary/10"
			onClick={() =>
				dispatchCodeWorkspaceArtifact(artifact, { activate: true })
			}
		>
			<FileIcon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
			<span className="min-w-0 flex-1">
				<span className="block truncate font-medium text-foreground">
					{artifact.title}
				</span>
				<span className="block truncate text-[11px] text-muted-foreground">
					Workspace v{artifact.version} · {artifact.files.length} files
				</span>
			</span>
		</button>
	);
}

function GitHubPublishResultCard({ result }: { result: GitHubPublishOutput }) {
	return (
		<div className="w-fit max-w-full overflow-hidden rounded-xl border bg-card text-xs shadow-sm">
			<div className="flex items-center gap-2 border-b px-3 py-2">
				<GithubIcon className="size-4" aria-hidden="true" />
				<div className="min-w-0">
					<p className="font-medium text-foreground">{result.message}</p>
					<p className="truncate text-[11px] text-muted-foreground">
						{result.repository} ·{" "}
						{result.mode === "pull_request" ? "PR" : "direct push"} ·{" "}
						{result.targetBranch}
					</p>
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground">
				<span>Commit {result.commitSha.slice(0, 7)}</span>
				{result.pullRequestUrl ? (
					<a
						href={result.pullRequestUrl}
						target="_blank"
						rel="noreferrer"
						className="font-medium text-primary underline underline-offset-2"
					>
						Open PR
					</a>
				) : null}
			</div>
		</div>
	);
}

function ChatImageAttachmentCard({
	attachment,
}: {
	attachment: ChatImageAttachment;
}) {
	return (
		<a
			href={attachment.url}
			target="_blank"
			rel="noreferrer"
			className="group block w-fit overflow-hidden rounded-xl border bg-card text-xs shadow-sm transition-colors hover:border-primary/30"
		>
			<span
				role="img"
				aria-label={attachment.fileName}
				className="block h-64 w-[min(24rem,80vw)] bg-contain bg-center bg-no-repeat"
				style={{
					backgroundImage: `url("${attachment.url.replace(/"/g, '\\"')}")`,
				}}
			/>
			<span className="flex items-center gap-2 border-t px-2 py-1.5 text-[11px] text-muted-foreground">
				<FileIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
				<span className="max-w-56 truncate">{attachment.fileName}</span>
			</span>
		</a>
	);
}

type ChatFileAttachmentPreviewPayload = {
	attachment?: ChatFileAttachment;
	text?: string;
	error?: string;
};

function ChatFileAttachmentCard({
	attachment,
}: {
	attachment: ChatFileAttachment;
}) {
	const [previewOpen, setPreviewOpen] = useState(false);
	const [previewText, setPreviewText] = useState<string | null>(null);
	const [previewError, setPreviewError] = useState<string | null>(null);
	const [loadingPreview, setLoadingPreview] = useState(false);
	const canPreview = attachment.extractedTextChars > 0;
	const readLabel =
		attachment.extractionStatus === "unreadable"
			? "Stored safely"
			: attachment.extractionStatus === "truncated"
				? "Partially read"
				: "Readable";

	async function loadPreviewText() {
		if (!canPreview || previewText !== null || loadingPreview) return;
		setLoadingPreview(true);
		setPreviewError(null);
		try {
			const response = await fetch(
				`/api/workspace/chat-attachments/${attachment.id}/extracted`,
			);
			const data = (await response
				.json()
				.catch(() => null)) as ChatFileAttachmentPreviewPayload | null;
			if (!response.ok) {
				throw new Error(data?.error || "Failed to load extracted file text");
			}
			setPreviewText(data?.text ?? "");
		} catch (error) {
			setPreviewError(
				error instanceof Error
					? error.message
					: "Failed to load extracted file text",
			);
		} finally {
			setLoadingPreview(false);
		}
	}

	function openPreview() {
		setPreviewOpen(true);
		void loadPreviewText();
	}

	return (
		<>
			<div className="group flex w-fit max-w-[min(28rem,84vw)] items-center gap-3 rounded-xl border bg-card p-3 text-xs shadow-sm transition-colors hover:border-primary/30">
				<span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
					<FileIcon className="size-4" aria-hidden="true" />
				</span>
				<span className="min-w-0 flex-1">
					<span className="block truncate font-medium text-foreground">
						{attachment.fileName}
					</span>
					<span className="block truncate text-[11px] text-muted-foreground">
						{readLabel} · {formatBytes(attachment.size)}
						{attachment.extractedTextChars > 0
							? ` · ${attachment.extractedTextChars.toLocaleString()} chars`
							: ""}
					</span>
				</span>
				<div className="flex shrink-0 items-center gap-1">
					{canPreview ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-8 gap-1.5 px-2 text-xs"
							onClick={openPreview}
						>
							<Maximize2Icon className="size-3" aria-hidden="true" />
							View
						</Button>
					) : null}
					<Button
						asChild
						variant="ghost"
						size="sm"
						className="h-8 gap-1.5 px-2 text-xs"
					>
						<a href={attachment.url} target="_blank" rel="noreferrer">
							<DownloadIcon className="size-3" aria-hidden="true" />
							Download
						</a>
					</Button>
				</div>
			</div>
			<Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
				<DialogContent className="flex max-h-[85dvh] max-w-3xl flex-col overflow-hidden">
					<div className="flex min-w-0 items-start justify-between gap-3 border-b pb-3">
						<div className="min-w-0">
							<DialogTitle className="truncate text-base">
								{attachment.fileName}
							</DialogTitle>
							<p className="mt-1 text-xs text-muted-foreground">
								{readLabel} · {formatBytes(attachment.size)} ·{" "}
								{attachment.extractedTextChars.toLocaleString()} extracted chars
							</p>
						</div>
						<div className="flex shrink-0 items-center gap-1 pr-8">
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="h-8 gap-1.5 px-2 text-xs"
								disabled={!previewText}
								onClick={() => {
									if (!previewText) return;
									void navigator.clipboard.writeText(previewText);
								}}
							>
								<CopyIcon className="size-3" aria-hidden="true" />
								Copy
							</Button>
							<Button
								asChild
								variant="ghost"
								size="sm"
								className="h-8 gap-1.5 px-2 text-xs"
							>
								<a href={attachment.url} target="_blank" rel="noreferrer">
									<DownloadIcon className="size-3" aria-hidden="true" />
									Download
								</a>
							</Button>
						</div>
					</div>
					{loadingPreview ? (
						<Skeleton className="h-64 w-full rounded-xl" />
					) : previewError ? (
						<p className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
							{previewError}
						</p>
					) : (
						<pre className="min-h-0 flex-1 overflow-auto rounded-xl border bg-muted/20 p-3 whitespace-pre-wrap font-mono text-xs leading-5 text-foreground">
							{previewText || "No extracted text available."}
						</pre>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}

type GitHubRepositoryOption = {
	id: string;
	fullName: string;
	defaultBranch: string;
	private: boolean;
};

type GitHubBranchOption = {
	name: string;
	protected: boolean;
};

type GitHubPublishResult = {
	kind: "github_publish_result";
	mode: "pull_request" | "direct_push";
	repository: string;
	targetBranch: string;
	sourceBranch: string | null;
	commitSha: string;
	pullRequestUrl: string | null;
	message: string;
};

function GitHubPublishDialog({
	artifact,
	workspaceId,
	open,
	onOpenChange,
}: {
	artifact: CodeWorkspaceArtifact;
	workspaceId?: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [loading, setLoading] = useState(false);
	const [publishing, setPublishing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [connectUrl, setConnectUrl] = useState<string | null>(null);
	const [configured, setConfigured] = useState(true);
	const [repositories, setRepositories] = useState<GitHubRepositoryOption[]>(
		[],
	);
	const [branches, setBranches] = useState<GitHubBranchOption[]>([]);
	const [repositoryId, setRepositoryId] = useState("");
	const [targetBranch, setTargetBranch] = useState("");
	const [sourceBranch, setSourceBranch] = useState("");
	const [targetDirectory, setTargetDirectory] = useState("");
	const [mode, setMode] = useState<"pull_request" | "direct_push">(
		"pull_request",
	);
	const [commitMessage, setCommitMessage] = useState(
		`Update ${artifact.title}`,
	);
	const [confirmDirectPush, setConfirmDirectPush] = useState(false);
	const [result, setResult] = useState<GitHubPublishResult | null>(null);
	const selectedRepository = repositories.find(
		(repo) => repo.id === repositoryId,
	);

	useEffect(() => {
		if (!open || !workspaceId) return;
		const currentWorkspaceId = workspaceId;
		let cancelled = false;
		async function loadStatus() {
			setLoading(true);
			setError(null);
			setResult(null);
			try {
				const response = await fetch(
					`/api/workspace/github/status?workspaceId=${encodeURIComponent(currentWorkspaceId)}`,
				);
				const data = (await response.json().catch(() => null)) as {
					configured?: boolean;
					connectPath?: string | null;
					connectUrl?: string | null;
					repositories?: GitHubRepositoryOption[];
					error?: string;
				} | null;
				if (!response.ok) throw new Error(data?.error || "GitHub unavailable");
				if (cancelled) return;
				setConfigured(Boolean(data?.configured));
				setConnectUrl(data?.connectPath ?? data?.connectUrl ?? null);
				const nextRepos = data?.repositories ?? [];
				setRepositories(nextRepos);
				const nextRepo = nextRepos[0];
				setRepositoryId((current) => current || nextRepo?.id || "");
				setTargetBranch(
					(current) => current || nextRepo?.defaultBranch || "main",
				);
			} catch (loadError) {
				if (!cancelled) {
					setError(
						loadError instanceof Error
							? loadError.message
							: "Failed to load GitHub status",
					);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		void loadStatus();
		return () => {
			cancelled = true;
		};
	}, [open, workspaceId]);

	useEffect(() => {
		if (!open || !workspaceId || !repositoryId) return;
		const currentWorkspaceId = workspaceId;
		let cancelled = false;
		async function loadBranches() {
			try {
				const response = await fetch(
					`/api/workspace/github/branches?workspaceId=${encodeURIComponent(currentWorkspaceId)}&repositoryId=${encodeURIComponent(repositoryId)}`,
				);
				const data = (await response.json().catch(() => null)) as {
					branches?: GitHubBranchOption[];
					error?: string;
				} | null;
				if (!response.ok)
					throw new Error(data?.error || "Failed to load branches");
				if (cancelled) return;
				const nextBranches = data?.branches ?? [];
				setBranches(nextBranches);
				const selected = repositories.find((repo) => repo.id === repositoryId);
				setTargetBranch((current) =>
					current && nextBranches.some((branch) => branch.name === current)
						? current
						: selected?.defaultBranch || nextBranches[0]?.name || "main",
				);
			} catch (loadError) {
				if (!cancelled) {
					setBranches([]);
					setError(
						loadError instanceof Error
							? loadError.message
							: "Failed to load branches",
					);
				}
			}
		}
		void loadBranches();
		return () => {
			cancelled = true;
		};
	}, [open, repositories, repositoryId, workspaceId]);

	async function publish() {
		if (!workspaceId || !repositoryId || !targetBranch.trim()) return;
		if (mode === "direct_push" && !confirmDirectPush) {
			setError("Confirm direct push before publishing.");
			return;
		}
		setPublishing(true);
		setError(null);
		try {
			const response = await fetch("/api/workspace/github/publish", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					workspaceId,
					projectId: artifact.projectId,
					repositoryId,
					mode,
					targetBranch,
					sourceBranch: sourceBranch.trim() || undefined,
					targetDirectory: targetDirectory.trim() || undefined,
					commitMessage: commitMessage.trim(),
					pullRequestTitle: commitMessage.trim(),
					confirmDirectPush,
				}),
			});
			const data = (await response.json().catch(() => null)) as {
				result?: GitHubPublishResult;
				error?: string;
			} | null;
			if (!response.ok || !data?.result) {
				throw new Error(data?.error || "GitHub publish failed");
			}
			setResult(data.result);
		} catch (publishError) {
			setError(
				publishError instanceof Error
					? publishError.message
					: "GitHub publish failed",
			);
		} finally {
			setPublishing(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
				<DialogTitle>Publish to GitHub</DialogTitle>
				{!workspaceId ? (
					<p className="text-sm text-muted-foreground">
						GitHub publishing needs an active workspace context.
					</p>
				) : loading ? (
					<p className="text-sm text-muted-foreground">Loading GitHub…</p>
				) : !configured ? (
					<p className="text-sm text-muted-foreground">
						GitHub publishing is not configured on this AI Hub instance.
					</p>
				) : repositories.length === 0 ? (
					<div className="space-y-3">
						<p className="text-sm text-muted-foreground">
							Connect your GitHub account to publish this code workspace to
							private or public repositories that you authorize.
						</p>
						<Button asChild disabled={!connectUrl}>
							<a href={connectUrl ?? "#"}>
								<GithubIcon className="size-4" aria-hidden="true" />
								Connect GitHub
							</a>
						</Button>
					</div>
				) : result ? (
					<div className="space-y-3 text-sm">
						<p className="font-medium text-foreground">{result.message}</p>
						<p className="text-muted-foreground">
							Commit {result.commitSha.slice(0, 7)} on {result.repository}
							{result.sourceBranch
								? ` from ${result.sourceBranch} to ${result.targetBranch}`
								: `:${result.targetBranch}`}
						</p>
						{result.pullRequestUrl ? (
							<Button asChild>
								<a
									href={result.pullRequestUrl}
									target="_blank"
									rel="noreferrer"
								>
									Open pull request
								</a>
							</Button>
						) : null}
					</div>
				) : (
					<div className="space-y-4">
						<div className="grid gap-1.5">
							<label className="text-xs font-medium" htmlFor="github-repo">
								Repository
							</label>
							<select
								id="github-repo"
								className="h-9 rounded-md border bg-background px-2 text-sm"
								value={repositoryId}
								onChange={(event) => {
									setRepositoryId(event.target.value);
									const repo = repositories.find(
										(item) => item.id === event.target.value,
									);
									setTargetBranch(repo?.defaultBranch || "main");
								}}
							>
								{repositories.map((repo) => (
									<option key={repo.id} value={repo.id}>
										{repo.fullName}
										{repo.private ? " · private" : ""}
									</option>
								))}
							</select>
						</div>
						<div className="grid gap-1.5">
							<label className="text-xs font-medium" htmlFor="github-mode">
								Mode
							</label>
							<select
								id="github-mode"
								className="h-9 rounded-md border bg-background px-2 text-sm"
								value={mode}
								onChange={(event) => {
									setMode(event.target.value as "pull_request" | "direct_push");
									setConfirmDirectPush(false);
								}}
							>
								<option value="pull_request">Create a pull request</option>
								<option value="direct_push">Push directly to branch</option>
							</select>
						</div>
						<div className="grid gap-1.5">
							<label className="text-xs font-medium" htmlFor="github-branch">
								Target branch
							</label>
							<input
								id="github-branch"
								list="github-branches"
								className="h-9 rounded-md border bg-background px-2 text-sm"
								value={targetBranch}
								onChange={(event) => setTargetBranch(event.target.value)}
							/>
							<datalist id="github-branches">
								{branches.map((branch) => (
									<option key={branch.name} value={branch.name} />
								))}
							</datalist>
							{targetBranch === selectedRepository?.defaultBranch ? (
								<p className="text-[11px] text-muted-foreground">
									This is the default branch for {selectedRepository.fullName}.
								</p>
							) : null}
						</div>
						{mode === "pull_request" ? (
							<div className="grid gap-1.5">
								<label className="text-xs font-medium" htmlFor="github-source">
									Source branch (optional)
								</label>
								<input
									id="github-source"
									className="h-9 rounded-md border bg-background px-2 text-sm"
									placeholder="ai-hub/update-page"
									value={sourceBranch}
									onChange={(event) => setSourceBranch(event.target.value)}
								/>
							</div>
						) : null}
						<div className="grid gap-1.5">
							<label className="text-xs font-medium" htmlFor="github-dir">
								Target directory (optional)
							</label>
							<input
								id="github-dir"
								className="h-9 rounded-md border bg-background px-2 text-sm"
								placeholder="public/site"
								value={targetDirectory}
								onChange={(event) => setTargetDirectory(event.target.value)}
							/>
						</div>
						<div className="grid gap-1.5">
							<label className="text-xs font-medium" htmlFor="github-commit">
								Commit message
							</label>
							<input
								id="github-commit"
								className="h-9 rounded-md border bg-background px-2 text-sm"
								value={commitMessage}
								onChange={(event) => setCommitMessage(event.target.value)}
							/>
						</div>
						<div className="rounded-lg border bg-muted/30 p-3 text-[11px] text-muted-foreground">
							<p className="mb-1 font-medium text-foreground">
								Files to publish
							</p>
							<p>
								{artifact.files.length} file
								{artifact.files.length === 1 ? "" : "s"} from workspace v
								{artifact.version}. GitHub branch protections still apply.
							</p>
						</div>
						{mode === "direct_push" ? (
							<label className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
								<input
									type="checkbox"
									checked={confirmDirectPush}
									onChange={(event) =>
										setConfirmDirectPush(event.target.checked)
									}
								/>
								<span>
									I confirm direct push to{" "}
									<strong>{targetBranch || "this branch"}</strong>. No
									force-push will be used.
								</span>
							</label>
						) : null}
						{error ? <p className="text-xs text-destructive">{error}</p> : null}
						<div className="flex justify-end gap-2">
							<Button
								type={BUTTON_TYPE}
								variant={OUTLINE_VARIANT}
								onClick={() => onOpenChange(false)}
							>
								Cancel
							</Button>
							<Button
								type={BUTTON_TYPE}
								disabled={
									publishing ||
									!repositoryId ||
									!targetBranch.trim() ||
									!commitMessage.trim() ||
									(mode === "direct_push" && !confirmDirectPush)
								}
								onClick={() => void publish()}
							>
								<UploadCloudIcon className="size-4" aria-hidden="true" />
								{publishing ? "Publishing…" : "Publish"}
							</Button>
						</div>
					</div>
				)}
				{error && (loading || repositories.length === 0) ? (
					<p className="mt-3 text-xs text-destructive">{error}</p>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

function codeWorkspaceFileUrl(projectId: string, filePath: string) {
	return `/api/workspace/code-projects/${projectId}/files?path=${encodeURIComponent(filePath)}`;
}

function dirnamePath(filePath: string) {
	const slashIndex = filePath.lastIndexOf("/");
	return slashIndex === -1 ? "" : filePath.slice(0, slashIndex);
}

function normalizeWorkspaceHref(fromPath: string, href: string) {
	if (
		!href ||
		href.startsWith("#") ||
		/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)
	) {
		return null;
	}
	const cleanHref = href.split("#")[0]?.split("?")[0] ?? "";
	const parts = [
		...dirnamePath(fromPath).split("/"),
		...cleanHref.split("/"),
	].filter(Boolean);
	const normalized: string[] = [];
	for (const part of parts) {
		if (part === ".") continue;
		if (part === "..") {
			normalized.pop();
			continue;
		}
		normalized.push(part);
	}
	const path = normalized.join("/");
	return path && !path.endsWith("/") ? path : `${path}index.html`;
}

function metaRefreshTarget(html: string, fromPath: string) {
	const metaTag = html.match(
		/<meta\b[^>]*http-equiv=["']?refresh["']?[^>]*>/i,
	)?.[0];
	if (!metaTag) return null;
	const urlMatch = metaTag.match(/url\s*=\s*([^;"'>\s]+)/i);
	return urlMatch?.[1]
		? normalizeWorkspaceHref(fromPath, urlMatch[1].trim())
		: null;
}

function stripMetaRefresh(html: string) {
	return html.replace(/<meta\b[^>]*http-equiv=["']?refresh["']?[^>]*>/gi, "");
}

function isPreviewTokenSegment(value: string | undefined) {
	return Boolean(
		value &&
			/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
				value,
			),
	);
}

function previewRoutePrefix(artifact: CodeWorkspaceArtifact) {
	const marker = `/api/workspace/code-projects/${artifact.projectId}/preview`;
	const rawPreviewUrl = artifact.previewUrl?.split("?")[0] ?? marker;
	const markerIndex = rawPreviewUrl.indexOf(marker);
	if (markerIndex === -1) return marker;
	const suffix = rawPreviewUrl.slice(markerIndex + marker.length);
	const firstSegment = suffix.split("/").filter(Boolean)[0];
	return isPreviewTokenSegment(firstSegment)
		? `${marker}/${firstSegment}`
		: marker;
}

function absolutePreviewUrl(path: string) {
	if (typeof window === "undefined") return path;
	return new URL(path, window.location.origin).toString();
}

function previewBaseHref(artifact: CodeWorkspaceArtifact, filePath: string) {
	const directory = dirnamePath(filePath);
	return absolutePreviewUrl(
		`${previewRoutePrefix(artifact)}${directory ? `/${directory}` : ""}/`,
	);
}

function previewSrcDocCsp() {
	const origin =
		typeof window === "undefined" ? "'self'" : window.location.origin;
	return [
		"default-src 'none'",
		"script-src 'unsafe-inline' 'unsafe-eval'",
		"style-src 'unsafe-inline'",
		`img-src ${origin} data: blob:`,
		`font-src ${origin} data:`,
		`media-src ${origin} data: blob:`,
		"connect-src 'none'",
		"frame-src 'none'",
		"object-src 'none'",
		`base-uri ${origin}`,
		"form-action 'none'",
	].join("; ");
}

function injectPreviewSecurityHead(
	html: string,
	artifact: CodeWorkspaceArtifact,
	path: string,
) {
	const baseTag = `<base href="${previewBaseHref(artifact, path)}" />`;
	const cspTag = `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(previewSrcDocCsp())}" />`;
	const headTags = `${cspTag}${baseTag}`;
	if (/<head\b[^>]*>/i.test(html)) {
		return html.replace(/<head\b([^>]*)>/i, `<head$1>${headTags}`);
	}
	return `${headTags}${html}`;
}

function injectPreviewNavigationBridge(
	html: string,
	artifact: CodeWorkspaceArtifact,
	path: string,
) {
	const bridgeScript = `<script>(()=>{const projectId=${JSON.stringify(artifact.projectId)};const currentPath=${JSON.stringify(path)};function resolveLocal(href){try{if(!href||href.startsWith('#')||/^(mailto|tel|javascript):/i.test(href))return null;const url=new URL(href,'https://workspace.local/'+currentPath);if(url.origin!=='https://workspace.local')return null;let path=decodeURIComponent(url.pathname.replace(/^\\//,''));if(!path||path.endsWith('/'))path+='index.html';return path;}catch{return null;}}document.addEventListener('click',event=>{const target=event.target&&event.target.closest?event.target.closest('a[href]'):null;if(!target||target.target==='_blank'||target.hasAttribute('download'))return;const path=resolveLocal(target.getAttribute('href')||'');if(!path)return;event.preventDefault();window.parent.postMessage({type:'code-workspace-preview:navigate',projectId,path},'*');},true);})();</script>`;
	if (/<\/body>/i.test(html)) {
		return html.replace(/<\/body>/i, `${bridgeScript}</body>`);
	}
	return `${html}${bridgeScript}`;
}

function buildPreviewSrcDoc(
	html: string,
	artifact: CodeWorkspaceArtifact,
	path: string,
) {
	return injectPreviewNavigationBridge(
		injectPreviewSecurityHead(stripMetaRefresh(html), artifact, path),
		artifact,
		path,
	);
}

async function fetchCodeWorkspaceTextFile(projectId: string, filePath: string) {
	const response = await fetch(codeWorkspaceFileUrl(projectId, filePath));
	const data = (await response.json().catch(() => null)) as {
		content?: string;
		error?: string;
	} | null;
	if (!response.ok || typeof data?.content !== "string") {
		throw new Error(data?.error || "Failed to load file");
	}
	return data.content;
}

const HTML_ATTRIBUTE_PATTERNS = {
	href: /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
	media: /\bmedia\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
	rel: /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
	src: /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
} as const;

function htmlAttributeValue(
	tag: string,
	name: keyof typeof HTML_ATTRIBUTE_PATTERNS,
) {
	const match = tag.match(HTML_ATTRIBUTE_PATTERNS[name]);
	return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function escapeHtmlAttribute(value: string) {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

async function replacePreviewMatches(
	value: string,
	pattern: RegExp,
	replacer: (match: RegExpMatchArray) => Promise<string>,
) {
	let result = "";
	let cursor = 0;
	for (const match of value.matchAll(pattern)) {
		const index = match.index ?? cursor;
		result += value.slice(cursor, index);
		result += await replacer(match);
		cursor = index + match[0].length;
	}
	return `${result}${value.slice(cursor)}`;
}

async function inlineLocalPreviewStyles(
	html: string,
	artifact: CodeWorkspaceArtifact,
	path: string,
) {
	return replacePreviewMatches(html, /<link\b[^>]*>/gi, async (match) => {
		const tag = match[0];
		const rel = htmlAttributeValue(tag, "rel")?.toLowerCase() ?? "";
		if (!rel.split(/\s+/).includes("stylesheet")) return tag;
		const href = htmlAttributeValue(tag, "href");
		const stylesheetPath = href ? normalizeWorkspaceHref(path, href) : null;
		if (
			!stylesheetPath ||
			!artifact.files.some(
				(file) => file.path === stylesheetPath && !file.binary,
			)
		) {
			return tag;
		}
		try {
			const css = await fetchCodeWorkspaceTextFile(
				artifact.projectId,
				stylesheetPath,
			);
			const media = htmlAttributeValue(tag, "media");
			return `<style${media ? ` media="${escapeHtmlAttribute(media)}"` : ""}>\n${escapeClosingTags(css)}\n</style>`;
		} catch {
			return tag;
		}
	});
}

async function inlineLocalPreviewScripts(
	html: string,
	artifact: CodeWorkspaceArtifact,
	path: string,
) {
	return replacePreviewMatches(
		html,
		/<script\b[^>]*\bsrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*>\s*<\/script>/gi,
		async (match) => {
			const tag = match[0];
			const openingTag = tag.match(/^<script\b([^>]*)>/i)?.[1] ?? "";
			const src = htmlAttributeValue(tag, "src");
			const scriptPath = src ? normalizeWorkspaceHref(path, src) : null;
			if (
				!scriptPath ||
				!artifact.files.some((file) => file.path === scriptPath && !file.binary)
			) {
				return tag;
			}
			try {
				const js = await fetchCodeWorkspaceTextFile(
					artifact.projectId,
					scriptPath,
				);
				const attrs = openingTag
					.replace(/\s+src\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, "")
					.replace(
						/\s+(?:integrity|crossorigin|referrerpolicy)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
						"",
					);
				return `<script${attrs}>\n${escapeClosingTags(js)}\n</script>`;
			} catch {
				return tag;
			}
		},
	);
}

async function inlineLocalPreviewAssets(
	html: string,
	artifact: CodeWorkspaceArtifact,
	path: string,
) {
	return inlineLocalPreviewScripts(
		await inlineLocalPreviewStyles(html, artifact, path),
		artifact,
		path,
	);
}

function CodeWorkspacePreviewFrame({
	artifact,
}: {
	artifact: CodeWorkspaceArtifact;
}) {
	const [previewPath, setPreviewPath] = useState(artifact.rootFile);
	const [effectivePath, setEffectivePath] = useState(artifact.rootFile);
	const [srcDoc, setSrcDoc] = useState("");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		function handlePreviewNavigation(event: MessageEvent) {
			const data = event.data as {
				type?: unknown;
				projectId?: unknown;
				path?: unknown;
			};
			if (
				data?.type !== "code-workspace-preview:navigate" ||
				data.projectId !== artifact.projectId ||
				typeof data.path !== "string"
			) {
				return;
			}
			if (
				!artifact.files.some((file) => file.path === data.path && !file.binary)
			) {
				setError(`Preview file not found: ${data.path}`);
				return;
			}
			setPreviewPath(data.path);
		}
		window.addEventListener("message", handlePreviewNavigation);
		return () => window.removeEventListener("message", handlePreviewNavigation);
	}, [artifact.files, artifact.projectId]);

	useEffect(() => {
		if (!previewPath) return;
		let cancelled = false;
		async function loadPreview() {
			setError(null);
			try {
				let path = previewPath ?? "";
				let html = await fetchCodeWorkspaceTextFile(artifact.projectId, path);
				const redirectPath = metaRefreshTarget(html, path);
				if (
					redirectPath &&
					artifact.files.some(
						(file) => file.path === redirectPath && !file.binary,
					)
				) {
					path = redirectPath;
					html = await fetchCodeWorkspaceTextFile(artifact.projectId, path);
				}
				const inlinedHtml = await inlineLocalPreviewAssets(
					html,
					artifact,
					path,
				);
				if (!cancelled) {
					setEffectivePath(path);
					setSrcDoc(buildPreviewSrcDoc(inlinedHtml, artifact, path));
				}
			} catch (loadError) {
				if (!cancelled) {
					setSrcDoc("");
					setError(
						loadError instanceof Error
							? loadError.message
							: "Failed to load preview",
					);
				}
			}
		}
		void loadPreview();
		return () => {
			cancelled = true;
		};
	}, [artifact, previewPath]);

	if (!artifact.rootFile) {
		return (
			<div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
				No HTML file was detected. Create an index.html file to enable preview.
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-destructive">
				{error}
			</div>
		);
	}

	return srcDoc ? (
		<iframe
			key={`${artifact.projectId}:${artifact.version}:${effectivePath}`}
			title={`${artifact.title} preview`}
			srcDoc={srcDoc}
			sandbox="allow-scripts allow-modals"
			className="min-h-[480px] flex-1 bg-white"
		/>
	) : (
		<div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
			Loading preview…
		</div>
	);
}

export function CodeWorkspaceArtifactCard({
	artifact,
	workspaceId,
	variant = "card",
	activateOnMount = false,
}: {
	artifact: CodeWorkspaceArtifact;
	workspaceId?: string;
	variant?: "card" | "workbench";
	activateOnMount?: boolean;
}) {
	const [currentArtifact, setCurrentArtifact] = useState(artifact);
	const [selectedPath, setSelectedPath] = useState<string | null>(
		artifact.rootFile ??
			artifact.files.find((file) => !file.binary)?.path ??
			null,
	);
	const [content, setContent] = useState("");
	const [fileReloadKey, setFileReloadKey] = useState(0);
	const [loadingFile, setLoadingFile] = useState(false);
	const [savingFile, setSavingFile] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [fullscreenPane, setFullscreenPane] = useState<
		"code" | "preview" | null
	>(null);
	const [publishOpen, setPublishOpen] = useState(false);
	const selectedFile = currentArtifact.files.find(
		(file) => file.path === selectedPath,
	);
	const fileTree = useMemo(
		() => buildCodeWorkspaceTree(currentArtifact.files),
		[currentArtifact.files],
	);

	useEffect(() => {
		dispatchCodeWorkspaceArtifact(artifact, { activate: activateOnMount });
		queueMicrotask(() => setCurrentArtifact(artifact));
	}, [activateOnMount, artifact]);

	useEffect(() => {
		function handleWorkspaceUpdate(event: Event) {
			const nextArtifact = codeWorkspaceArtifactFromEvent(event);
			if (nextArtifact?.projectId !== artifact.projectId) return;
			setCurrentArtifact((current) =>
				nextArtifact.version >= current.version ? nextArtifact : current,
			);
		}
		window.addEventListener(
			CODE_WORKSPACE_ARTIFACT_EVENT,
			handleWorkspaceUpdate,
		);
		return () => {
			window.removeEventListener(
				CODE_WORKSPACE_ARTIFACT_EVENT,
				handleWorkspaceUpdate,
			);
		};
	}, [artifact.projectId]);

	useEffect(() => {
		if (
			selectedPath &&
			currentArtifact.files.some((file) => file.path === selectedPath)
		) {
			return;
		}
		queueMicrotask(() => {
			setSelectedPath(
				currentArtifact.rootFile ??
					currentArtifact.files.find((file) => !file.binary)?.path ??
					null,
			);
		});
	}, [currentArtifact, selectedPath]);

	useEffect(() => {
		if (!selectedPath || selectedFile?.binary) {
			queueMicrotask(() => setContent(""));
			return;
		}
		let cancelled = false;
		async function loadSelectedFile() {
			setLoadingFile(true);
			setError(null);
			try {
				const response = await fetch(
					`/api/workspace/code-projects/${currentArtifact.projectId}/files?path=${encodeURIComponent(selectedPath ?? "")}`,
				);
				const data = (await response.json().catch(() => null)) as {
					content?: string;
					error?: string;
				} | null;
				if (!response.ok || typeof data?.content !== "string") {
					throw new Error(data?.error || "Failed to load file");
				}
				if (!cancelled) setContent(data.content);
			} catch (loadError) {
				if (!cancelled) {
					setError(
						loadError instanceof Error
							? loadError.message
							: "Failed to load file",
					);
				}
			} finally {
				if (!cancelled) setLoadingFile(false);
			}
		}
		void loadSelectedFile();
		return () => {
			cancelled = true;
		};
	}, [
		currentArtifact.projectId,
		fileReloadKey,
		selectedFile?.binary,
		selectedPath,
	]);

	async function saveSelectedFile() {
		if (!selectedPath || selectedFile?.binary) return;
		setSavingFile(true);
		setError(null);
		try {
			const response = await fetch(
				`/api/workspace/code-projects/${currentArtifact.projectId}/files`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ path: selectedPath, content }),
				},
			);
			const nextArtifact = (await response.json().catch(() => null)) as
				| CodeWorkspaceArtifact
				| { error?: string }
				| null;
			if (!response.ok || !isCodeWorkspaceArtifactOutput(nextArtifact)) {
				throw new Error(
					(nextArtifact as { error?: string } | null)?.error ||
						"Failed to save file",
				);
			}
			setCurrentArtifact(nextArtifact);
			dispatchCodeWorkspaceArtifact(nextArtifact, { activate: true });
		} catch (saveError) {
			setError(
				saveError instanceof Error ? saveError.message : "Failed to save file",
			);
		} finally {
			setSavingFile(false);
		}
	}

	async function deleteSelectedFile() {
		if (!selectedPath) return;
		const confirmed = window.confirm(`Delete ${selectedPath}?`);
		if (!confirmed) return;
		setSavingFile(true);
		setError(null);
		try {
			const response = await fetch(
				`/api/workspace/code-projects/${currentArtifact.projectId}/files`,
				{
					method: "DELETE",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ path: selectedPath }),
				},
			);
			const nextArtifact = (await response.json().catch(() => null)) as
				| CodeWorkspaceArtifact
				| { error?: string }
				| null;
			if (!response.ok || !isCodeWorkspaceArtifactOutput(nextArtifact)) {
				throw new Error(
					(nextArtifact as { error?: string } | null)?.error ||
						"Failed to delete file",
				);
			}
			setCurrentArtifact(nextArtifact);
			dispatchCodeWorkspaceArtifact(nextArtifact, { activate: true });
		} catch (deleteError) {
			setError(
				deleteError instanceof Error
					? deleteError.message
					: "Failed to delete file",
			);
		} finally {
			setSavingFile(false);
		}
	}

	return (
		<>
			<GitHubPublishDialog
				artifact={currentArtifact}
				workspaceId={workspaceId}
				open={publishOpen}
				onOpenChange={setPublishOpen}
			/>
			<div
				className={cn(
					"overflow-hidden rounded-xl border border-primary/20 bg-background text-xs shadow-sm",
					variant === "workbench" &&
						"flex h-full min-h-0 flex-col rounded-none border-0 shadow-none",
				)}
			>
				<div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-muted/35 px-3 py-2.5">
					<div className="min-w-0">
						<p className="truncate font-medium text-foreground">
							{currentArtifact.title}
						</p>
						<p className="text-[11px] text-muted-foreground">
							Code workspace · v{currentArtifact.version} ·{" "}
							{currentArtifact.files.length} files
						</p>
					</div>
					<div className="flex items-center gap-1.5">
						<Button
							type={BUTTON_TYPE}
							variant={OUTLINE_VARIANT}
							size="sm"
							className="h-7 px-2.5 text-[11px]"
							onClick={() => setPublishOpen(true)}
						>
							<GithubIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
							GitHub
						</Button>
						<Button
							asChild
							type={BUTTON_TYPE}
							variant={OUTLINE_VARIANT}
							size="sm"
							className="h-7 px-2.5 text-[11px]"
						>
							<a href={currentArtifact.downloadUrl}>
								<DownloadIcon
									className={COMPACT_ICON_CLASS}
									aria-hidden="true"
								/>
								ZIP
							</a>
						</Button>
					</div>
				</div>
				{currentArtifact.message ? (
					<div className="border-b border-border/40 px-3 py-2 text-[11px] text-muted-foreground">
						{currentArtifact.message}
					</div>
				) : null}
				<div
					className={cn(
						"grid min-h-[520px] grid-cols-1 lg:grid-cols-[13rem_minmax(0,1fr)_minmax(18rem,1fr)]",
						variant === "workbench" && "min-h-0 flex-1",
					)}
				>
					<div className="border-b border-border/50 bg-muted/20 lg:border-r lg:border-b-0">
						<div className="border-b border-border/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
							Files
						</div>
						<div className="max-h-64 overflow-auto p-2 lg:max-h-[480px]">
							<CodeWorkspaceFileTree
								nodes={fileTree}
								selectedPath={selectedPath}
								onSelect={setSelectedPath}
							/>
						</div>
					</div>
					<div className="flex min-w-0 flex-col border-b border-border/50 lg:border-r lg:border-b-0">
						<div className="flex min-h-10 items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
							<div className="min-w-0">
								<p className="truncate font-medium text-foreground">
									{selectedPath ?? "No file selected"}
								</p>
								<p className="text-[10px] text-muted-foreground">
									{selectedFile?.binary
										? "Binary asset"
										: (selectedFile?.mimeType ?? "Select a file")}
								</p>
							</div>
							<div className="flex shrink-0 items-center gap-1.5">
								<Button
									type={BUTTON_TYPE}
									variant={GHOST_VARIANT}
									size="sm"
									className="h-7 px-2 text-[11px]"
									disabled={!selectedPath || selectedFile?.binary}
									onClick={() => setFullscreenPane("code")}
								>
									<Maximize2Icon
										className={COMPACT_ICON_CLASS}
										aria-hidden="true"
									/>
								</Button>
								<Button
									type={BUTTON_TYPE}
									variant={GHOST_VARIANT}
									size="sm"
									className="h-7 px-2 text-[11px]"
									disabled={
										!selectedPath || selectedFile?.binary || loadingFile
									}
									onClick={() => setFileReloadKey((key) => key + 1)}
								>
									<RefreshCcwIcon
										className={COMPACT_ICON_CLASS}
										aria-hidden="true"
									/>
								</Button>
								<Button
									type={BUTTON_TYPE}
									variant={OUTLINE_VARIANT}
									size="sm"
									className="h-7 px-2 text-[11px]"
									disabled={!selectedPath || selectedFile?.binary || savingFile}
									onClick={() => void saveSelectedFile()}
								>
									<SaveIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
									Save
								</Button>
								<Button
									type={BUTTON_TYPE}
									variant={GHOST_VARIANT}
									size="sm"
									className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
									disabled={!selectedPath || savingFile}
									onClick={() => void deleteSelectedFile()}
								>
									<Trash2Icon
										className={COMPACT_ICON_CLASS}
										aria-hidden="true"
									/>
								</Button>
							</div>
						</div>
						{error ? (
							<div className="border-b border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
								{error}
							</div>
						) : null}
						{selectedFile?.binary ? (
							<div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
								Binary assets are served in preview and included in ZIP
								download.
							</div>
						) : (
							<CodeWorkspaceEditor
								value={loadingFile ? "Loading file…" : content}
								filePath={selectedPath}
								disabled={!selectedPath || loadingFile || savingFile}
								onChange={setContent}
							/>
						)}
					</div>
					<div className="flex min-w-0 flex-col bg-white">
						<div className="flex min-h-10 items-center justify-between gap-2 border-b border-border/40 bg-background px-3 py-2">
							<div>
								<p className="font-medium text-foreground">Live preview</p>
								<p className="text-[10px] text-muted-foreground">
									{currentArtifact.rootFile ?? "No HTML entry"}
								</p>
							</div>
							<Button
								type={BUTTON_TYPE}
								variant={GHOST_VARIANT}
								size="sm"
								className="h-7 px-2 text-[11px]"
								disabled={!currentArtifact.rootFile}
								onClick={() => setFullscreenPane("preview")}
							>
								<Maximize2Icon
									className={COMPACT_ICON_CLASS}
									aria-hidden="true"
								/>
								Fullscreen
							</Button>
						</div>
						<CodeWorkspacePreviewFrame
							key={`${currentArtifact.projectId}:${currentArtifact.version}:${currentArtifact.rootFile ?? "no-root"}`}
							artifact={currentArtifact}
						/>
					</div>
				</div>
				<Dialog
					open={fullscreenPane !== null}
					onOpenChange={(open) => !open && setFullscreenPane(null)}
				>
					<DialogContent className="!fixed !inset-0 flex !h-dvh !w-full !translate-x-0 !translate-y-0 flex-col overflow-hidden !rounded-none !border-0 bg-background p-0 sm:!max-w-none">
						<div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
							<div className="min-w-0">
								<DialogTitle className="truncate text-base font-semibold">
									{fullscreenPane === "preview"
										? "Live preview"
										: (selectedPath ?? "Code")}
								</DialogTitle>
								<p className="mt-0.5 text-xs text-muted-foreground">
									{currentArtifact.title} · v{currentArtifact.version}
								</p>
							</div>
							{fullscreenPane === "code" ? (
								<Button
									type={BUTTON_TYPE}
									variant={OUTLINE_VARIANT}
									size="sm"
									disabled={!selectedPath || selectedFile?.binary || savingFile}
									onClick={() => void saveSelectedFile()}
								>
									<SaveIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
									Save
								</Button>
							) : null}
						</div>
						{fullscreenPane === "preview" ? (
							<div className="flex min-h-0 flex-1 bg-white">
								<CodeWorkspacePreviewFrame
									key={`fullscreen:${currentArtifact.projectId}:${currentArtifact.version}:${currentArtifact.rootFile ?? "no-root"}`}
									artifact={currentArtifact}
								/>
							</div>
						) : null}
						{fullscreenPane === "code" ? (
							<CodeWorkspaceEditor
								value={loadingFile ? "Loading file…" : content}
								filePath={selectedPath}
								disabled={!selectedPath || loadingFile || savingFile}
								onChange={setContent}
								className="min-h-0 flex-1"
							/>
						) : null}
					</DialogContent>
				</Dialog>
			</div>
		</>
	);
}

function SandboxOutputFileCard({ file }: { file: CodeSandboxFileOutput }) {
	const omittedLabel =
		file.contentOmitted === "too_large"
			? "File too large to attach"
			: file.contentOmitted === "total_limit"
				? "Sandbox attachment limit reached"
				: null;

	return (
		<div className="rounded-lg border border-border/50 bg-background p-2.5">
			<div className="flex items-center justify-between gap-2">
				<div className="min-w-0">
					<p className="truncate font-medium text-foreground">{file.path}</p>
					<p className="text-[10px] text-muted-foreground">
						{file.mimeType} · {formatBytes(file.size)}
					</p>
				</div>
				{file.downloadUrl ? (
					<Button
						asChild
						variant={OUTLINE_VARIANT}
						size="sm"
						className="h-7 shrink-0 gap-1.5 px-2 text-[11px]"
					>
						<a href={file.downloadUrl} target="_blank" rel="noreferrer">
							<DownloadIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
							Download
						</a>
					</Button>
				) : null}
			</div>
			{file.downloadError ? (
				<p className="mt-2 text-[11px] text-destructive">
					{file.downloadError}
				</p>
			) : null}
			{omittedLabel ? (
				<p className="mt-2 text-[11px] text-muted-foreground">{omittedLabel}</p>
			) : null}
			{file.textPreview ? (
				<pre className="mt-2 max-h-32 overflow-auto rounded-md bg-muted/30 p-2 whitespace-pre-wrap font-mono text-[10px] leading-4 text-muted-foreground">
					{file.textPreview}
					{file.truncated ? "\n…" : ""}
				</pre>
			) : null}
		</div>
	);
}

function CodeSandboxResultCard({
	result,
	input,
}: {
	result: CodeSandboxOutput;
	input?: CodeSandboxInputPreview | null;
}) {
	const [sourceOpen, setSourceOpen] = useState(false);
	const language = input?.language ?? result.language;
	return (
		<div className="overflow-hidden rounded-xl border border-border/50 bg-card text-xs shadow-sm">
			<div className="flex items-center justify-between gap-3 border-b border-border/50 bg-muted/25 px-3 py-2.5">
				<div>
					<p className="font-medium text-foreground">Code sandbox</p>
					<p className="text-[11px] text-muted-foreground">
						{language} · {result.durationMs}ms ·{" "}
						{result.timedOut
							? "timed out"
							: result.exitCode === null
								? "no exit code"
								: `exit ${result.exitCode}`}
					</p>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{input?.code ? (
						<Button
							type={BUTTON_TYPE}
							variant={GHOST_VARIANT}
							size="sm"
							className="h-7 px-2 text-[11px]"
							onClick={() => setSourceOpen((current) => !current)}
						>
							Source code
							<ChevronDownIcon
								className={cn(COMPACT_ICON_CLASS, sourceOpen && "rotate-180")}
								aria-hidden="true"
							/>
						</Button>
					) : null}
					<span
						className={cn(
							"rounded-full px-2 py-0.5 text-[10px] font-medium",
							result.ok
								? "bg-success/10 text-success"
								: "bg-destructive/10 text-destructive",
						)}
					>
						{result.ok ? "Done" : "Failed"}
					</span>
				</div>
			</div>
			<div className="space-y-3 p-3">
				{input?.code ? (
					<Collapsible open={sourceOpen} onOpenChange={setSourceOpen}>
						<CollapsibleContent>
							<div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-2.5">
								<div className="flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
									<span>Executed {language} code</span>
									{input.files.length > 0 ? (
										<span>· {input.files.length} input file(s)</span>
									) : null}
									{input.attachments.length > 0 ? (
										<span>· {input.attachments.length} attachment(s)</span>
									) : null}
								</div>
								<pre className="max-h-72 overflow-auto rounded-md bg-background/70 p-2 whitespace-pre-wrap font-mono text-[11px] leading-4 text-foreground">
									{input.code}
								</pre>
							</div>
						</CollapsibleContent>
					</Collapsible>
				) : null}
				{result.stdout ? (
					<div>
						<p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
							stdout
						</p>
						<pre className="max-h-40 overflow-auto rounded-md bg-muted/25 p-2 whitespace-pre-wrap font-mono text-[11px] leading-4 text-foreground">
							{result.stdout}
						</pre>
					</div>
				) : null}
				{result.stderr ? (
					<div>
						<p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
							stderr
						</p>
						<pre className="max-h-40 overflow-auto rounded-md bg-destructive/5 p-2 whitespace-pre-wrap font-mono text-[11px] leading-4 text-destructive">
							{result.stderr}
						</pre>
					</div>
				) : null}
				{result.files.length > 0 ? (
					<div className="space-y-2">
						<p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
							Sandbox files
						</p>
						{result.files.map((file) => (
							<SandboxOutputFileCard key={file.path} file={file} />
						))}
					</div>
				) : null}
			</div>
		</div>
	);
}

function LiveToolInputCard({
	toolName,
	inputText,
	sandboxInput,
}: {
	toolName: string;
	inputText: string;
	sandboxInput?: CodeSandboxInputPreview | null;
}) {
	const visibleInputText = useMemo(() => {
		if (inputText.length <= MAX_LIVE_TOOL_INPUT_CHARS) return inputText;
		return `…${inputText.length - MAX_LIVE_TOOL_INPUT_CHARS} earlier characters hidden while streaming\n${inputText.slice(-MAX_LIVE_TOOL_INPUT_CHARS)}`;
	}, [inputText]);
	const visibleCode = useMemo(() => {
		const code = sandboxInput?.code ?? "";
		if (!code) return "";
		if (code.length <= MAX_LIVE_TOOL_INPUT_CHARS) return code;
		return `…${code.length - MAX_LIVE_TOOL_INPUT_CHARS} earlier characters hidden while streaming\n${code.slice(-MAX_LIVE_TOOL_INPUT_CHARS)}`;
	}, [sandboxInput?.code]);
	const displayText = visibleCode || visibleInputText;

	return (
		<div className="overflow-hidden rounded-xl border border-primary/20 bg-background text-xs shadow-sm">
			<div className="flex items-center justify-between gap-2 border-b border-border/50 bg-muted/35 px-3 py-2.5">
				<div>
					<p className="font-medium text-foreground">{toolName}</p>
					<p className="text-[11px] text-muted-foreground">
						{sandboxInput
							? `Writing ${sandboxInput.language ?? "sandbox"} code…`
							: "Writing tool input…"}
					</p>
				</div>
				<span className="size-2 rounded-full bg-primary/70 animate-pulse" />
			</div>
			{sandboxInput ? (
				<div className="flex flex-wrap gap-2 border-b border-border/40 px-3 py-2 text-[10px] text-muted-foreground">
					{sandboxInput.files.length > 0 ? (
						<span>{sandboxInput.files.length} input file(s)</span>
					) : null}
					{sandboxInput.attachments.length > 0 ? (
						<span>{sandboxInput.attachments.length} attachment(s)</span>
					) : null}
				</div>
			) : null}
			<pre className="max-h-72 overflow-auto bg-muted/20 p-3 font-mono text-[11px] leading-4 text-muted-foreground whitespace-pre-wrap">
				{displayText || "Waiting for streamed tool input…"}
			</pre>
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

interface ChatMessageListProps {
	messages: ChatMessage[];
	sending: boolean;
	loading?: boolean;
	workspaceId?: string;
	workspaceArtifactDisplay?: WorkspaceArtifactDisplay;
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
	workspaceId,
	workspaceArtifactDisplay = "full",
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
						type={BUTTON_TYPE}
						variant={OUTLINE_VARIANT}
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
				const hasFilePart = message.parts.some((part) => part.type === "file");
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
								isUser && !hasFilePart
									? "max-w-[82%]"
									: "max-w-[min(100%,48rem)]",
								isLast && isAnimating && "animate-in-fade",
							)}
						>
							{/* Message bubble */}
							<div
								className={cn(
									"transition-[background-color,box-shadow,color] duration-150 ease-out",
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
									workspaceId={workspaceId}
									workspaceArtifactDisplay={workspaceArtifactDisplay}
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
				type={BUTTON_TYPE}
				size="icon-sm"
				variant={GHOST_VARIANT}
				aria-label={copied ? "Copied" : "Copy message"}
				className="size-6"
				disabled={sending}
				onClick={handleCopy}
			>
				{copied ? (
					<CheckIcon className="size-3 text-success" aria-hidden="true" />
				) : (
					<CopyIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
				)}
			</Button>
			{canEdit ? (
				<Button
					type={BUTTON_TYPE}
					size="icon-sm"
					variant={GHOST_VARIANT}
					aria-label="Edit message"
					className="size-6"
					disabled={sending}
					onClick={onEdit}
				>
					<PencilIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
				</Button>
			) : null}
			{canDelete ? (
				<Button
					type={BUTTON_TYPE}
					size="icon-sm"
					variant={GHOST_VARIANT}
					aria-label="Delete message"
					className="size-6 text-destructive/70 hover:text-destructive"
					disabled={sending}
					onClick={onDelete}
				>
					<Trash2Icon className={COMPACT_ICON_CLASS} aria-hidden="true" />
				</Button>
			) : null}
			{canRegenerate ? (
				<Button
					type={BUTTON_TYPE}
					size="sm"
					variant={GHOST_VARIANT}
					aria-label="Regenerate response"
					className="h-6 gap-1 px-2 text-[11px]"
					disabled={sending}
					onClick={onRegenerate}
				>
					<RefreshCcwIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
					Regenerate
				</Button>
			) : null}
		</div>
	);
}
