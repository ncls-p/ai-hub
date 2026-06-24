import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import { storage } from "@/server/infrastructure/storage";

export type ChatImageAttachment = {
  kind: "chat_image";
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  hash: string;
  url: string;
};

type ChatImageAttachmentMetadata = ChatImageAttachment & {
  workspaceId: string;
  createdByUserId: string;
  objectKey: string;
  createdAt: string;
};

const chatAttachmentStoragePrefix =
  process.env.CHAT_ATTACHMENT_STORAGE_PREFIX ?? "chat-attachments";
export const maxChatImageBytes = 8 * 1024 * 1024;
export const maxChatImageAttachments = 4;

const imageTypes = {
  "image/jpeg": {
    extension: ".jpg",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff,
  },
  "image/png": {
    extension: ".png",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a,
  },
  "image/webp": {
    extension: ".webp",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP",
  },
} satisfies Record<
  string,
  { extension: string; matches: (bytes: Uint8Array) => boolean }
>;

function chatAttachmentObjectKey(attachmentId: string, segment: string) {
  assertSafeAttachmentId(attachmentId);
  return [chatAttachmentStoragePrefix, attachmentId, segment]
    .map((value) => value.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

function metadataObjectKey(attachmentId: string) {
  return chatAttachmentObjectKey(attachmentId, "metadata.json");
}

function assertSafeAttachmentId(attachmentId: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      attachmentId,
    )
  ) {
    throw new Error("Invalid attachment id.");
  }
}

function hashBytes(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sanitizeFileName(fileName: string, fallbackExtension: string) {
  const parsed = path.parse(fileName.trim());
  const base = (parsed.name || "image")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "image"}${fallbackExtension}`;
}

function detectImageMimeType(bytes: Uint8Array) {
  for (const [mimeType, type] of Object.entries(imageTypes)) {
    if (type.matches(bytes)) return mimeType as keyof typeof imageTypes;
  }
  return null;
}

export function isChatImageAttachment(
  value: unknown,
): value is ChatImageAttachment {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "chat_image" &&
    typeof record.id === "string" &&
    typeof record.fileName === "string" &&
    typeof record.mimeType === "string" &&
    typeof record.size === "number" &&
    typeof record.url === "string"
  );
}

function assertChatImageAccess(
  metadata: ChatImageAttachmentMetadata,
  workspaceId: string,
  userId: string,
) {
  if (
    metadata.workspaceId !== workspaceId ||
    metadata.createdByUserId !== userId
  ) {
    throw new Error("Attachment not found.");
  }
}

export async function createChatImageAttachment(input: {
  workspaceId: string;
  userId: string;
  fileName: string;
  bytes: Uint8Array;
}) {
  if (input.bytes.byteLength === 0) {
    throw new Error("Image file is empty.");
  }
  if (input.bytes.byteLength > maxChatImageBytes) {
    throw new Error("Image file is too large. Maximum size is 8 MB.");
  }

  const mimeType = detectImageMimeType(input.bytes);
  if (!mimeType) {
    throw new Error("Unsupported image type. Upload PNG, JPEG, or WebP.");
  }

  const attachmentId = randomUUID();
  const objectKey = chatAttachmentObjectKey(
    attachmentId,
    `image${imageTypes[mimeType].extension}`,
  );
  const now = new Date().toISOString();
  const metadata: ChatImageAttachmentMetadata = {
    kind: "chat_image",
    id: attachmentId,
    workspaceId: input.workspaceId,
    createdByUserId: input.userId,
    fileName: sanitizeFileName(input.fileName, imageTypes[mimeType].extension),
    mimeType,
    size: input.bytes.byteLength,
    hash: hashBytes(input.bytes),
    objectKey,
    url: `/api/workspace/chat-attachments/${attachmentId}`,
    createdAt: now,
  };

  try {
    await storage.upload(objectKey, input.bytes, mimeType);
    await storage.upload(
      metadataObjectKey(attachmentId),
      JSON.stringify(metadata, null, 2),
      "application/json; charset=utf-8",
    );
    return publicChatImageAttachment(metadata);
  } catch (error) {
    await storage.delete(objectKey).catch(() => undefined);
    await storage
      .delete(metadataObjectKey(attachmentId))
      .catch(() => undefined);
    throw error;
  }
}

export function publicChatImageAttachment(
  metadata: ChatImageAttachmentMetadata,
): ChatImageAttachment {
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

export async function getChatImageAttachment(attachmentId: string) {
  assertSafeAttachmentId(attachmentId);
  const bytes = await storage.download(metadataObjectKey(attachmentId));
  return JSON.parse(
    Buffer.from(bytes).toString("utf8"),
  ) as ChatImageAttachmentMetadata;
}

export async function getChatImageAttachmentBytes(input: {
  attachmentId: string;
  workspaceId?: string;
  userId: string;
}) {
  const metadata = await getChatImageAttachment(input.attachmentId);
  if (input.workspaceId) {
    assertChatImageAccess(metadata, input.workspaceId, input.userId);
  } else if (metadata.createdByUserId !== input.userId) {
    throw new Error("Attachment not found.");
  }
  const bytes = await storage.download(metadata.objectKey);
  return { metadata, bytes };
}
