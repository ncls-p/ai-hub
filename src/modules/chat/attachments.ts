import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { inflateSync } from "node:zlib";
import JSZip from "jszip";

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

export type ChatFileAttachment = {
  kind: "chat_file";
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  hash: string;
  url: string;
  category: "document" | "presentation" | "spreadsheet" | "text" | "file";
  extractionStatus: "readable" | "truncated" | "unreadable";
  extractedTextChars: number;
  extractionMessage?: string;
};

export type ChatAttachment = ChatImageAttachment | ChatFileAttachment;

type ChatAttachmentMetadataFields = {
  workspaceId: string;
  createdByUserId: string;
  objectKey: string;
  extractedTextObjectKey?: string;
  createdAt: string;
};

type ChatImageAttachmentMetadata = ChatImageAttachment &
  ChatAttachmentMetadataFields;
export type ChatFileAttachmentMetadata = ChatFileAttachment &
  ChatAttachmentMetadataFields;
export type ChatAttachmentMetadata =
  | ChatImageAttachmentMetadata
  | ChatFileAttachmentMetadata;

type AttachmentDetection = {
  mimeType: string;
  extension: string;
  category: ChatFileAttachment["category"];
  textKind:
    | "text"
    | "markdown"
    | "pdf"
    | "docx"
    | "pptx"
    | "xlsx"
    | "rtf"
    | "none";
};

type ExtractedText = {
  text: string;
  status: ChatFileAttachment["extractionStatus"];
  message?: string;
};

const chatAttachmentStoragePrefix =
  process.env.CHAT_ATTACHMENT_STORAGE_PREFIX ?? "chat-attachments";
const maxChatImageBytes = 8 * 1024 * 1024;
export const maxChatAttachmentBytes = 25 * 1024 * 1024;
export const maxChatAttachments = 8;
const maxExtractedChatAttachmentTextChars = 120_000;

const maxOfficeXmlBytes = 8 * 1024 * 1024;
const maxPdfInflatedBytes = 12 * 1024 * 1024;

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
  "image/gif": {
    extension: ".gif",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 6 &&
      (String.fromCharCode(...bytes.slice(0, 6)) === "GIF87a" ||
        String.fromCharCode(...bytes.slice(0, 6)) === "GIF89a"),
  },
} satisfies Record<
  string,
  { extension: string; matches: (bytes: Uint8Array) => boolean }
>;

const textMimeTypes = new Set([
  "application/json",
  "application/ld+json",
  "application/xml",
  "application/yaml",
  "application/x-yaml",
  "text/css",
  "text/csv",
  "text/html",
  "text/javascript",
  "text/markdown",
  "text/plain",
  "text/rtf",
  "text/xml",
]);

const mimeTypesByExtension = new Map<string, AttachmentDetection>([
  [
    ".csv",
    {
      mimeType: "text/csv; charset=utf-8",
      extension: ".csv",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".docx",
    {
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      extension: ".docx",
      category: "document",
      textKind: "docx",
    },
  ],
  [
    ".htm",
    {
      mimeType: "text/html; charset=utf-8",
      extension: ".html",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".html",
    {
      mimeType: "text/html; charset=utf-8",
      extension: ".html",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".json",
    {
      mimeType: "application/json; charset=utf-8",
      extension: ".json",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".jsonl",
    {
      mimeType: "application/x-ndjson; charset=utf-8",
      extension: ".jsonl",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".md",
    {
      mimeType: "text/markdown; charset=utf-8",
      extension: ".md",
      category: "text",
      textKind: "markdown",
    },
  ],
  [
    ".markdown",
    {
      mimeType: "text/markdown; charset=utf-8",
      extension: ".md",
      category: "text",
      textKind: "markdown",
    },
  ],
  [
    ".pdf",
    {
      mimeType: "application/pdf",
      extension: ".pdf",
      category: "document",
      textKind: "pdf",
    },
  ],
  [
    ".pptx",
    {
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      extension: ".pptx",
      category: "presentation",
      textKind: "pptx",
    },
  ],
  [
    ".log",
    {
      mimeType: "text/plain; charset=utf-8",
      extension: ".log",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".rtf",
    {
      mimeType: "application/rtf",
      extension: ".rtf",
      category: "document",
      textKind: "rtf",
    },
  ],
  [
    ".svg",
    {
      mimeType: "image/svg+xml; charset=utf-8",
      extension: ".svg",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".text",
    {
      mimeType: "text/plain; charset=utf-8",
      extension: ".txt",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".tsv",
    {
      mimeType: "text/tab-separated-values; charset=utf-8",
      extension: ".tsv",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".txt",
    {
      mimeType: "text/plain; charset=utf-8",
      extension: ".txt",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".xlsm",
    {
      mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12",
      extension: ".xlsm",
      category: "spreadsheet",
      textKind: "xlsx",
    },
  ],
  [
    ".xlsx",
    {
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: ".xlsx",
      category: "spreadsheet",
      textKind: "xlsx",
    },
  ],
  [
    ".toml",
    {
      mimeType: "application/toml; charset=utf-8",
      extension: ".toml",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".xml",
    {
      mimeType: "text/xml; charset=utf-8",
      extension: ".xml",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".yaml",
    {
      mimeType: "application/yaml; charset=utf-8",
      extension: ".yaml",
      category: "text",
      textKind: "text",
    },
  ],
  [
    ".yml",
    {
      mimeType: "application/yaml; charset=utf-8",
      extension: ".yaml",
      category: "text",
      textKind: "text",
    },
  ],
]);

const codeTextExtensions = new Set([
  ".c",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".svelte",
  ".swift",
  ".tsx",
  ".ts",
  ".vue",
]);

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

function extractedTextObjectKey(attachmentId: string) {
  return chatAttachmentObjectKey(attachmentId, "extracted.txt");
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

function safeExtension(extension: string, fallbackExtension: string) {
  const normalized = extension.toLowerCase();
  if (/^\.[a-z0-9][a-z0-9._-]{0,15}$/.test(normalized)) return normalized;
  return fallbackExtension;
}

function sanitizeFileName(
  fileName: string,
  fallbackBase: string,
  fallbackExtension: string,
) {
  const parsed = path.parse(fileName.trim());
  const extension = safeExtension(parsed.ext, fallbackExtension);
  const base = (parsed.name || fallbackBase)
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return `${base || fallbackBase}${extension}`;
}

function detectImageMimeType(bytes: Uint8Array) {
  for (const [mimeType, type] of Object.entries(imageTypes)) {
    if (type.matches(bytes)) return mimeType as keyof typeof imageTypes;
  }
  return null;
}

function hasPdfSignature(bytes: Uint8Array) {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

function hasZipSignature(bytes: Uint8Array) {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
  );
}

function normalizedDeclaredMimeType(mimeType?: string) {
  const normalized = mimeType?.split(";")[0]?.trim().toLowerCase();
  return normalized || null;
}

function isUtf8Text(bytes: Uint8Array) {
  if (bytes.length === 0) return true;
  const sample = bytes.slice(0, Math.min(bytes.length, 8192));
  let controlCount = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 0x08 || (byte > 0x0d && byte < 0x20)) controlCount += 1;
  }
  if (controlCount / sample.length > 0.03) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return true;
  } catch {
    return false;
  }
}

function detectAttachment(input: {
  fileName: string;
  declaredMimeType?: string;
  bytes: Uint8Array;
}): AttachmentDetection {
  const extension = path.extname(input.fileName).toLowerCase();
  const declaredMimeType = normalizedDeclaredMimeType(input.declaredMimeType);
  if (hasPdfSignature(input.bytes) || declaredMimeType === "application/pdf") {
    return {
      mimeType: "application/pdf",
      extension: ".pdf",
      category: "document",
      textKind: "pdf",
    };
  }
  if (
    hasZipSignature(input.bytes) &&
    declaredMimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return {
      mimeType: declaredMimeType,
      extension: ".docx",
      category: "document",
      textKind: "docx",
    };
  }
  if (
    hasZipSignature(input.bytes) &&
    declaredMimeType ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return {
      mimeType: declaredMimeType,
      extension: ".pptx",
      category: "presentation",
      textKind: "pptx",
    };
  }
  if (
    hasZipSignature(input.bytes) &&
    declaredMimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return {
      mimeType: declaredMimeType,
      extension: ".xlsx",
      category: "spreadsheet",
      textKind: "xlsx",
    };
  }

  const extensionDetection = mimeTypesByExtension.get(extension);
  if (
    extensionDetection &&
    (extensionDetection.textKind !== "docx" || hasZipSignature(input.bytes)) &&
    (extensionDetection.textKind !== "pptx" || hasZipSignature(input.bytes)) &&
    (extensionDetection.textKind !== "xlsx" || hasZipSignature(input.bytes))
  ) {
    return extensionDetection;
  }

  if (codeTextExtensions.has(extension)) {
    return {
      mimeType: "text/plain; charset=utf-8",
      extension: extension || ".txt",
      category: "text",
      textKind: "text",
    };
  }

  if (declaredMimeType && textMimeTypes.has(declaredMimeType)) {
    return {
      mimeType: `${declaredMimeType}; charset=utf-8`,
      extension: extension || ".txt",
      category: "text",
      textKind: declaredMimeType === "text/rtf" ? "rtf" : "text",
    };
  }

  if (isUtf8Text(input.bytes)) {
    return {
      mimeType: declaredMimeType?.startsWith("text/")
        ? `${declaredMimeType}; charset=utf-8`
        : "text/plain; charset=utf-8",
      extension: extension || ".txt",
      category: "text",
      textKind: "text",
    };
  }

  return {
    mimeType: declaredMimeType || "application/octet-stream",
    extension: extension || ".bin",
    category: "file",
    textKind: "none",
  };
}

function normalizeExtractedText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function limitExtractedText(text: string, message?: string): ExtractedText {
  const normalized = normalizeExtractedText(text);
  if (!normalized) {
    return {
      text: "",
      status: "unreadable",
      message: message ?? "No readable text could be extracted from this file.",
    };
  }
  if (normalized.length <= maxExtractedChatAttachmentTextChars) {
    return { text: normalized, status: "readable", message };
  }
  return {
    text: `${normalized.slice(0, maxExtractedChatAttachmentTextChars)}\n\n[Attachment text truncated for safety.]`,
    status: "truncated",
    message:
      message ??
      `Only the first ${maxExtractedChatAttachmentTextChars.toLocaleString()} characters were extracted.`,
  };
}

function decodeUtf8(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function extractXmlText(xml: string) {
  const textNodes = Array.from(
    xml.matchAll(
      /<(?:[a-z0-9_-]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?t>/gi,
    ),
    (match) => decodeXmlEntities(match[1].replace(/<[^>]*>/g, "")),
  );
  if (textNodes.length > 0) return textNodes.join(" ");
  return decodeXmlEntities(xml.replace(/<[^>]+>/g, " "));
}

function zipEntryNumber(fileName: string) {
  const match = fileName.match(/(\d+)\.xml$/i);
  return match ? Number.parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

function declaredZipUncompressedSize(entry: JSZip.JSZipObject) {
  const compressedEntry = entry as unknown as {
    _data?: { uncompressedSize?: unknown };
  };
  const size = compressedEntry._data?.uncompressedSize;
  return typeof size === "number" && Number.isFinite(size) ? size : null;
}

async function extractOfficeText(
  bytes: Uint8Array,
  textKind: Extract<AttachmentDetection["textKind"], "docx" | "pptx" | "xlsx">,
) {
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .filter((entry) => {
      if (textKind === "docx") {
        return (
          /^word\/(?:document|footnotes|endnotes|comments)\.xml$/i.test(
            entry.name,
          ) || /^word\/(?:header|footer)\d+\.xml$/i.test(entry.name)
        );
      }
      if (textKind === "pptx")
        return /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name);
      return /^xl\/(?:sharedStrings|worksheets\/sheet\d+)\.xml$/i.test(
        entry.name,
      );
    })
    .sort((a, b) => zipEntryNumber(a.name) - zipEntryNumber(b.name));

  let totalXmlBytes = 0;
  let truncated = false;
  const sections: string[] = [];

  for (const entry of entries) {
    const declaredSize = declaredZipUncompressedSize(entry);
    if (declaredSize && totalXmlBytes + declaredSize > maxOfficeXmlBytes) {
      truncated = true;
      break;
    }
    const xmlBytes = await entry.async("uint8array");
    totalXmlBytes += xmlBytes.byteLength;
    if (totalXmlBytes > maxOfficeXmlBytes) {
      truncated = true;
      break;
    }
    const extracted = normalizeExtractedText(
      extractXmlText(decodeUtf8(xmlBytes)),
    );
    if (!extracted) continue;
    const label =
      textKind === "pptx"
        ? `Slide ${zipEntryNumber(entry.name)}`
        : textKind === "xlsx"
          ? entry.name.replace(/^xl\//i, "")
          : null;
    sections.push(label ? `${label}:\n${extracted}` : extracted);
  }

  return limitExtractedText(
    sections.join("\n\n"),
    truncated
      ? "The document was partially read because it is large."
      : undefined,
  );
}

function decodePdfLiteralString(value: string) {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== "\\") {
      output += char;
      continue;
    }
    const next = value[index + 1];
    if (!next) continue;
    if (next === "n") output += "\n";
    else if (next === "r") output += "\r";
    else if (next === "t") output += "\t";
    else if (next === "b") output += "\b";
    else if (next === "f") output += "\f";
    else if (next === "(" || next === ")" || next === "\\") output += next;
    else if (/[0-7]/.test(next)) {
      const octal = value.slice(index + 1, index + 4).match(/^[0-7]{1,3}/)?.[0];
      if (octal) {
        output += String.fromCharCode(Number.parseInt(octal, 8));
        index += octal.length;
        continue;
      }
    } else if (next === "\r" || next === "\n") {
      while (value[index + 1] === "\r" || value[index + 1] === "\n") index += 1;
      continue;
    } else {
      output += next;
    }
    index += 1;
  }
  return output;
}

function decodePdfHexString(value: string) {
  const hex = value.replace(/\s+/g, "");
  if (!hex) return "";
  const evenHex = hex.length % 2 === 0 ? hex : `${hex}0`;
  const bytes = new Uint8Array(evenHex.length / 2);
  for (let index = 0; index < evenHex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(evenHex.slice(index, index + 2), 16);
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let output = "";
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      output += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
    }
    return output;
  }
  return Buffer.from(bytes).toString("latin1");
}

function extractPdfTextOperators(content: string) {
  const blocks = content.match(/BT[\s\S]*?ET/g) ?? [content];
  const tokens: string[] = [];

  for (const block of blocks) {
    const literalPattern = /\((?:\\.|[^\\()])*\)/g;
    for (const match of block.matchAll(literalPattern)) {
      const decoded = decodePdfLiteralString(match[0].slice(1, -1));
      if (decoded.trim()) tokens.push(decoded);
    }

    const hexPattern = /(?<!<)<([0-9a-fA-F\s]{4,})>(?!>)/g;
    for (const match of block.matchAll(hexPattern)) {
      const decoded = decodePdfHexString(match[1]);
      if (decoded.trim()) tokens.push(decoded);
    }
  }

  return tokens.join(" ");
}

function extractFlatePdfStreams(raw: string) {
  const chunks: string[] = [];
  const streamPattern =
    /<<(?:.|\n|\r){0,4000}?\/Filter\s*(?:\[[^\]]*)?\/FlateDecode(?:[^\]]*\])?(?:.|\n|\r){0,4000}?>>\s*stream\r?\n/g;
  let inflatedBytes = 0;
  for (const match of raw.matchAll(streamPattern)) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end === -1) continue;
    const streamRaw = raw.slice(start, end).replace(/\r?\n$/, "");
    try {
      const inflated = inflateSync(Buffer.from(streamRaw, "latin1"), {
        maxOutputLength: Math.max(1024, maxPdfInflatedBytes - inflatedBytes),
      });
      inflatedBytes += inflated.byteLength;
      chunks.push(inflated.toString("latin1"));
      if (inflatedBytes >= maxPdfInflatedBytes) break;
    } catch {
      // Ignore individual streams that fail to inflate. PDF extraction is best-effort.
    }
  }
  return chunks;
}

function extractPdfText(bytes: Uint8Array) {
  const raw = Buffer.from(bytes).toString("latin1");
  const chunks = [raw, ...extractFlatePdfStreams(raw)];
  const text = chunks.map(extractPdfTextOperators).join("\n");
  return limitExtractedText(
    text,
    "PDF text extraction is best-effort; scanned pages may require OCR.",
  );
}

function stripRtf(value: string) {
  return value
    .replace(/\\'[0-9a-fA-F]{2}/g, " ")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, " ")
    .replace(/[{}]/g, " ");
}

async function extractAttachmentText(input: {
  bytes: Uint8Array;
  detection: AttachmentDetection;
}): Promise<ExtractedText> {
  try {
    if (
      input.detection.textKind === "text" ||
      input.detection.textKind === "markdown"
    ) {
      return limitExtractedText(decodeUtf8(input.bytes));
    }
    if (input.detection.textKind === "rtf") {
      return limitExtractedText(stripRtf(decodeUtf8(input.bytes)));
    }
    if (input.detection.textKind === "pdf") {
      return extractPdfText(input.bytes);
    }
    if (
      input.detection.textKind === "docx" ||
      input.detection.textKind === "pptx" ||
      input.detection.textKind === "xlsx"
    ) {
      return await extractOfficeText(input.bytes, input.detection.textKind);
    }
  } catch (error) {
    return {
      text: "",
      status: "unreadable",
      message:
        error instanceof Error
          ? `Could not read this file: ${error.message}`
          : "Could not read this file.",
    };
  }

  return {
    text: "",
    status: "unreadable",
    message:
      "This file type was uploaded safely, but no text reader is available for it yet.",
  };
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

export function isChatFileAttachment(
  value: unknown,
): value is ChatFileAttachment {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "chat_file" &&
    typeof record.id === "string" &&
    typeof record.fileName === "string" &&
    typeof record.mimeType === "string" &&
    typeof record.size === "number" &&
    typeof record.url === "string" &&
    typeof record.extractionStatus === "string" &&
    typeof record.extractedTextChars === "number"
  );
}

function assertChatAttachmentAccess(
  metadata: ChatAttachmentMetadata,
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

async function createChatAttachmentInternal(
  input: {
    workspaceId: string;
    userId: string;
    fileName: string;
    mimeType?: string;
    bytes: Uint8Array;
  },
  options: { imageOnly?: boolean } = {},
): Promise<ChatAttachment> {
  if (input.bytes.byteLength === 0) {
    throw new Error("Attachment file is empty.");
  }

  const imageMimeType = detectImageMimeType(input.bytes);
  if (options.imageOnly && !imageMimeType) {
    throw new Error("Unsupported image type. Upload PNG, JPEG, GIF, or WebP.");
  }

  if (imageMimeType) {
    if (input.bytes.byteLength > maxChatImageBytes) {
      throw new Error("Image file is too large. Maximum size is 8 MB.");
    }
    const attachmentId = randomUUID();
    const objectKey = chatAttachmentObjectKey(
      attachmentId,
      `image${imageTypes[imageMimeType].extension}`,
    );
    const now = new Date().toISOString();
    const metadata: ChatImageAttachmentMetadata = {
      kind: "chat_image",
      id: attachmentId,
      workspaceId: input.workspaceId,
      createdByUserId: input.userId,
      fileName: sanitizeFileName(
        input.fileName,
        "image",
        imageTypes[imageMimeType].extension,
      ),
      mimeType: imageMimeType,
      size: input.bytes.byteLength,
      hash: hashBytes(input.bytes),
      objectKey,
      url: `/api/workspace/chat-attachments/${attachmentId}`,
      createdAt: now,
    };

    try {
      await storage.upload(objectKey, input.bytes, imageMimeType);
      await storage.upload(
        metadataObjectKey(attachmentId),
        JSON.stringify(metadata, null, 2),
        "application/json; charset=utf-8",
      );
      return publicChatAttachment(metadata);
    } catch (error) {
      await storage.delete(objectKey).catch(() => undefined);
      await storage
        .delete(metadataObjectKey(attachmentId))
        .catch(() => undefined);
      throw error;
    }
  }

  if (options.imageOnly) {
    throw new Error("Unsupported image type. Upload PNG, JPEG, GIF, or WebP.");
  }
  if (input.bytes.byteLength > maxChatAttachmentBytes) {
    throw new Error("Attachment file is too large. Maximum size is 25 MB.");
  }

  const detection = detectAttachment({
    fileName: input.fileName,
    declaredMimeType: input.mimeType,
    bytes: input.bytes,
  });
  const extracted = await extractAttachmentText({
    bytes: input.bytes,
    detection,
  });
  const attachmentId = randomUUID();
  const objectKey = chatAttachmentObjectKey(
    attachmentId,
    `file${safeExtension(detection.extension, ".bin")}`,
  );
  const textObjectKey = extracted.text
    ? extractedTextObjectKey(attachmentId)
    : undefined;
  const now = new Date().toISOString();
  const metadata: ChatFileAttachmentMetadata = {
    kind: "chat_file",
    id: attachmentId,
    workspaceId: input.workspaceId,
    createdByUserId: input.userId,
    fileName: sanitizeFileName(
      input.fileName,
      "attachment",
      detection.extension,
    ),
    mimeType: detection.mimeType,
    size: input.bytes.byteLength,
    hash: hashBytes(input.bytes),
    objectKey,
    ...(textObjectKey ? { extractedTextObjectKey: textObjectKey } : {}),
    url: `/api/workspace/chat-attachments/${attachmentId}`,
    createdAt: now,
    category: detection.category,
    extractionStatus: extracted.status,
    extractedTextChars: extracted.text.length,
    ...(extracted.message ? { extractionMessage: extracted.message } : {}),
  };

  try {
    await storage.upload(objectKey, input.bytes, detection.mimeType);
    if (textObjectKey) {
      await storage.upload(
        textObjectKey,
        extracted.text,
        "text/plain; charset=utf-8",
      );
    }
    await storage.upload(
      metadataObjectKey(attachmentId),
      JSON.stringify(metadata, null, 2),
      "application/json; charset=utf-8",
    );
    return publicChatAttachment(metadata);
  } catch (error) {
    await storage.delete(objectKey).catch(() => undefined);
    if (textObjectKey)
      await storage.delete(textObjectKey).catch(() => undefined);
    await storage
      .delete(metadataObjectKey(attachmentId))
      .catch(() => undefined);
    throw error;
  }
}

export function createChatAttachment(input: {
  workspaceId: string;
  userId: string;
  fileName: string;
  mimeType?: string;
  bytes: Uint8Array;
}) {
  return createChatAttachmentInternal(input);
}

export async function createChatImageAttachment(input: {
  workspaceId: string;
  userId: string;
  fileName: string;
  bytes: Uint8Array;
}) {
  const attachment = await createChatAttachmentInternal(input, {
    imageOnly: true,
  });
  if (!isChatImageAttachment(attachment)) {
    throw new Error("Unsupported image type. Upload PNG, JPEG, GIF, or WebP.");
  }
  return attachment;
}

export function publicChatAttachment(
  metadata: ChatAttachmentMetadata,
): ChatAttachment {
  if (metadata.kind === "chat_image") {
    return publicChatImageAttachment(metadata);
  }
  return {
    kind: "chat_file",
    id: metadata.id,
    fileName: metadata.fileName,
    mimeType: metadata.mimeType,
    size: metadata.size,
    hash: metadata.hash,
    url: metadata.url,
    category: metadata.category,
    extractionStatus: metadata.extractionStatus,
    extractedTextChars: metadata.extractedTextChars,
    ...(metadata.extractionMessage
      ? { extractionMessage: metadata.extractionMessage }
      : {}),
  };
}

function publicChatImageAttachment(
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
  return JSON.parse(
    Buffer.from(bytes).toString("utf8"),
  ) as ChatAttachmentMetadata;
}

export async function getChatAttachmentBytes(input: {
  attachmentId: string;
  workspaceId?: string;
  userId: string;
}) {
  const metadata = await getChatAttachment(input.attachmentId);
  if (input.workspaceId) {
    assertChatAttachmentAccess(metadata, input.workspaceId, input.userId);
  } else if (metadata.createdByUserId !== input.userId) {
    throw new Error("Attachment not found.");
  }
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
  assertChatAttachmentAccess(metadata, input.workspaceId, input.userId);
  if (metadata.kind !== "chat_file") {
    throw new Error("Attachment is not a file.");
  }
  if (!metadata.extractedTextObjectKey) {
    return { metadata, text: "" };
  }
  const bytes = await storage.download(metadata.extractedTextObjectKey);
  return { metadata, text: Buffer.from(bytes).toString("utf8") };
}
