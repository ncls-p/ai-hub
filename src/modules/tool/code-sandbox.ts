import { createHash } from "node:crypto";
import path from "node:path";

import { ConnectionConfig, Sandbox } from "@alibaba-group/opensandbox";
import type { Execution } from "@alibaba-group/opensandbox";

import { env } from "@/lib/env";
import {
  createChatAttachment,
  getChatAttachmentBytes,
  getChatAttachmentExtractedText,
  isChatFileAttachment,
  type ChatAttachment,
} from "@/modules/chat/attachments";

type CodeSandboxLanguage = "python" | "node" | "bash";

type CodeSandboxInputFile = {
  path: string;
  content?: string;
  contentBase64?: string;
};

type CodeSandboxAttachmentReference = {
  id: string;
  path?: string;
  includeExtractedText?: boolean;
};

type CodeSandboxOutputFile = {
  path: string;
  size: number;
  mimeType: string;
  hash?: string;
  textPreview?: string;
  truncated?: boolean;
  fromInput?: boolean;
  modified?: boolean;
  skipped?: "too_large";
  contentBase64?: string;
  contentOmitted?: "too_large" | "total_limit";
  attachment?: ChatAttachment;
  downloadUrl?: string;
  downloadError?: string;
};

export type CodeSandboxResult = {
  kind: "code_sandbox_result";
  ok: boolean;
  language: CodeSandboxLanguage;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  files: CodeSandboxOutputFile[];
  error?: string;
};

export type CodeSandboxRequest = {
  language: CodeSandboxLanguage;
  code: string;
  stdin?: string;
  files?: CodeSandboxInputFile[];
  attachments?: CodeSandboxAttachmentReference[];
  timeoutMs?: number;
};

type CodeSandboxExecutionContext = {
  workspaceId: string;
  userId: string;
};

type PreparedOpenSandboxInput = Omit<CodeSandboxRequest, "files"> & {
  files: Array<{ path: string; bytes: Buffer }>;
};

type OpenSandboxExecutionPayload = {
  result: CodeSandboxResult;
  inputHashes: Map<string, string>;
};

const maxSandboxAttachmentTextChars = 200_000;
const maxOpenSandboxInputFiles = 40;
const maxOpenSandboxInputFileBytes = 1_500_000;
const maxOpenSandboxInputTotalBytes = 5_000_000;
const maxOpenSandboxCodeChars = 100_000;
const defaultOpenSandboxTimeoutMs = 15_000;
const maxOpenSandboxTimeoutMs = 120_000;
const maxStdoutBytes = 64_000;
const maxStderrBytes = 64_000;
const maxFilePreviewBytes = 16_000;
const maxCollectedFiles = 30;
const maxCollectedFileBytes = 1_000_000;
const maxDownloadFileBytes = 1_000_000;
const maxDownloadTotalBytes = 5_000_000;
const openSandboxWorkspaceDir = "/workspace";

const textExtensions = new Set([
  ".c",
  ".conf",
  ".cpp",
  ".cs",
  ".css",
  ".csv",
  ".go",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".log",
  ".md",
  ".mjs",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

function normalizeLanguage(input: CodeSandboxRequest) {
  if (
    input.language === "python" ||
    input.language === "node" ||
    input.language === "bash"
  ) {
    return input.language;
  }
  throw new Error("language must be 'python', 'node', or 'bash'.");
}

function failedSandboxResult(
  input: CodeSandboxRequest,
  message: string,
): CodeSandboxResult {
  return {
    kind: "code_sandbox_result",
    ok: false,
    language: input.language,
    exitCode: null,
    signal: null,
    timedOut: false,
    durationMs: 0,
    stdout: "",
    stderr: message,
    truncated: false,
    files: [],
    error: message,
  };
}

function clampTimeoutMs(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultOpenSandboxTimeoutMs;
  }
  return Math.max(250, Math.min(maxOpenSandboxTimeoutMs, Math.floor(value)));
}

function hashBytes(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function sandboxUnavailableMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return `OpenSandbox unavailable at ${env.OPENSANDBOX_PROTOCOL}://${env.OPENSANDBOX_DOMAIN}: ${message}. For local development, start OpenSandbox with \`docker compose -f docker-compose.dev.yml up -d opensandbox-server\`.`;
}

function sanitizeAttachmentFileName(fileName: string) {
  const baseName = path.basename(fileName.replace(/\\/g, "/")).trim();
  const safeName = baseName
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .slice(0, 120)
    .trim();
  return safeName || "attachment.bin";
}

function defaultAttachmentPath(attachment: ChatAttachment) {
  return `attachments/${sanitizeAttachmentFileName(attachment.fileName)}`;
}

function extractedTextPath(filePath: string) {
  const parsed = path.posix.parse(filePath.replace(/\\/g, "/"));
  const baseName = `${parsed.name || "attachment"}.extracted.txt`;
  return path.posix.join(parsed.dir, baseName).slice(0, 260);
}

function safeRelativePath(rawPath: string) {
  if (typeof rawPath !== "string")
    throw new Error("File path must be a string.");
  const trimmed = rawPath.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed.includes("\0")) throw new Error("Invalid file path.");
  if (trimmed.startsWith("/") || /^[a-zA-Z]:\//.test(trimmed)) {
    throw new Error("Absolute file paths are not allowed.");
  }
  const normalized = path.posix.normalize(trimmed).replace(/^\.\//, "");
  if (
    !normalized ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error("Path traversal is not allowed.");
  }
  if (normalized.length > 260 || normalized.split("/").length > 16) {
    throw new Error("File path is too long or too deep.");
  }
  const [firstSegment] = normalized.split("/");
  if (
    normalized === "main.py" ||
    normalized === "main.mjs" ||
    normalized === "main.sh" ||
    normalized === "package.json" ||
    normalized === ".stdin" ||
    firstSegment === "node_modules" ||
    firstSegment === "home" ||
    firstSegment === "tmp"
  ) {
    throw new Error("Reserved sandbox file path.");
  }
  return normalized;
}

function uniqueSandboxPath(filePath: string, usedPaths: Set<string>) {
  const normalized = safeRelativePath(filePath);
  if (!usedPaths.has(normalized)) {
    usedPaths.add(normalized);
    return normalized;
  }
  const parsed = path.posix.parse(normalized);
  for (let index = 2; index < 100; index += 1) {
    const candidate = path.posix.join(
      parsed.dir,
      `${parsed.name}-${index}${parsed.ext}`,
    );
    if (!usedPaths.has(candidate)) {
      usedPaths.add(candidate);
      return candidate;
    }
  }
  throw new Error(`Too many sandbox files named ${normalized}.`);
}

function truncateSandboxInputText(text: string) {
  if (text.length <= maxSandboxAttachmentTextChars) return text;
  return `${text.slice(0, maxSandboxAttachmentTextChars)}\n\n[Truncated before sandbox execution: ${text.length - maxSandboxAttachmentTextChars} additional characters omitted.]`;
}

function bytesFromBase64(value: string, filePath: string) {
  const normalized = value.replace(/\s/g, "");
  if (
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
  ) {
    throw new Error(`Input file is not valid base64: ${filePath}`);
  }
  return Buffer.from(normalized, "base64");
}

function normalizeInputFiles(input: CodeSandboxRequest) {
  const files = input.files ?? [];
  if (files.length > maxOpenSandboxInputFiles) {
    throw new Error(
      `Too many input files. Maximum is ${maxOpenSandboxInputFiles}.`,
    );
  }
  let totalInputBytes = 0;
  return files.map((file) => {
    const filePath = safeRelativePath(file.path);
    const hasBase64 = typeof file.contentBase64 === "string";
    const textContent = typeof file.content === "string" ? file.content : "";
    const bytes = hasBase64
      ? bytesFromBase64(file.contentBase64 ?? "", filePath)
      : Buffer.from(textContent, "utf8");
    if (bytes.byteLength > maxOpenSandboxInputFileBytes) {
      throw new Error(`Input file is too large: ${filePath}`);
    }
    totalInputBytes += bytes.byteLength;
    if (totalInputBytes > maxOpenSandboxInputTotalBytes) {
      throw new Error(
        `Input files are too large. Maximum total is ${maxOpenSandboxInputTotalBytes} bytes.`,
      );
    }
    return { path: filePath, bytes };
  });
}

async function prepareOpenSandboxRequest(
  input: CodeSandboxRequest,
  context?: CodeSandboxExecutionContext,
): Promise<PreparedOpenSandboxInput> {
  const language = normalizeLanguage(input);
  if (typeof input.code !== "string" || !input.code.trim()) {
    throw new Error("code is required.");
  }
  if (input.code.length > maxOpenSandboxCodeChars) {
    throw new Error(
      `code is too large. Maximum is ${maxOpenSandboxCodeChars} characters.`,
    );
  }

  const files = normalizeInputFiles(input);
  const attachmentReferences = input.attachments ?? [];
  if (attachmentReferences.length === 0) {
    return { ...input, language, files, attachments: [] };
  }
  if (!context) {
    throw new Error("Sandbox attachment access requires a workspace context.");
  }

  const usedPaths = new Set(files.map((file) => file.path));
  for (const reference of attachmentReferences) {
    const { metadata, bytes } = await getChatAttachmentBytes({
      attachmentId: reference.id,
      workspaceId: context.workspaceId,
      userId: context.userId,
    });
    const requestedPath = reference.path?.trim();
    const filePath = uniqueSandboxPath(
      requestedPath || defaultAttachmentPath(metadata),
      usedPaths,
    );
    files.push({ path: filePath, bytes: Buffer.from(bytes) });

    if (
      reference.includeExtractedText === false ||
      !isChatFileAttachment(metadata)
    ) {
      continue;
    }
    const { text } = await getChatAttachmentExtractedText({
      attachmentId: reference.id,
      workspaceId: context.workspaceId,
      userId: context.userId,
    });
    if (!text.trim()) continue;
    files.push({
      path: uniqueSandboxPath(extractedTextPath(filePath), usedPaths),
      bytes: Buffer.from(truncateSandboxInputText(text), "utf8"),
    });
  }

  return { ...input, language, files, attachments: [] };
}

function stripEmbeddedContent(file: CodeSandboxOutputFile) {
  const publicFile = { ...file };
  delete publicFile.contentBase64;
  return publicFile;
}

function sandboxOutputFileName(filePath: string) {
  const baseName = path.basename(filePath).trim();
  return baseName || "sandbox-output.bin";
}

function shouldPersistSandboxFile(file: CodeSandboxOutputFile) {
  return Boolean(
    file.contentBase64 && (!file.fromInput || file.modified !== false),
  );
}

async function persistSandboxFile(
  file: CodeSandboxOutputFile,
  context: CodeSandboxExecutionContext,
): Promise<CodeSandboxOutputFile> {
  if (!shouldPersistSandboxFile(file)) return stripEmbeddedContent(file);
  try {
    const bytes = Buffer.from(file.contentBase64 ?? "", "base64");
    const attachment = await createChatAttachment({
      workspaceId: context.workspaceId,
      userId: context.userId,
      fileName: sandboxOutputFileName(file.path),
      mimeType: file.mimeType,
      bytes,
    });
    return {
      ...stripEmbeddedContent(file),
      attachment,
      downloadUrl: attachment.url,
    };
  } catch (error) {
    return {
      ...stripEmbeddedContent(file),
      downloadError:
        error instanceof Error
          ? error.message
          : "Failed to persist sandbox output file.",
    };
  }
}

async function persistSandboxFiles(
  result: CodeSandboxResult,
  context?: CodeSandboxExecutionContext,
): Promise<CodeSandboxResult> {
  if (!context || result.files.length === 0) {
    return {
      ...result,
      files: result.files.map(stripEmbeddedContent),
    };
  }
  return {
    ...result,
    files: await Promise.all(
      result.files.map((file) => persistSandboxFile(file, context)),
    ),
  };
}

function createOpenSandboxConnectionConfig(timeoutMs: number) {
  return new ConnectionConfig({
    domain: env.OPENSANDBOX_DOMAIN,
    protocol: env.OPENSANDBOX_PROTOCOL,
    apiKey: env.OPENSANDBOX_API_KEY || undefined,
    requestTimeoutSeconds: Math.max(30, Math.ceil(timeoutMs / 1000) + 30),
    useServerProxy: env.OPENSANDBOX_USE_SERVER_PROXY === "true",
  });
}

function entryFileForLanguage(language: CodeSandboxLanguage) {
  if (language === "python") return "main.py";
  if (language === "bash") return "main.sh";
  return "main.mjs";
}

function sourceForLanguage(input: PreparedOpenSandboxInput) {
  if (input.language === "bash") return `set -euo pipefail\n${input.code}\n`;
  if (input.language === "node") {
    return [
      "import { createRequire } from 'node:module';",
      "import { fileURLToPath } from 'node:url';",
      "import path from 'node:path';",
      "const require = createRequire(import.meta.url);",
      "const __filename = fileURLToPath(import.meta.url);",
      "const __dirname = path.dirname(__filename);",
      "globalThis.require = require;",
      "globalThis.__filename = __filename;",
      "globalThis.__dirname = __dirname;",
      "",
      input.code,
      "",
    ].join("\n");
  }
  return `${input.code}\n`;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function bashLoginCommand(script: string) {
  return `bash -lc ${shellQuote(script)}`;
}

function commonSandboxSetupScript() {
  return [
    "mkdir -p /workspace/home /workspace/tmp /mnt",
    "[ -e /mnt/data ] || ln -s /workspace /mnt/data || mkdir -p /mnt/data",
  ].join(" && ");
}

function sourceCodeInterpreterRuntimeScript(language: "node" | "python") {
  const versionVariable =
    language === "python" ? "PYTHON_VERSION" : "NODE_VERSION";
  const fallbackVersion = language === "python" ? "3.11" : "22";
  return `if [ -f /opt/code-interpreter/code-interpreter-env.sh ]; then source /opt/code-interpreter/code-interpreter-env.sh ${language} "\${${versionVariable}:-${fallbackVersion}}" >/dev/null; fi`;
}

function nodePackageResolutionScript() {
  return [
    'export NODE_PATH="$(npm root -g)${NODE_PATH:+:$NODE_PATH}"',
    '[ -e node_modules ] || ln -s "$(npm root -g)" node_modules || true',
  ].join(" && ");
}

function commandForLanguage(language: CodeSandboxLanguage, hasStdin: boolean) {
  const stdin = hasStdin ? " < .stdin" : "";
  if (language === "python") {
    return bashLoginCommand(
      [
        commonSandboxSetupScript(),
        sourceCodeInterpreterRuntimeScript("python"),
        `python3 -I main.py${stdin}`,
      ].join(" && "),
    );
  }
  if (language === "bash") {
    return bashLoginCommand(
      [
        commonSandboxSetupScript(),
        `bash --noprofile --norc -e -u -o pipefail main.sh${stdin}`,
      ].join(" && "),
    );
  }
  return bashLoginCommand(
    [
      commonSandboxSetupScript(),
      sourceCodeInterpreterRuntimeScript("node"),
      nodePackageResolutionScript(),
      `node --no-warnings main.mjs${stdin}`,
    ].join(" && "),
  );
}

function isProbablyText(bytes: Uint8Array, filePath: string) {
  if (textExtensions.has(path.extname(filePath).toLowerCase())) return true;
  if (Buffer.from(bytes).includes(0)) return false;
  return Buffer.from(bytes)
    .subarray(0, Math.min(bytes.length, 4096))
    .every((byte) => byte === 9 || byte === 10 || byte === 13 || byte >= 32);
}

function mimeTypeForPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".json") return "application/json";
  if (extension === ".csv") return "text/csv";
  if (extension === ".html" || extension === ".htm") return "text/html";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".pdf") return "application/pdf";
  if (textExtensions.has(extension)) return "text/plain";
  return "application/octet-stream";
}

function workspaceRelativePath(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  const prefix = `${openSandboxWorkspaceDir}/`;
  return normalized.startsWith(prefix)
    ? normalized.slice(prefix.length)
    : normalized.replace(/^\/+/, "");
}

function shouldIgnoreCollectedPath(filePath: string) {
  return (
    filePath === "main.py" ||
    filePath === "main.mjs" ||
    filePath === "main.sh" ||
    filePath === "package.json" ||
    filePath === ".stdin" ||
    filePath === "" ||
    filePath.startsWith("home/") ||
    filePath.startsWith("tmp/") ||
    filePath.startsWith("node_modules/")
  );
}

function truncateTextBytes(value: string, maxBytes: number) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.byteLength <= maxBytes) return { value, truncated: false };
  return {
    value: bytes.subarray(0, maxBytes).toString("utf8"),
    truncated: true,
  };
}

async function writeOpenSandboxFiles(
  sandbox: Sandbox,
  input: PreparedOpenSandboxInput,
) {
  const inputHashes = new Map<string, string>();
  const writes = input.files.map((file) => {
    inputHashes.set(file.path, hashBytes(file.bytes));
    return {
      path: `${openSandboxWorkspaceDir}/${file.path}`,
      data: file.bytes,
      mode: 644,
    };
  });

  writes.push({
    path: `${openSandboxWorkspaceDir}/${entryFileForLanguage(input.language)}`,
    data: Buffer.from(sourceForLanguage(input), "utf8"),
    mode: 644,
  });
  if (input.stdin) {
    writes.push({
      path: `${openSandboxWorkspaceDir}/.stdin`,
      data: Buffer.from(input.stdin.slice(0, 100_000), "utf8"),
      mode: 600,
    });
  }

  await sandbox.files.createDirectories([
    { path: openSandboxWorkspaceDir, mode: 700 },
    { path: `${openSandboxWorkspaceDir}/home`, mode: 700 },
    { path: `${openSandboxWorkspaceDir}/tmp`, mode: 700 },
  ]);
  await sandbox.files.writeFiles(writes);
  return inputHashes;
}

function executionText(execution: Execution) {
  const stdout = execution.logs.stdout.map((message) => message.text).join("");
  const stderrFromLogs = execution.logs.stderr
    .map((message) => message.text)
    .join("");
  const stderrFromError = execution.error
    ? [
        execution.error.name,
        execution.error.value,
        ...(execution.error.traceback ?? []),
      ]
        .filter(Boolean)
        .join("\n")
    : "";
  return {
    stdout,
    stderr: [stderrFromLogs, stderrFromError].filter(Boolean).join("\n"),
  };
}

function resultFromExecution(
  input: PreparedOpenSandboxInput,
  execution: Execution,
  startedAt: number,
): CodeSandboxResult {
  const { stdout, stderr } = executionText(execution);
  const limitedStdout = truncateTextBytes(stdout, maxStdoutBytes);
  const limitedStderr = truncateTextBytes(stderr, maxStderrBytes);
  const timedOut =
    execution.exitCode === null && /timeout|timed out|deadline/i.test(stderr);
  const exitCode = timedOut ? null : (execution.exitCode ?? null);
  return {
    kind: "code_sandbox_result",
    ok: exitCode === 0 && !execution.error,
    language: input.language,
    exitCode,
    signal: null,
    timedOut,
    durationMs: execution.complete?.executionTimeMs ?? Date.now() - startedAt,
    stdout: limitedStdout.value,
    stderr: limitedStderr.value,
    truncated: limitedStdout.truncated || limitedStderr.truncated,
    files: [],
    error: execution.error?.value,
  };
}

async function collectOpenSandboxFiles(
  sandbox: Sandbox,
  inputHashes: Map<string, string>,
) {
  const entries = await sandbox.files.listDirectory({
    path: openSandboxWorkspaceDir,
    depth: 16,
  });
  const collected: CodeSandboxOutputFile[] = [];
  let embeddedBytes = 0;

  for (const entry of entries) {
    if (collected.length >= maxCollectedFiles) break;
    if (entry.type && entry.type !== "file") continue;
    const relativePath = workspaceRelativePath(entry.path);
    if (shouldIgnoreCollectedPath(relativePath)) continue;

    const size = typeof entry.size === "number" ? entry.size : 0;
    const fromInput = inputHashes.has(relativePath);
    if (size > maxCollectedFileBytes) {
      collected.push({
        path: relativePath,
        size,
        mimeType: mimeTypeForPath(relativePath),
        skipped: "too_large",
        fromInput,
        modified: true,
      });
      continue;
    }

    const bytes = Buffer.from(
      await sandbox.files.readBytes(entry.path, {
        limit: Math.max(size, maxFilePreviewBytes, 1),
      }),
    );
    const hash = hashBytes(bytes);
    const modified = fromInput ? inputHashes.get(relativePath) !== hash : true;
    const output: CodeSandboxOutputFile = {
      path: relativePath,
      size: size || bytes.byteLength,
      mimeType: mimeTypeForPath(relativePath),
      hash,
      fromInput,
      modified,
    };

    if (isProbablyText(bytes, relativePath)) {
      output.textPreview = bytes
        .subarray(0, maxFilePreviewBytes)
        .toString("utf8");
      output.truncated = bytes.byteLength > maxFilePreviewBytes;
    }

    if (bytes.byteLength > maxDownloadFileBytes) {
      output.contentOmitted = "too_large";
    } else if (embeddedBytes + bytes.byteLength > maxDownloadTotalBytes) {
      output.contentOmitted = "total_limit";
    } else {
      output.contentBase64 = bytes.toString("base64");
      embeddedBytes += bytes.byteLength;
    }

    collected.push(output);
  }

  return collected;
}

async function runOpenSandbox(
  input: PreparedOpenSandboxInput,
): Promise<OpenSandboxExecutionPayload> {
  const timeoutMs = clampTimeoutMs(input.timeoutMs);
  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  const sandboxTimeoutSeconds = Math.max(60, timeoutSeconds + 60);
  let sandbox: Sandbox | null = null;
  const startedAt = Date.now();

  try {
    sandbox = await Sandbox.create({
      connectionConfig: createOpenSandboxConnectionConfig(timeoutMs),
      image: env.OPENSANDBOX_IMAGE,
      timeoutSeconds: sandboxTimeoutSeconds,
      resource: { cpu: "1", memory: "2Gi" },
      env: {
        NODE_OPTIONS: "--no-warnings",
        NODE_VERSION: "22",
        PYTHONDONTWRITEBYTECODE: "1",
        PYTHONUNBUFFERED: "1",
        PYTHON_VERSION: "3.11",
      },
      metadata: {
        app: "ai-hub",
        kind: "code-sandbox",
        language: input.language,
      },
    });
    const inputHashes = await writeOpenSandboxFiles(sandbox, input);
    const execution = await sandbox.commands.run(
      commandForLanguage(input.language, Boolean(input.stdin)),
      {
        workingDirectory: openSandboxWorkspaceDir,
        timeoutSeconds,
        envs: {
          HOME: `${openSandboxWorkspaceDir}/home`,
          MPLCONFIGDIR: `${openSandboxWorkspaceDir}/tmp/matplotlib`,
          TMPDIR: `${openSandboxWorkspaceDir}/tmp`,
          XDG_CACHE_HOME: `${openSandboxWorkspaceDir}/tmp/cache`,
        },
      },
    );
    const result = resultFromExecution(input, execution, startedAt);
    return {
      inputHashes,
      result: {
        ...result,
        files: await collectOpenSandboxFiles(sandbox, inputHashes),
      },
    };
  } finally {
    if (sandbox) {
      await sandbox.kill().catch(() => undefined);
      await sandbox.close().catch(() => undefined);
    }
  }
}

export async function executeCodeSandbox(
  input: CodeSandboxRequest,
  context?: CodeSandboxExecutionContext,
): Promise<CodeSandboxResult> {
  let openSandboxInput: PreparedOpenSandboxInput;
  try {
    openSandboxInput = await prepareOpenSandboxRequest(input, context);
  } catch (error) {
    return failedSandboxResult(
      input,
      error instanceof Error
        ? error.message
        : "Failed to prepare sandbox inputs.",
    );
  }

  try {
    const { result } = await runOpenSandbox(openSandboxInput);
    return persistSandboxFiles(result, context);
  } catch (error) {
    return failedSandboxResult(input, sandboxUnavailableMessage(error));
  }
}
