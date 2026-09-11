import { z } from "zod";

import { getChatAttachmentBytes } from "@/modules/chat/attachments";
import {
  createCodeWorkspaceFromFiles,
  importCodeWorkspaceFile,
  listCodeWorkspaceFiles,
  readCodeWorkspaceFile,
  writeCodeWorkspaceFile,
} from "@/modules/code-workspace/storage";
import { generateWorkspaceImage } from "@/modules/provider/image-generation";
import { executeCodeSandbox } from "@/modules/tool/code-sandbox";
import {
  calculateExpression,
  calculatorInputSchema,
  codeSandboxInputSchema,
  codeWorkspaceCreateInputSchema,
  codeWorkspaceProjectInputSchema,
  codeWorkspaceReadFileInputSchema,
  codeWorkspaceReplaceTextInputSchema,
  codeWorkspaceWriteFileInputSchema,
  currentTimeInputSchema,
  htmlArtifactInputSchema,
  httpFetchInputSchema,
  imageGenerationInputSchema,
  searchWebWithSearxng,
  webSearchInputSchema,
} from "./builtin-tool-primitives";
import {
  BuiltInToolDefinition,
  MEDIUM_RISK_LEVEL,
  replaceCodeWorkspaceText,
  requireCodeWorkspaceContext,
} from "./builtin-tools.built-in-tool-execution-context";
export const builtInToolsPart1 = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "calculator",
    displayName: "Calculator",
    description: "Evaluate arithmetic expressions safely.",
    riskLevel: "low",
    category: "Think",
    inputSchema: calculatorInputSchema,
    execute: ({ expression }) => ({
      result: calculateExpression(expression),
    }),
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "current_time",
    displayName: "Current time",
    description: "Return the current date and time for any timezone.",
    riskLevel: "low",
    category: "Time",
    inputSchema: currentTimeInputSchema,
    execute: ({ timezone }) => ({
      timezone,
      iso: new Date().toISOString(),
      formatted: new Intl.DateTimeFormat("en-US", {
        dateStyle: "full",
        timeStyle: "long",
        timeZone: timezone,
      }).format(new Date()),
    }),
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "http_fetch",
    displayName: "HTTP fetch",
    description:
      "Fetch a remote URL after approval. Returns a bounded response preview; for Swagger UI pages, fetch their OpenAPI JSON endpoint (commonly /api/openapi) instead.",
    riskLevel: "high",
    category: "Web",
    inputSchema: httpFetchInputSchema,
    execute: async ({ url, method }) => {
      const response = await fetch(url, {
        method,
        signal: AbortSignal.timeout(10_000),
      });
      const text = method === "HEAD" ? "" : await response.text();
      const previewLimit = 4_000;
      return {
        status: response.status,
        statusText: response.statusText,
        url: response.url || url,
        redirected: response.redirected,
        contentType: response.headers.get("content-type"),
        contentLength: response.headers.get("content-length"),
        bodyBytes: Buffer.byteLength(text),
        bodyPreview: text.slice(0, previewLimit),
        bodyTruncated: text.length > previewLimit,
        ...(["/api/docs", "/api-docs"].includes(
          new URL(response.url || url).pathname.replace(/\/$/, ""),
        )
          ? { openApiUrl: new URL("/api/openapi", response.url || url).href }
          : {}),
      };
    },
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    name: "web_search",
    displayName: "Web search",
    description:
      "Search the web with today's date automatically included. When ok is true, use the returned summary and results to answer current-events and web questions.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Web",
    inputSchema: webSearchInputSchema,
    execute: searchWebWithSearxng,
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    name: "render_html_artifact",
    displayName: "HTML artifact",
    description:
      "Render interactive HTML/CSS/JS previews in chat for UI mockups, diagrams, cards, and demos.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Create",
    inputSchema: htmlArtifactInputSchema,
    execute: ({ title, html, css, js, height }) => ({
      kind: "html_artifact" as const,
      title,
      html,
      css,
      js,
      height,
    }),
  },
  {
    id: "00000000-0000-4000-8000-000000000038",
    name: "generate_image",
    displayName: "Generate image",
    description:
      "Generate one image from a text prompt using the project image model configured by an administrator. Omit size to use the administrator default.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Create",
    inputSchema: imageGenerationInputSchema,
    execute: async ({ prompt, size }, context) => {
      const workspaceContext = requireCodeWorkspaceContext(context);
      return generateWorkspaceImage({
        workspaceId: workspaceContext.workspaceId,
        userId: workspaceContext.userId,
        conversationId: workspaceContext.conversationId,
        prompt,
        size,
      });
    },
  },
  {
    id: "00000000-0000-4000-8000-000000000037",
    name: "run_code_sandbox",
    displayName: "Code sandbox",
    description:
      "Run Python, Node.js, or Bash in a wiped sandbox with web access and pandas, matplotlib, seaborn, PIL, OpenCV, scikit-image, and CPU PyTorch. Save charts and images as files so they appear in chat.",
    riskLevel: "high",
    category: "Code",
    inputSchema: codeSandboxInputSchema,
    execute: executeCodeSandbox,
  },
  {
    id: "00000000-0000-4000-8000-000000000034",
    name: "code_workspace_create_project",
    displayName: "Create code workspace",
    description:
      "Start a live static HTML/CSS/JS code workspace from files generated by the model, with preview and ZIP download in chat.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Code",
    inputSchema: codeWorkspaceCreateInputSchema,
    execute: async ({ title, rootFile, files }, context) => {
      const workspaceContext = requireCodeWorkspaceContext(context);
      return createCodeWorkspaceFromFiles({
        workspaceId: workspaceContext.workspaceId,
        userId: workspaceContext.userId,
        title,
        rootFile,
        files,
      });
    },
  },
  {
    id: "00000000-0000-4000-8000-000000000029",
    name: "code_workspace_list_files",
    displayName: "Code workspace files",
    description:
      "List files and return the live chat artifact for a static HTML/CSS/JS code workspace.",
    riskLevel: "low",
    category: "Code",
    inputSchema: codeWorkspaceProjectInputSchema,
    execute: async ({ projectId }, context) => {
      const workspaceContext = requireCodeWorkspaceContext(context);
      return listCodeWorkspaceFiles({
        projectId,
        workspaceId: workspaceContext.workspaceId,
        userId: workspaceContext.userId,
      });
    },
  },
  {
    id: "00000000-0000-4000-8000-000000000030",
    name: "code_workspace_read_file",
    displayName: "Read code file",
    description:
      "Read a text file from an uploaded code workspace before editing it.",
    riskLevel: "low",
    category: "Code",
    inputSchema: codeWorkspaceReadFileInputSchema,
    execute: async ({ projectId, path }, context) => {
      const workspaceContext = requireCodeWorkspaceContext(context);
      return readCodeWorkspaceFile({
        projectId,
        workspaceId: workspaceContext.workspaceId,
        userId: workspaceContext.userId,
        filePath: path,
      });
    },
  },
  {
    id: "00000000-0000-4000-8000-000000000031",
    name: "code_workspace_write_file",
    displayName: "Write code file",
    description:
      "Create or replace a text file, or copy an uploaded chat attachment into a code workspace, then return the updated live preview artifact.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Code",
    inputSchema: codeWorkspaceWriteFileInputSchema,
    execute: async ({ projectId, path, content, attachmentId }, context) => {
      const workspaceContext = requireCodeWorkspaceContext(context);
      if (attachmentId) {
        const attachment = await getChatAttachmentBytes({
          attachmentId,
          workspaceId: workspaceContext.workspaceId,
          userId: workspaceContext.userId,
        });
        return importCodeWorkspaceFile({
          projectId,
          workspaceId: workspaceContext.workspaceId,
          userId: workspaceContext.userId,
          filePath: path,
          bytes: attachment.bytes,
        });
      }
      return writeCodeWorkspaceFile({
        projectId,
        workspaceId: workspaceContext.workspaceId,
        userId: workspaceContext.userId,
        filePath: path,
        content: content!,
      });
    },
  },
  {
    id: "00000000-0000-4000-8000-000000000032",
    name: "code_workspace_replace_text",
    displayName: "Patch code file",
    description:
      "Patch a code workspace text file by replacing exact text; prefer this over rewriting large files.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Code",
    inputSchema: codeWorkspaceReplaceTextInputSchema,
    execute: async (
      toolInput: z.infer<typeof codeWorkspaceReplaceTextInputSchema>,
      context,
    ) =>
      replaceCodeWorkspaceText(toolInput, requireCodeWorkspaceContext(context)),
  },
] satisfies BuiltInToolDefinition[];
