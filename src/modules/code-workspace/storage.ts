import { createHash, randomUUID } from "node:crypto";
import { readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";

import { logHandledError } from "@/lib/logger";
import { storage } from "@/server/infrastructure/storage";

export type CodeWorkspaceFileSummary = {
  path: string;
  size: number;
  mimeType: string;
  binary: boolean;
  hash: string;
  updatedAt: string;
};

export type CodeWorkspaceMetadata = {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  title: string;
  rootFile: string | null;
  version: number;
  previewToken: string;
  createdAt: string;
  updatedAt: string;
  files: CodeWorkspaceFileSummary[];
};

export type CodeWorkspaceArtifact = {
  kind: "code_workspace_artifact";
  projectId: string;
  title: string;
  rootFile: string | null;
  version: number;
  previewUrl: string | null;
  downloadUrl: string;
  files: CodeWorkspaceFileSummary[];
  message?: string;
};

export type CodeWorkspaceReadResult = {
  projectId: string;
  path: string;
  content: string;
  mimeType: string;
  size: number;
  hash: string;
  version: number;
};

export type CodeWorkspaceCreateFileInput = {
  path: string;
  content?: string;
};

const codeWorkspaceStoragePrefix =
  process.env.CODE_WORKSPACE_STORAGE_PREFIX ?? "code-workspaces";
const legacyCodeWorkspaceRoots = Array.from(
  new Set(
    [
      process.env.CODE_WORKSPACE_DIR,
      path.join(os.tmpdir(), "ai-hub", "code-workspaces"),
      path.join(process.cwd(), ".data", "code-workspaces"),
    ].filter((value): value is string => Boolean(value)),
  ),
);
const maxZipBytes = 20 * 1024 * 1024;
const maxExtractedBytes = 50 * 1024 * 1024;
const maxFiles = 500;
const maxPathSegments = 16;
const maxPathLength = 260;
const maxTextFileBytes = 1_000_000;

const textExtensions = new Set([
  ".html",
  ".htm",
  ".css",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".txt",
  ".md",
  ".svg",
  ".xml",
  ".webmanifest",
]);

const binaryExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
  ".bmp",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".mp3",
  ".mp4",
  ".webm",
]);

const ignoredPathPrefixes = ["__MACOSX/", ".git/", "node_modules/"];
const ignoredFileNames = new Set([".DS_Store", "Thumbs.db"]);

function workspaceObjectKey(projectId: string, ...segments: string[]) {
  assertSafeProjectId(projectId);
  return [codeWorkspaceStoragePrefix, projectId, ...segments]
    .map((segment) => segment.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

function metadataObjectKey(projectId: string) {
  return workspaceObjectKey(projectId, "metadata.json");
}

function fileObjectKey(projectId: string, projectPath: string) {
  return workspaceObjectKey(projectId, "files", projectPath);
}

function legacyProjectDirectory(projectId: string, root: string) {
  return path.join(root, projectId);
}

function legacyProjectFilesDirectory(projectId: string, root: string) {
  return path.join(legacyProjectDirectory(projectId, root), "files");
}

function legacyMetadataPath(projectId: string, root: string) {
  return path.join(legacyProjectDirectory(projectId, root), "metadata.json");
}

function assertSafeProjectId(projectId: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      projectId,
    )
  ) {
    throw new Error("Invalid code workspace id.");
  }
}

async function pathExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function safeLegacyStoragePath(
  root: string,
  projectId: string,
  projectPath: string,
) {
  assertSafeProjectId(projectId);
  const filesRoot = legacyProjectFilesDirectory(projectId, root);
  const fullPath = path.resolve(filesRoot, projectPath);
  const resolvedRoot = path.resolve(filesRoot);
  if (
    fullPath !== resolvedRoot &&
    !fullPath.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error("Path traversal is not allowed.");
  }
  return fullPath;
}

async function migrateLegacyProjectToObjectStorage(projectId: string) {
  for (const root of legacyCodeWorkspaceRoots) {
    const metadataFilePath = legacyMetadataPath(projectId, root);
    if (!(await pathExists(metadataFilePath))) continue;

    const raw = await readFile(metadataFilePath, "utf8");
    const metadata = JSON.parse(raw) as CodeWorkspaceMetadata;
    for (const file of metadata.files) {
      const bytes = await readFile(
        safeLegacyStoragePath(root, projectId, file.path),
      );
      await storage.upload(
        fileObjectKey(projectId, file.path),
        bytes,
        file.mimeType,
      );
    }
    await storage.upload(
      metadataObjectKey(projectId),
      JSON.stringify(metadata, null, 2),
      "application/json; charset=utf-8",
    );
    await rm(legacyProjectDirectory(projectId, root), {
      recursive: true,
      force: true,
    }).catch(() => {});
    return metadata;
  }
  return null;
}

async function deleteUploadedProject(projectId: string, filePaths: string[]) {
  await Promise.all(
    Array.from(new Set(filePaths))
      .map((filePath) => fileObjectKey(projectId, filePath))
      .concat(metadataObjectKey(projectId))
      .map((key) => storage.delete(key).catch(() => undefined)),
  );
}

export function normalizeWorkspacePath(rawPath: string) {
  const trimmed = rawPath.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed.includes("\0")) {
    throw new Error("Invalid file path.");
  }
  if (trimmed.startsWith("/") || /^[a-zA-Z]:\//.test(trimmed)) {
    throw new Error("Absolute paths are not allowed.");
  }
  const normalized = path.posix.normalize(trimmed).replace(/^\.\//, "");
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized === ".." ||
    normalized.includes("/../")
  ) {
    throw new Error("Path traversal is not allowed.");
  }
  if (normalized.length > maxPathLength) {
    throw new Error("File path is too long.");
  }
  if (normalized.split("/").length > maxPathSegments) {
    throw new Error("File path is too deep.");
  }
  return normalized;
}

function isIgnoredPath(projectPath: string) {
  const lowerPath = projectPath.toLowerCase();
  if (
    ignoredPathPrefixes.some((prefix) =>
      lowerPath.startsWith(prefix.toLowerCase()),
    )
  ) {
    return true;
  }
  return ignoredFileNames.has(path.posix.basename(projectPath));
}

function isAllowedPath(projectPath: string) {
  const extension = path.posix.extname(projectPath).toLowerCase();
  return textExtensions.has(extension) || binaryExtensions.has(extension);
}

function declaredZipUncompressedSize(entry: JSZip.JSZipObject) {
  const compressedEntry = entry as unknown as {
    _data?: { uncompressedSize?: unknown };
  };
  const size = compressedEntry._data?.uncompressedSize;
  return typeof size === "number" && Number.isFinite(size) ? size : null;
}

function totalWorkspaceBytes(files: CodeWorkspaceFileSummary[]) {
  return files.reduce((total, file) => total + file.size, 0);
}

export function isTextWorkspacePath(projectPath: string) {
  return textExtensions.has(path.posix.extname(projectPath).toLowerCase());
}

const CONTENT_TYPES_BY_EXTENSION = new Map<string, string>([
  [".html", "text/html; charset=utf-8"],
  [".htm", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".cjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".ico", "image/x-icon"],
  [".bmp", "image/bmp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".otf", "font/otf"],
  [".mp3", "audio/mpeg"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
]);

function contentTypeForPath(projectPath: string) {
  return (
    CONTENT_TYPES_BY_EXTENSION.get(
      path.posix.extname(projectPath).toLowerCase(),
    ) ?? "application/octet-stream"
  );
}

function hashBytes(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function titleFromFileName(fileName: string) {
  const base = path.basename(fileName).replace(/\.zip$/i, "");
  return base.trim().slice(0, 120) || "Code workspace";
}

function findRootFile(files: CodeWorkspaceFileSummary[]) {
  const htmlFiles = files
    .filter((file) => /\.html?$/i.test(file.path))
    .map((file) => file.path)
    .sort((a, b) => {
      const aIsIndex = path.posix.basename(a).toLowerCase() === "index.html";
      const bIsIndex = path.posix.basename(b).toLowerCase() === "index.html";
      if (aIsIndex !== bIsIndex) return aIsIndex ? -1 : 1;
      return a.split("/").length - b.split("/").length || a.localeCompare(b);
    });
  return htmlFiles[0] ?? null;
}

async function saveMetadata(metadata: CodeWorkspaceMetadata) {
  await storage.upload(
    metadataObjectKey(metadata.id),
    JSON.stringify(metadata, null, 2),
    "application/json; charset=utf-8",
  );
}

export async function getCodeWorkspace(projectId: string) {
  assertSafeProjectId(projectId);
  try {
    const bytes = await storage.download(metadataObjectKey(projectId));
    return JSON.parse(
      Buffer.from(bytes).toString("utf8"),
    ) as CodeWorkspaceMetadata;
  } catch {
    const migrated = await migrateLegacyProjectToObjectStorage(projectId);
    if (migrated) return migrated;
    throw new Error("Code workspace not found.");
  }
}

export function codeWorkspaceArtifact(
  metadata: CodeWorkspaceMetadata,
  message?: string,
): CodeWorkspaceArtifact {
  const rootFile = metadata.rootFile;
  return {
    kind: "code_workspace_artifact",
    projectId: metadata.id,
    title: metadata.title,
    rootFile,
    version: metadata.version,
    previewUrl: rootFile
      ? `/api/workspace/code-projects/${metadata.id}/preview/${metadata.previewToken}/${rootFile}`
      : null,
    downloadUrl: `/api/workspace/code-projects/${metadata.id}/download`,
    files: [...metadata.files].sort((a, b) => a.path.localeCompare(b.path)),
    message,
  };
}

export async function createCodeWorkspaceFromFiles(input: {
  workspaceId: string;
  userId: string;
  title: string;
  rootFile?: string | null;
  files: CodeWorkspaceCreateFileInput[];
}) {
  if (input.files.length === 0) {
    throw new Error("Create at least one file in the code workspace.");
  }
  if (input.files.length > maxFiles) {
    throw new Error(`Too many files. Maximum is ${maxFiles}.`);
  }

  const projectId = randomUUID();
  const now = new Date().toISOString();
  const summaries: CodeWorkspaceFileSummary[] = [];
  const seenPaths = new Set<string>();
  const writtenPaths: string[] = [];
  let totalBytes = 0;

  try {
    for (const file of input.files) {
      const projectPath = normalizeWorkspacePath(file.path);
      if (seenPaths.has(projectPath)) {
        throw new Error(`Duplicate file path: ${projectPath}`);
      }
      seenPaths.add(projectPath);
      if (!isAllowedPath(projectPath) || !isTextWorkspacePath(projectPath)) {
        throw new Error(`Unsupported text file type: ${projectPath}`);
      }
      const bytes = new TextEncoder().encode(file.content ?? "");
      if (bytes.byteLength > maxTextFileBytes) {
        throw new Error(`Text file is too large: ${projectPath}`);
      }
      totalBytes += bytes.byteLength;
      if (totalBytes > maxExtractedBytes) {
        throw new Error(
          "Code workspace contents are too large. Maximum is 50 MB.",
        );
      }

      await storage.upload(
        fileObjectKey(projectId, projectPath),
        bytes,
        contentTypeForPath(projectPath),
      );
      writtenPaths.push(projectPath);
      summaries.push({
        path: projectPath,
        size: bytes.byteLength,
        mimeType: contentTypeForPath(projectPath),
        binary: false,
        hash: hashBytes(bytes),
        updatedAt: now,
      });
    }

    const requestedRootFile = input.rootFile
      ? normalizeWorkspacePath(input.rootFile)
      : null;
    if (
      requestedRootFile &&
      !summaries.some((file) => file.path === requestedRootFile)
    ) {
      throw new Error("rootFile must reference one of the created files.");
    }
    const rootFile = requestedRootFile ?? findRootFile(summaries);
    if (!rootFile) {
      throw new Error("Create at least one HTML file, usually index.html.");
    }
    if (!/\.html?$/i.test(rootFile)) {
      throw new Error("rootFile must be an HTML file.");
    }

    const metadata: CodeWorkspaceMetadata = {
      id: projectId,
      workspaceId: input.workspaceId,
      createdByUserId: input.userId,
      title: input.title.trim().slice(0, 120) || "Code workspace",
      rootFile,
      version: 1,
      previewToken: randomUUID(),
      createdAt: now,
      updatedAt: now,
      files: summaries.sort((a, b) => a.path.localeCompare(b.path)),
    };
    await saveMetadata(metadata);
    return codeWorkspaceArtifact(metadata, "Created code workspace.");
  } catch (error) {
    await deleteUploadedProject(projectId, writtenPaths);
    throw error;
  }
}

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

function assertCodeWorkspaceAccess(
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

export async function listCodeWorkspaceFiles(input: {
  projectId: string;
  workspaceId: string;
  userId?: string;
}) {
  const metadata = await getCodeWorkspace(input.projectId);
  assertCodeWorkspaceAccess(metadata, input.workspaceId, input.userId);
  return codeWorkspaceArtifact(metadata);
}

export async function readCodeWorkspaceFile(input: {
  projectId: string;
  workspaceId: string;
  userId?: string;
  filePath: string;
}): Promise<CodeWorkspaceReadResult> {
  const metadata = await getCodeWorkspace(input.projectId);
  assertCodeWorkspaceAccess(metadata, input.workspaceId, input.userId);
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

export async function writeCodeWorkspaceFile(input: {
  projectId: string;
  workspaceId: string;
  userId?: string;
  filePath: string;
  content: string;
}) {
  try {
    const metadata = await getCodeWorkspace(input.projectId);
    assertCodeWorkspaceAccess(metadata, input.workspaceId, input.userId);
    const projectPath = normalizeWorkspacePath(input.filePath);
    if (!isAllowedPath(projectPath) || !isTextWorkspacePath(projectPath)) {
      throw new Error("Only supported text web files can be written.");
    }
    const bytes = new TextEncoder().encode(input.content);
    if (bytes.byteLength > maxTextFileBytes) {
      throw new Error("File content is too large.");
    }

    await storage.upload(
      fileObjectKey(metadata.id, projectPath),
      bytes,
      contentTypeForPath(projectPath),
    );

    const now = new Date().toISOString();
    const nextSummary: CodeWorkspaceFileSummary = {
      path: projectPath,
      size: bytes.byteLength,
      mimeType: contentTypeForPath(projectPath),
      binary: false,
      hash: hashBytes(bytes),
      updatedAt: now,
    };
    const existingIndex = metadata.files.findIndex(
      (file) => file.path === projectPath,
    );
    const nextFiles = [...metadata.files];
    if (existingIndex >= 0) {
      nextFiles[existingIndex] = nextSummary;
    } else {
      if (nextFiles.length >= maxFiles) {
        throw new Error(`Too many files. Maximum is ${maxFiles}.`);
      }
      nextFiles.push(nextSummary);
    }
    if (totalWorkspaceBytes(nextFiles) > maxExtractedBytes) {
      throw new Error(
        "Code workspace contents are too large. Maximum is 50 MB.",
      );
    }
    const nextMetadata: CodeWorkspaceMetadata = {
      ...metadata,
      rootFile:
        metadata.rootFile &&
        nextFiles.some((file) => file.path === metadata.rootFile)
          ? metadata.rootFile
          : findRootFile(nextFiles),
      version: metadata.version + 1,
      updatedAt: now,
      files: nextFiles.sort((a, b) => a.path.localeCompare(b.path)),
    };
    await saveMetadata(nextMetadata);
    return codeWorkspaceArtifact(nextMetadata, `Updated ${projectPath}.`);
  } catch (error) {
    logHandledError("Failed to write code workspace file", {}, error as Error);
    throw error;
  }
}

export async function deleteCodeWorkspaceFile(input: {
  projectId: string;
  workspaceId: string;
  userId?: string;
  filePath: string;
}) {
  const metadata = await getCodeWorkspace(input.projectId);
  assertCodeWorkspaceAccess(metadata, input.workspaceId, input.userId);
  const projectPath = normalizeWorkspacePath(input.filePath);
  if (!metadata.files.some((file) => file.path === projectPath)) {
    throw new Error("File not found in code workspace.");
  }
  await storage.delete(fileObjectKey(metadata.id, projectPath));
  const now = new Date().toISOString();
  const nextFiles = metadata.files.filter((file) => file.path !== projectPath);
  const nextMetadata: CodeWorkspaceMetadata = {
    ...metadata,
    rootFile:
      metadata.rootFile === projectPath
        ? findRootFile(nextFiles)
        : metadata.rootFile,
    version: metadata.version + 1,
    updatedAt: now,
    files: nextFiles,
  };
  await saveMetadata(nextMetadata);
  return codeWorkspaceArtifact(nextMetadata, `Deleted ${projectPath}.`);
}

export async function getCodeWorkspaceFileBytes(input: {
  projectId: string;
  filePath: string;
}) {
  const metadata = await getCodeWorkspace(input.projectId);
  const projectPath = normalizeWorkspacePath(
    input.filePath || metadata.rootFile || "index.html",
  );
  const summary = metadata.files.find((file) => file.path === projectPath);
  if (!summary) throw new Error("File not found in code workspace.");
  const bytes = await storage.download(fileObjectKey(metadata.id, projectPath));
  return { metadata, summary, bytes };
}

export async function getCodeWorkspaceFilesForPublish(input: {
  projectId: string;
  workspaceId: string;
  userId?: string;
}) {
  const metadata = await getCodeWorkspace(input.projectId);
  assertCodeWorkspaceAccess(metadata, input.workspaceId, input.userId);
  const files = await Promise.all(
    metadata.files.map(async (file) => ({
      ...file,
      bytes: await storage.download(fileObjectKey(metadata.id, file.path)),
    })),
  );
  return { metadata, files };
}

export async function createCodeWorkspaceZip(input: {
  projectId: string;
  workspaceId: string;
  userId?: string;
}) {
  const metadata = await getCodeWorkspace(input.projectId);
  assertCodeWorkspaceAccess(metadata, input.workspaceId, input.userId);
  const zip = new JSZip();
  for (const file of metadata.files) {
    const bytes = await storage.download(fileObjectKey(metadata.id, file.path));
    zip.file(file.path, bytes);
  }
  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return {
    fileName: `${metadata.title.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "code-workspace"}.zip`,
    bytes,
  };
}
