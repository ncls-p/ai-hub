import { desc, eq, inArray } from "drizzle-orm";

import {
	getChatAttachmentExtractedText,
	getChatImageAttachmentBytes,
	isChatFileAttachment,
	isChatImageAttachment,
} from "@/modules/chat/attachments";
import { decryptValue } from "@/lib/crypto";
import { logHandledWarning } from "@/lib/logger";
import { db } from "@/server/infrastructure/db";
import { messageParts, messages } from "@/server/infrastructure/db/schema";
import type { ModelMessage } from "ai";

const previousToolTextContextChars = 4_000;

function htmlArtifactCodeFromValue(value: unknown) {
	if (typeof value !== "object" || value === null) return null;
	const record = value as Record<string, unknown>;
	if (record.kind !== "html_artifact" && record.kind !== undefined) return null;
	const html = record.html;
	if (typeof html !== "string") return null;
	const source = {
		title: record.title,
		html,
		css: record.css,
		js: record.js,
		deck: record.deck,
	};

	const sections = [
		`Title: ${typeof source.title === "string" ? source.title : "Interactive preview"}`,
	];
	if (source.deck && typeof source.deck === "object") {
		sections.push("Deck JSON:", JSON.stringify(source.deck, null, 2));
	}
	sections.push(
		"HTML:",
		source.html,
		"CSS:",
		typeof source.css === "string" ? source.css : "",
		"JavaScript:",
		typeof source.js === "string" ? source.js : "",
	);
	return sections.join("\n");
}

function htmlArtifactCodeFromToolMetadata(metadata: unknown) {
	if (typeof metadata !== "object" || metadata === null) return null;
	const record = metadata as Record<string, unknown>;
	return (
		htmlArtifactCodeFromValue(record.input) ??
		htmlArtifactCodeFromValue(record.output)
	);
}

function sandboxAttachmentPathHint(fileName: string) {
	const baseName =
		fileName
			.replace(/\\/g, "/")
			.split("/")
			.pop()
			?.replace(/[^a-zA-Z0-9._ -]/g, "_")
			.replace(/^\.+/, "")
			.trim()
			.slice(0, 120) || "attachment.bin";
	return `attachments/${baseName}`;
}

function truncatePreviousToolContext(value: string) {
	const normalized = value.trim();
	if (normalized.length <= previousToolTextContextChars) return normalized;
	return `${normalized.slice(0, previousToolTextContextChars)}\n… truncated`;
}

function sandboxAttachmentContext(attachment: unknown) {
	if (!isChatFileAttachment(attachment) && !isChatImageAttachment(attachment)) {
		return null;
	}
	return [
		`Attachment ID: ${attachment.id}`,
		`file name: ${attachment.fileName}`,
		`sandbox path hint: ${sandboxAttachmentPathHint(attachment.fileName)}`,
	].join("; ");
}

function sandboxTextContext(label: string, value: unknown) {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed ? `${label}:\n${truncatePreviousToolContext(trimmed)}` : null;
}

function codeSandboxFileContextLine(file: unknown) {
	if (typeof file !== "object" || file === null) return null;
	const fileRecord = file as Record<string, unknown>;
	if (typeof fileRecord.path !== "string") return null;
	const details = [
		typeof fileRecord.mimeType === "string" ? fileRecord.mimeType : null,
		typeof fileRecord.size === "number" ? `${fileRecord.size} bytes` : null,
	]
		.filter(Boolean)
		.join(", ");
	const attachmentContext = sandboxAttachmentContext(fileRecord.attachment);
	return `- ${fileRecord.path}${details ? ` (${details})` : ""}${attachmentContext ? ` — ${attachmentContext}` : ""}`;
}

function codeSandboxFilesContext(files: unknown) {
	if (!Array.isArray(files) || files.length === 0) return [];
	const lines = files.slice(0, 12).flatMap((file) => {
		const line = codeSandboxFileContextLine(file);
		return line ? [line] : [];
	});
	if (files.length > 12) lines.push(`- … ${files.length - 12} more file(s)`);
	return lines.length > 0 ? ["Generated files:", ...lines] : [];
}

function codeSandboxContextFromValue(value: unknown) {
	if (typeof value !== "object" || value === null) return null;
	const record = value as Record<string, unknown>;
	if (record.kind !== "code_sandbox_result") return null;

	const lines = [
		`Previous code sandbox result (${typeof record.language === "string" ? record.language : "unknown"}, ${record.ok === false ? "failed" : "ok"}).`,
		"If the user asks to inspect or modify one of these generated files, call run_code_sandbox with its Attachment ID in the attachments array; do not ask the user to re-upload it.",
		sandboxTextContext("stdout", record.stdout),
		sandboxTextContext("stderr", record.stderr),
		...codeSandboxFilesContext(record.files),
	].filter(Boolean);

	return lines.join("\n");
}

function codeSandboxContextFromToolMetadata(metadata: unknown) {
	if (typeof metadata !== "object" || metadata === null) return null;
	const record = metadata as Record<string, unknown>;
	return (
		codeSandboxContextFromValue(record.output) ??
		codeSandboxContextFromValue(record)
	);
}

function codeWorkspaceContextFromValue(value: unknown) {
	if (typeof value !== "object" || value === null) return null;
	const record = value as Record<string, unknown>;
	if (record.kind !== "code_workspace_artifact") return null;
	if (typeof record.projectId !== "string") return null;
	const files = Array.isArray(record.files)
		? record.files
				.map((file) => {
					if (typeof file !== "object" || file === null) return null;
					const fileRecord = file as Record<string, unknown>;
					return typeof fileRecord.path === "string"
						? `- ${fileRecord.path}${fileRecord.binary ? " (asset)" : ""}`
						: null;
				})
				.filter(Boolean)
				.join("\n")
		: "";
	return [
		`Code workspace ID: ${record.projectId}`,
		`Title: ${typeof record.title === "string" ? record.title : "Code workspace"}`,
		`Preview entry: ${typeof record.rootFile === "string" ? record.rootFile : "none"}`,
		files ? `Files:\n${files}` : null,
	]
		.filter(Boolean)
		.join("\n");
}

function codeWorkspaceContextFromToolMetadata(metadata: unknown) {
	if (typeof metadata !== "object" || metadata === null) return null;
	const record = metadata as Record<string, unknown>;
	return (
		codeWorkspaceContextFromValue(record) ??
		codeWorkspaceContextFromValue(record.input) ??
		codeWorkspaceContextFromValue(record.output)
	);
}

export async function loadConversationHistory(
	conversationId: string,
	context: { workspaceId: string; userId: string },
	maxMessages?: number,
): Promise<ModelMessage[]> {
	const historyLimit =
		typeof maxMessages === "number" && maxMessages > 0
			? Math.floor(maxMessages)
			: null;
	const messageRows = historyLimit
		? (
				await db
					.select({
						id: messages.id,
						role: messages.role,
						createdAt: messages.createdAt,
					})
					.from(messages)
					.where(eq(messages.conversationId, conversationId))
					.orderBy(desc(messages.createdAt))
					.limit(historyLimit)
			).reverse()
		: await db
				.select({
					id: messages.id,
					role: messages.role,
					createdAt: messages.createdAt,
				})
				.from(messages)
				.where(eq(messages.conversationId, conversationId))
				.orderBy(messages.createdAt);

	const modelMessages: ModelMessage[] = [];
	const modelMessageRows = messageRows.filter(
		(message) => message.role === "user" || message.role === "assistant",
	);
	if (modelMessageRows.length === 0) return modelMessages;

	const partsByMessageId = new Map<
		string,
		Array<{
			messageId: string;
			type: string;
			contentEncrypted: string | null;
			metadataJson: unknown;
			sortOrder: number;
		}>
	>();
	const partRows = await db
		.select({
			messageId: messageParts.messageId,
			type: messageParts.type,
			contentEncrypted: messageParts.contentEncrypted,
			metadataJson: messageParts.metadataJson,
			sortOrder: messageParts.sortOrder,
		})
		.from(messageParts)
		.where(
			inArray(
				messageParts.messageId,
				modelMessageRows.map((message) => message.id),
			),
		)
		.orderBy(messageParts.messageId, messageParts.sortOrder);

	for (const part of partRows) {
		const existing = partsByMessageId.get(part.messageId);
		if (existing) {
			existing.push(part);
		} else {
			partsByMessageId.set(part.messageId, [part]);
		}
	}

	for (const message of modelMessageRows) {
		const textParts: string[] = [];
		const imageParts: Array<{
			type: "file";
			data: Uint8Array;
			mediaType: string;
			filename: string;
		}> = [];
		const artifactCodeBlocks = new Set<string>();
		for (const part of partsByMessageId.get(message.id) ?? []) {
			if (part.type === "file") {
				const imageAttachment = isChatImageAttachment(part.metadataJson)
					? part.metadataJson
					: null;
				const fileAttachment = isChatFileAttachment(part.metadataJson)
					? part.metadataJson
					: null;
				if (message.role === "user" && imageAttachment) {
					try {
						const attachment = await getChatImageAttachmentBytes({
							attachmentId: imageAttachment.id,
							workspaceId: context.workspaceId,
							userId: context.userId,
						});
						textParts.push(
							[
								`Attached image for visual analysis: ${attachment.metadata.fileName}`,
								`Attachment ID: ${imageAttachment.id}`,
								`MIME type: ${attachment.metadata.mimeType}`,
								`Sandbox path hint: ${sandboxAttachmentPathHint(imageAttachment.fileName)}`,
							].join("\n"),
						);
						imageParts.push({
							type: "file",
							data: attachment.bytes,
							mediaType: attachment.metadata.mimeType,
							filename: attachment.metadata.fileName,
						});
					} catch (error) {
						logHandledWarning("Skipping unavailable chat image attachment", {
							messageId: message.id,
							attachmentId: imageAttachment.id,
							error: error instanceof Error ? error.message : String(error),
						});
					}
				} else if (message.role === "user" && fileAttachment) {
					try {
						const { text } = await getChatAttachmentExtractedText({
							attachmentId: fileAttachment.id,
							workspaceId: context.workspaceId,
							userId: context.userId,
						});
						if (text.trim()) {
							textParts.push(
								[
									`Attached file: ${fileAttachment.fileName} (${fileAttachment.mimeType}, ${fileAttachment.size} bytes).`,
									`Attachment ID: ${fileAttachment.id}`,
									`Sandbox path hint: ${sandboxAttachmentPathHint(fileAttachment.fileName)}`,
									fileAttachment.extractionStatus === "truncated"
										? "The extracted text was truncated for safety."
										: null,
									"Extracted file text:",
									text,
								]
									.filter(Boolean)
									.join("\n"),
							);
						} else {
							textParts.push(
								[
									`Attached file: ${fileAttachment.fileName} (${fileAttachment.mimeType}, ${fileAttachment.size} bytes).`,
									`Attachment ID: ${fileAttachment.id}`,
									`Sandbox path hint: ${sandboxAttachmentPathHint(fileAttachment.fileName)}`,
									fileAttachment.extractionMessage ??
										"No readable text was extracted.",
								].join("\n"),
							);
						}
					} catch (error) {
						logHandledWarning("Skipping unavailable chat file attachment", {
							messageId: message.id,
							attachmentId: fileAttachment.id,
							error: error instanceof Error ? error.message : String(error),
						});
					}
				}

				const codeWorkspaceContext = codeWorkspaceContextFromToolMetadata(
					part.metadataJson,
				);
				if (codeWorkspaceContext) {
					textParts.push(
						`Uploaded code workspace available in chat:\n${codeWorkspaceContext}`,
					);
				}
			}

			if (part.type === "text" && part.contentEncrypted) {
				try {
					textParts.push(await decryptValue(part.contentEncrypted));
				} catch (error) {
					logHandledWarning("Skipping undecryptable message part", {
						messageId: message.id,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}

			if (message.role === "assistant") {
				const artifactCode = htmlArtifactCodeFromToolMetadata(
					part.metadataJson,
				);
				if (artifactCode) artifactCodeBlocks.add(artifactCode);
				const codeWorkspaceContext = codeWorkspaceContextFromToolMetadata(
					part.metadataJson,
				);
				if (codeWorkspaceContext) {
					artifactCodeBlocks.add(
						`Previously updated code workspace:\n${codeWorkspaceContext}`,
					);
				}
				const codeSandboxContext = codeSandboxContextFromToolMetadata(
					part.metadataJson,
				);
				if (codeSandboxContext) {
					textParts.push(
						`Previously generated code sandbox output available for follow-up:\n${codeSandboxContext}`,
					);
				}
			}
		}

		for (const artifactCode of artifactCodeBlocks) {
			textParts.push(
				`Previously rendered HTML artifact code (available for follow-up edits or when the user asks for the code):\n${artifactCode}`,
			);
		}

		const content = textParts.join("\n").trim();
		if (message.role === "user" && imageParts.length > 0) {
			modelMessages.push({
				role: "user",
				content: [
					...(content ? [{ type: "text" as const, text: content }] : []),
					...imageParts,
				],
			});
			continue;
		}
		if (content) {
			const role = message.role === "assistant" ? "assistant" : "user";
			modelMessages.push({ role, content });
		}
	}

	return modelMessages;
}
