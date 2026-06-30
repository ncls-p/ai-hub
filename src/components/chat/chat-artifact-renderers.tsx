"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, DownloadIcon, Maximize2Icon } from "lucide-react";

import {
	artifactCombinedCode,
	artifactSourceDocument,
	type CodeSandboxFileOutput,
	type CodeSandboxInputPreview,
	type CodeSandboxOutput,
	type HtmlArtifactOutput,
} from "@/components/chat/chat-message-rendering-utils";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatBytes } from "@/components/chat/code-workspace-artifact-card";
import { cn } from "@/lib/utils";

const MAX_LIVE_TOOL_INPUT_CHARS = 8000;
const BUTTON_TYPE = "button";
const OUTLINE_VARIANT = "outline";
const GHOST_VARIANT = "ghost";
const COMPACT_ICON_CLASS = "size-3";

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

export function HtmlArtifactCard({
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

export function CodeSandboxResultCard({
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

export function LiveToolInputCard({
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
