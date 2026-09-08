import { canReadSharedConversationAsset } from "@/modules/chat/conversation-asset-access";
import JSZip from "jszip";
import { randomUUID } from "node:crypto";

import { storage } from "@/server/infrastructure/storage";
import {
  declaredZipUncompressedSize,
  deleteUploadedProject,
  isAllowedPath,
  isIgnoredPath,
  isTextWorkspacePath,
  normalizeWorkspacePath,
} from "./storage.assert-safe-project-id";
import {
  CodeWorkspaceFileSummary,
  CodeWorkspaceMetadata,
  CodeWorkspaceReadResult,
  fileObjectKey,
  maxExtractedBytes,
  maxFiles,
  maxTextFileBytes,
  maxZipBytes,
} from "./storage.code-workspace-file-summary";
import {
  codeWorkspaceArtifact,
  contentTypeForPath,
  findRootFile,
  getCodeWorkspace,
  hashBytes,
  saveMetadata,
  titleFromFileName,
} from "./storage.content-type-for-path";

export async function createCodeWorkspaceFromZip(input: {
  workspaceId: string;
  userId: string;
  fileName: string;
  buffer: Uint8Array;
}) {
  if (input.buffer.byteLength > maxZipBytes) {
    throw new Error("ZIP file is too large. Maximum size is 20 MB.");
  }

  const zip = await JSZip.loadAsync(input.buffer, { checkCRC32: true });
  const projectId = randomUUID();
  const now = new Date().toISOString();
  const files: CodeWorkspaceFileSummary[] = [];
  const writtenPaths: string[] = [];
  const seenPaths = new Set<string>();
  let extractedBytes = 0;

  try {
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      if (entry.unsafeOriginalName && entry.unsafeOriginalName !== entry.name) {
        throw new Error(`Unsafe ZIP path: ${entry.unsafeOriginalName}`);
      }
      const unixPermissions = entry.unixPermissions;
      if (
        typeof unixPermissions === "number" &&
        (unixPermissions & 0o170000) === 0o120000
      ) {
        throw new Error("ZIP symlinks are not allowed.");
      }

      let projectPath: string;
      try {
        projectPath = normalizeWorkspacePath(entry.name);
      } catch {
        throw new Error(`Unsafe ZIP path: ${entry.name}`);
      }
      if (isIgnoredPath(projectPath)) continue;
      if (!isAllowedPath(projectPath)) {
        throw new Error(`Unsupported file type in ZIP: ${projectPath}`);
      }
      if (seenPaths.has(projectPath)) {
        throw new Error(`Duplicate file path in ZIP: ${projectPath}`);
      }
      seenPaths.add(projectPath);
      if (files.length >= maxFiles) {
        throw new Error(`Too many files in ZIP. Maximum is ${maxFiles}.`);
      }

      const declaredSize = declaredZipUncompressedSize(entry);
      if (
        declaredSize !== null &&
        extractedBytes + declaredSize > maxExtractedBytes
      ) {
        throw new Error(
          "Extracted ZIP contents are too large. Maximum is 50 MB.",
        );
      }
      const bytes = await entry.async("uint8array");
      extractedBytes += bytes.byteLength;
      if (extractedBytes > maxExtractedBytes) {
        throw new Error(
          "Extracted ZIP contents are too large. Maximum is 50 MB.",
        );
      }
      if (
        isTextWorkspacePath(projectPath) &&
        bytes.byteLength > maxTextFileBytes
      ) {
        throw new Error(`Text file is too large: ${projectPath}`);
      }

      await storage.upload(
        fileObjectKey(projectId, projectPath),
        bytes,
        contentTypeForPath(projectPath),
      );
      writtenPaths.push(projectPath);
      files.push({
        path: projectPath,
        size: bytes.byteLength,
        mimeType: contentTypeForPath(projectPath),
        binary: !isTextWorkspacePath(projectPath),
        hash: hashBytes(bytes),
        updatedAt: now,
      });
    }

    if (files.length === 0) {
      throw new Error("ZIP does not contain supported web files.");
    }

    const metadata: CodeWorkspaceMetadata = {
      id: projectId,
      workspaceId: input.workspaceId,
      createdByUserId: input.userId,
      title: titleFromFileName(input.fileName),
      rootFile: findRootFile(files),
      version: 1,
      previewToken: randomUUID(),
      createdAt: now,
      updatedAt: now,
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
    };
    await saveMetadata(metadata);
    return metadata;
  } catch (error) {
    await deleteUploadedProject(projectId, writtenPaths);
    throw error;
  }
}

export function assertCodeWorkspaceAccess(
  metadata: CodeWorkspaceMetadata,
  workspaceId: string,
  userId?: string,
) {
  if (
    metadata.workspaceId !== workspaceId ||
    (userId && metadata.createdByUserId !== userId)
  ) {
    throw new Error("Code workspace not found.");
  }
}

async function assertReadableCodeWorkspace(
  metadata: CodeWorkspaceMetadata,
  input: { workspaceId: string; userId?: string },
) {
  if (metadata.workspaceId !== input.workspaceId)
    throw new Error("Code workspace not found.");
  if (!input.userId || metadata.createdByUserId === input.userId) return;
  if (
    !(await canReadSharedConversationAsset(
      metadata,
      input.userId,
      "code_workspace",
    ))
  )
    throw new Error("Code workspace not found.");
}

export async function listCodeWorkspaceFiles(input: {
  projectId: string;
  workspaceId: string;
  userId?: string;
}) {
  const metadata = await getCodeWorkspace(input.projectId);
  await assertReadableCodeWorkspace(metadata, input);
  return codeWorkspaceArtifact(metadata);
}

export async function readCodeWorkspaceFile(input: {
  projectId: string;
  workspaceId: string;
  userId?: string;
  filePath: string;
}): Promise<CodeWorkspaceReadResult> {
  const metadata = await getCodeWorkspace(input.projectId);
  await assertReadableCodeWorkspace(metadata, input);
  const projectPath = normalizeWorkspacePath(input.filePath);
  const summary = metadata.files.find((file) => file.path === projectPath);
  if (!summary) throw new Error("File not found in code workspace.");
  if (summary.binary) throw new Error("Binary files cannot be read as text.");
  const bytes = await storage.download(fileObjectKey(metadata.id, projectPath));
  const content = Buffer.from(bytes).toString("utf8");
  return {
    projectId: metadata.id,
    path: projectPath,
    content,
    mimeType: summary.mimeType,
    size: summary.size,
    hash: summary.hash,
    version: metadata.version,
  };
}

export function writableWorkspaceFilePath(filePath: string) {
  const projectPath = normalizeWorkspacePath(filePath);
  if (!isAllowedPath(projectPath) || !isTextWorkspacePath(projectPath)) {
    throw new Error("Only supported text web files can be written.");
  }
  return projectPath;
}

export function encodeWorkspaceTextContent(content: string) {
  const bytes = new TextEncoder().encode(content);
  if (bytes.byteLength > maxTextFileBytes) {
    throw new Error("File content is too large.");
  }
  return bytes;
}

export function fileSummaryForTextContent(
  projectPath: string,
  bytes: Uint8Array,
  updatedAt: string,
): CodeWorkspaceFileSummary {
  return {
    path: projectPath,
    size: bytes.byteLength,
    mimeType: contentTypeForPath(projectPath),
    binary: false,
    hash: hashBytes(bytes),
    updatedAt,
  };
}
