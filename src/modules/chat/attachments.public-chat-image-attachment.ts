import "pdf-parse/worker";

import { canReadSharedConversationAsset } from "./conversation-asset-access";

import { storage } from "@/server/infrastructure/storage";
import {
  ChatAttachmentMetadata,
  ChatFileAttachmentMetadata,
  ChatImageAttachment,
  ChatImageAttachmentMetadata,
} from "./attachments.chat-image-attachment";
import {
  assertSafeAttachmentId,
  metadataObjectKey,
} from "./attachments.code-text-extensions";
async function assertReadableAttachment(
  metadata: ChatAttachmentMetadata,
  input: { workspaceId?: string; userId: string },
) {
  if (input.workspaceId && metadata.workspaceId !== input.workspaceId) {
    throw new Error("Attachment not found.");
  }
  if (metadata.createdByUserId === input.userId) return;
  if (
    !(await canReadSharedConversationAsset(
      metadata,
      input.userId,
      "attachment",
    ))
  ) {
    throw new Error("Attachment not found.");
  }
}

export function publicChatImageAttachment(
  metadata: ChatAttachmentMetadata,
): ChatImageAttachment {
  if (metadata.kind !== "chat_image") {
    throw new Error("Attachment is not an image.");
  }
  return {
    kind: "chat_image",
    id: metadata.id,
    fileName: metadata.fileName,
    mimeType: metadata.mimeType,
    size: metadata.size,
    hash: metadata.hash,
    url: metadata.url,
  };
}

export async function getChatAttachment(
  attachmentId: string,
): Promise<ChatAttachmentMetadata> {
  assertSafeAttachmentId(attachmentId);
  const bytes = await storage.download(metadataObjectKey(attachmentId));
  try {
    return JSON.parse(
      Buffer.from(bytes).toString("utf8"),
    ) as ChatAttachmentMetadata;
  } catch {
    throw new Error(`Failed to parse attachment metadata for ${attachmentId}`);
  }
}

export async function deleteChatAttachment(
  attachmentId: string,
): Promise<void> {
  const metadata = await getChatAttachment(attachmentId);
  const objectKeys = new Set(
    [
      metadata.objectKey,
      metadata.extractedTextObjectKey,
      metadataObjectKey(attachmentId),
    ].filter((key): key is string => Boolean(key)),
  );
  await Promise.all(
    [...objectKeys].map((objectKey) => storage.delete(objectKey)),
  );
}

export async function getChatAttachmentBytes(input: {
  attachmentId: string;
  workspaceId?: string;
  userId: string;
}) {
  const metadata = await getChatAttachment(input.attachmentId);
  await assertReadableAttachment(metadata, input);
  const bytes = await storage.download(metadata.objectKey);
  return { metadata, bytes };
}

export async function getChatImageAttachmentBytes(input: {
  attachmentId: string;
  workspaceId?: string;
  userId: string;
}) {
  const attachment = await getChatAttachmentBytes(input);
  if (attachment.metadata.kind !== "chat_image") {
    throw new Error("Attachment is not an image.");
  }
  return attachment as {
    metadata: ChatImageAttachmentMetadata;
    bytes: Uint8Array;
  };
}

export async function getChatAttachmentExtractedText(input: {
  attachmentId: string;
  workspaceId: string;
  userId: string;
}): Promise<{ metadata: ChatFileAttachmentMetadata; text: string }> {
  const metadata = await getChatAttachment(input.attachmentId);
  await assertReadableAttachment(metadata, input);
  if (metadata.kind !== "chat_file") {
    throw new Error("Attachment is not a file.");
  }
  if (!metadata.extractedTextObjectKey) {
    return { metadata, text: "" };
  }
  const bytes = await storage.download(metadata.extractedTextObjectKey);
  return { metadata, text: Buffer.from(bytes).toString("utf8") };
}
