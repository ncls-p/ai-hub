import {
	parseToolPart,
	toolNameMatches,
	type ChatFileAttachment,
	type ChatImageAttachment,
	type ChatMessagePart,
	type PendingToolApproval,
} from "@/components/chat/chat-types";
import { isCodeWorkspaceArtifactOutput } from "@/components/chat/code-workspace-artifact-card";
import { summarizeToolInput } from "@/components/chat/tool-approval-banner";

function stringifyForMatch(value: unknown) {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

export function formatToolName(toolName: string | undefined) {
	if (!toolName) return "Tool";
	const withoutPrefix = toolName.replace(/^mcp_[0-9a-f_]{36,}_(.+)$/i, "$1");
	return withoutPrefix
		.replace(/__+/g, " ")
		.replace(/_/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function summarizeToolBody(
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

export type HtmlArtifactOutput = {
	kind: "html_artifact";
	title: string;
	html: string;
	css: string;
	js: string;
	height: number;
};

export function isHtmlArtifactOutput(
	value: unknown,
): value is HtmlArtifactOutput {
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

export type GitHubPublishOutput = {
	kind: "github_publish_result";
	mode: "pull_request" | "direct_push";
	repository: string;
	targetBranch: string;
	sourceBranch: string | null;
	commitSha: string;
	pullRequestUrl: string | null;
	message: string;
};

export function isGitHubPublishOutput(
	value: unknown,
): value is GitHubPublishOutput {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		record.kind === "github_publish_result" &&
		typeof record.repository === "string" &&
		typeof record.targetBranch === "string" &&
		typeof record.commitSha === "string"
	);
}

export function codeWorkspaceArtifactFromPartContent(content: string) {
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

export function chatImageAttachmentFromPartContent(content: string) {
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

export function chatFileAttachmentFromPartContent(content: string) {
	try {
		const parsed = JSON.parse(content) as unknown;
		return isChatFileAttachmentOutput(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

export type CodeSandboxFileOutput = {
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

export type CodeSandboxLanguage = "python" | "node" | "bash";

export type CodeSandboxOutput = {
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

export type CodeSandboxInputPreview = {
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

export function codeSandboxOutputFromUnknown(
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

export function codeSandboxInputFromUnknown(
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

export function isCodeSandboxToolName(toolName: string | undefined) {
	return (
		toolName === "run_code_sandbox" ||
		Boolean(toolName?.endsWith("_run_code_sandbox"))
	);
}

export function htmlArtifactFromToolInput(
	value: unknown,
): HtmlArtifactOutput | null {
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

export function codeSandboxInputFromInputText(inputText: string | undefined) {
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

export function htmlArtifactFromInputText(inputText: string | undefined) {
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

export function artifactSourceDocument(
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

export function artifactCombinedCode(artifact: HtmlArtifactOutput) {
	return `<style>\n${artifact.css}\n</style>\n\n${artifact.html}\n\n<script>\n${artifact.js}\n</script>`;
}

export function toolPartMatchesApproval(
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
