import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import {
  createCodeWorkspaceFromFiles,
  deleteCodeWorkspaceFile,
  listCodeWorkspaceFiles,
  readCodeWorkspaceFile,
  writeCodeWorkspaceFile,
} from "@/modules/code-workspace/storage";
import {
  getUserGitHubStatus,
  publishCodeWorkspaceToGitHub,
} from "@/modules/github/publishing";
import { executeCodeSandbox } from "@/modules/tool/code-sandbox";
import type { ToolRiskLevel } from "./builtin-tools-catalog";
import { builtInToolInputSchemaJson } from "./builtin-tool-json-schema";
import {
  calculatorInputSchema,
  currentTimeInputSchema,
  httpFetchInputSchema,
  webSearchInputSchema,
  htmlArtifactInputSchema,
  codeSandboxInputSchema,
  codeWorkspaceCreateInputSchema,
  codeWorkspaceProjectInputSchema,
  codeWorkspaceReadFileInputSchema,
  codeWorkspaceWriteFileInputSchema,
  codeWorkspaceReplaceTextInputSchema,
  githubPublishStatusInputSchema,
  githubPublishCodeWorkspaceInputSchema,
  randomNumberInputSchema,
  uuidGeneratorInputSchema,
  dateMathInputSchema,
  jsonToolInputSchema,
  textStatsInputSchema,
  base64ToolInputSchema,
  hashTextInputSchema,
  unitConverterInputSchema,
  slugifyTextInputSchema,
  colorConverterInputSchema,
  markdownTableInputSchema,
  calculateExpression,
  searchWebWithSearxng,
  randomNumbers,
  dateMath,
  jsonTool,
  textStats,
  base64Tool,
  unitConverter,
  slugifyText,
  colorConverter,
  markdownTable,
} from "./builtin-tool-primitives";
import {
  actionPlanInputSchema,
  businessDocumentInputSchema,
  competitiveBattlecardInputSchema,
  createActionPlanArtifact,
  createBusinessDocumentArtifact,
  createCompetitiveBattlecardArtifact,
  createCustomerAccountPlanArtifact,
  createDecisionMatrixArtifact,
  createEmailPackArtifact,
  createMeetingBriefArtifact,
  createProjectStatusReportArtifact,
  createRaciMatrixArtifact,
  createRiskRegisterArtifact,
  createSpreadsheetArtifact,
  customerAccountPlanInputSchema,
  decisionMatrixInputSchema,
  emailPackInputSchema,
  meetingBriefInputSchema,
  projectStatusReportInputSchema,
  raciMatrixInputSchema,
  riskRegisterInputSchema,
  spreadsheetInputSchema,
} from "./business-artifact-tools";
import {
  createSlideDeckArtifact,
  slideDeckInputSchema,
} from "./slide-deck-tool";

export type { ToolRiskLevel } from "./builtin-tools-catalog";

export interface BuiltInToolExecutionContext {
  workspaceId: string;
  userId: string;
  conversationId?: string;
  messageId?: string;
  emitEvent?: (event: Record<string, unknown>) => void;
}

export interface BuiltInToolDefinition<Input = unknown, Output = unknown> {
  id: string;
  name: string;
  displayName: string;
  description: string;
  riskLevel: ToolRiskLevel;
  category: string;
  inputSchema: z.ZodType<Input>;
  execute(
    input: Input,
    context?: BuiltInToolExecutionContext,
  ): Promise<Output> | Output;
}

function requireCodeWorkspaceContext(
  context: BuiltInToolExecutionContext | undefined,
) {
  if (!context?.workspaceId) {
    throw new Error("Code workspace tools require chat workspace context.");
  }
  return context;
}

async function replaceCodeWorkspaceText(
  input: z.infer<typeof codeWorkspaceReplaceTextInputSchema>,
  context: BuiltInToolExecutionContext,
) {
  const existing = await readCodeWorkspaceFile({
    projectId: input.projectId,
    workspaceId: context.workspaceId,
    userId: context.userId,
    filePath: input.path,
  });
  const occurrences = existing.content.split(input.oldText).length - 1;
  if (occurrences === 0) {
    throw new Error("oldText was not found in the target file.");
  }
  if (!input.replaceAll && occurrences > 1) {
    throw new Error(
      "oldText appears multiple times. Set replaceAll to true or provide a more specific oldText.",
    );
  }
  const nextContent = input.replaceAll
    ? existing.content.split(input.oldText).join(input.newText)
    : existing.content.replace(input.oldText, input.newText);
  return writeCodeWorkspaceFile({
    projectId: input.projectId,
    workspaceId: context.workspaceId,
    userId: context.userId,
    filePath: input.path,
    content: nextContent,
  });
}

const MEDIUM_RISK_LEVEL = "medium";

export const builtInTools = [
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
    description: "Fetch a remote URL after approval.",
    riskLevel: "high",
    category: "Web",
    inputSchema: httpFetchInputSchema,
    execute: async ({ url, method }) => {
      const response = await fetch(url, {
        method,
        signal: AbortSignal.timeout(10_000),
      });
      const text = method === "HEAD" ? "" : await response.text();
      return {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type"),
        bodyPreview: text.slice(0, 4_000),
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
    id: "00000000-0000-4000-8000-000000000037",
    name: "run_code_sandbox",
    displayName: "Code sandbox",
    description:
      "Run Python, Node.js, or Bash in a wiped sandbox with broad data/science/document libraries and safe uploaded-document access.",
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
      "Create or replace a text file in an uploaded code workspace, then return the updated live preview artifact.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Code",
    inputSchema: codeWorkspaceWriteFileInputSchema,
    execute: async ({ projectId, path, content }, context) => {
      const workspaceContext = requireCodeWorkspaceContext(context);
      return writeCodeWorkspaceFile({
        projectId,
        workspaceId: workspaceContext.workspaceId,
        userId: workspaceContext.userId,
        filePath: path,
        content,
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
  {
    id: "00000000-0000-4000-8000-000000000033",
    name: "code_workspace_delete_file",
    displayName: "Delete code file",
    description:
      "Delete a file from an uploaded code workspace, then return the updated live preview artifact.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Code",
    inputSchema: codeWorkspaceReadFileInputSchema,
    execute: async ({ projectId, path }, context) => {
      const workspaceContext = requireCodeWorkspaceContext(context);
      return deleteCodeWorkspaceFile({
        projectId,
        workspaceId: workspaceContext.workspaceId,
        userId: workspaceContext.userId,
        filePath: path,
      });
    },
  },
  {
    id: "00000000-0000-4000-8000-000000000035",
    name: "github_get_publish_status",
    displayName: "GitHub status",
    description:
      "Check whether the current user connected GitHub and list repositories they can publish to. If not connected, return the chat-safe connect URL.",
    riskLevel: "low",
    category: "Code",
    inputSchema: githubPublishStatusInputSchema,
    execute: async (_input, context) => {
      const workspaceContext = requireCodeWorkspaceContext(context);
      return getUserGitHubStatus({
        userId: workspaceContext.userId,
        workspaceId: workspaceContext.workspaceId,
      });
    },
  },
  {
    id: "00000000-0000-4000-8000-000000000036",
    name: "github_publish_code_workspace",
    displayName: "Publish code to GitHub",
    description:
      "Publish a code workspace to one of the current user's GitHub repositories. The user must choose PR vs direct push, repository, and branch; direct push requires explicit confirmation.",
    riskLevel: "critical",
    category: "Code",
    inputSchema: githubPublishCodeWorkspaceInputSchema,
    execute: async (
      toolInput: z.infer<typeof githubPublishCodeWorkspaceInputSchema>,
      context,
    ) => {
      const workspaceContext = requireCodeWorkspaceContext(context);
      return publishCodeWorkspaceToGitHub({
        projectId: toolInput.projectId,
        repositoryId: toolInput.repositoryId,
        mode: toolInput.mode,
        targetBranch: toolInput.targetBranch,
        sourceBranch: toolInput.sourceBranch,
        targetDirectory: toolInput.targetDirectory,
        commitMessage: toolInput.commitMessage,
        pullRequestTitle: toolInput.pullRequestTitle,
        pullRequestBody: toolInput.pullRequestBody,
        confirmDirectPush: toolInput.confirmDirectPush,
        workspaceId: workspaceContext.workspaceId,
        userId: workspaceContext.userId,
        conversationId: workspaceContext.conversationId,
      });
    },
  },
  {
    id: "00000000-0000-4000-8000-000000000017",
    name: "create_slide_deck",
    displayName: "Slide deck",
    description:
      "Create or revise an interactive slide deck with click-to-reveal steps and PDF print/export styling.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Create",
    inputSchema: slideDeckInputSchema,
    execute: createSlideDeckArtifact,
  },
  {
    id: "00000000-0000-4000-8000-000000000018",
    name: "create_business_document",
    displayName: "Business document",
    description:
      "Create printable briefs, reports, proposals, policies, SOPs, and memos.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Work",
    inputSchema: businessDocumentInputSchema,
    execute: createBusinessDocumentArtifact,
  },
  {
    id: "00000000-0000-4000-8000-000000000019",
    name: "create_spreadsheet",
    displayName: "Spreadsheet",
    description:
      "Create a clean printable table with insights and CSV export text.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Data",
    inputSchema: spreadsheetInputSchema,
    execute: createSpreadsheetArtifact,
  },
  {
    id: "00000000-0000-4000-8000-000000000020",
    name: "create_meeting_brief",
    displayName: "Meeting brief",
    description:
      "Turn meeting context into an agenda, decisions, and action-item brief.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Work",
    inputSchema: meetingBriefInputSchema,
    execute: createMeetingBriefArtifact,
  },
  {
    id: "00000000-0000-4000-8000-000000000021",
    name: "create_action_plan",
    displayName: "Action plan",
    description:
      "Create a phased project plan with owners, deadlines, and risks.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Work",
    inputSchema: actionPlanInputSchema,
    execute: createActionPlanArtifact,
  },
  {
    id: "00000000-0000-4000-8000-000000000022",
    name: "create_decision_matrix",
    displayName: "Decision matrix",
    description:
      "Compare options with weighted criteria and a clear recommendation.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Work",
    inputSchema: decisionMatrixInputSchema,
    execute: createDecisionMatrixArtifact,
  },
  {
    id: "00000000-0000-4000-8000-000000000023",
    name: "create_email_pack",
    displayName: "Email pack",
    description:
      "Draft polished business emails, follow-ups, announcements, and outreach variants.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Write",
    inputSchema: emailPackInputSchema,
    execute: createEmailPackArtifact,
  },
  {
    id: "00000000-0000-4000-8000-000000000024",
    name: "create_project_status_report",
    displayName: "Project status report",
    description:
      "Create executive-ready project updates with status, metrics, blockers, decisions, and next actions.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Work",
    inputSchema: projectStatusReportInputSchema,
    execute: createProjectStatusReportArtifact,
  },
  {
    id: "00000000-0000-4000-8000-000000000025",
    name: "create_risk_register",
    displayName: "Risk register",
    description:
      "Create a structured risk register with likelihood, impact, owners, mitigations, and contingency plans.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Work",
    inputSchema: riskRegisterInputSchema,
    execute: createRiskRegisterArtifact,
  },
  {
    id: "00000000-0000-4000-8000-000000000026",
    name: "create_raci_matrix",
    displayName: "RACI matrix",
    description:
      "Create a responsibility matrix that clarifies who is responsible, accountable, consulted, and informed.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Work",
    inputSchema: raciMatrixInputSchema,
    execute: createRaciMatrixArtifact,
  },
  {
    id: "00000000-0000-4000-8000-000000000027",
    name: "create_customer_account_plan",
    displayName: "Customer account plan",
    description:
      "Create a strategic account plan with stakeholders, opportunities, risks, and a mutual action plan.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Work",
    inputSchema: customerAccountPlanInputSchema,
    execute: createCustomerAccountPlanArtifact,
  },
  {
    id: "00000000-0000-4000-8000-000000000028",
    name: "create_competitive_battlecard",
    displayName: "Competitive battlecard",
    description:
      "Create a sales battlecard with positioning, win themes, landmines, objection handling, and discovery questions.",
    riskLevel: MEDIUM_RISK_LEVEL,
    category: "Work",
    inputSchema: competitiveBattlecardInputSchema,
    execute: createCompetitiveBattlecardArtifact,
  },
  {
    id: "00000000-0000-4000-8000-000000000006",
    name: "random_number",
    displayName: "Random number",
    description: "Generate one or more random numbers in a range.",
    riskLevel: "low",
    category: "Think",
    inputSchema: randomNumberInputSchema,
    execute: randomNumbers,
  },
  {
    id: "00000000-0000-4000-8000-000000000007",
    name: "uuid_generator",
    displayName: "UUID generator",
    description: "Generate UUIDs for IDs, examples, and test data.",
    riskLevel: "low",
    category: "Create",
    inputSchema: uuidGeneratorInputSchema,
    execute: ({ count }) => {
      const values = Array.from({ length: count }, () => randomUUID());
      return { values, value: values[0] };
    },
  },
  {
    id: "00000000-0000-4000-8000-000000000008",
    name: "date_math",
    displayName: "Date math",
    description: "Add, subtract, or compare dates.",
    riskLevel: "low",
    category: "Time",
    inputSchema: dateMathInputSchema,
    execute: dateMath,
  },
  {
    id: "00000000-0000-4000-8000-000000000009",
    name: "json_tool",
    displayName: "JSON helper",
    description: "Validate, format, minify, or inspect JSON.",
    riskLevel: "low",
    category: "Code",
    inputSchema: jsonToolInputSchema,
    execute: jsonTool,
  },
  {
    id: "00000000-0000-4000-8000-000000000010",
    name: "text_stats",
    displayName: "Text stats",
    description: "Count words, characters, lines, and reading time.",
    riskLevel: "low",
    category: "Write",
    inputSchema: textStatsInputSchema,
    execute: textStats,
  },
  {
    id: "00000000-0000-4000-8000-000000000011",
    name: "base64_tool",
    displayName: "Base64",
    description: "Encode or decode Base64 text.",
    riskLevel: "low",
    category: "Code",
    inputSchema: base64ToolInputSchema,
    execute: base64Tool,
  },
  {
    id: "00000000-0000-4000-8000-000000000012",
    name: "hash_text",
    displayName: "Hash text",
    description: "Create SHA-256, SHA-1, or MD5 hashes.",
    riskLevel: "low",
    category: "Code",
    inputSchema: hashTextInputSchema,
    execute: ({ text, algorithm }) => ({
      algorithm,
      hash: createHash(algorithm).update(text).digest("hex"),
    }),
  },
  {
    id: "00000000-0000-4000-8000-000000000013",
    name: "unit_converter",
    displayName: "Unit converter",
    description: "Convert length, weight, data, and temperature units.",
    riskLevel: "low",
    category: "Think",
    inputSchema: unitConverterInputSchema,
    execute: unitConverter,
  },
  {
    id: "00000000-0000-4000-8000-000000000014",
    name: "slugify_text",
    displayName: "Slugify text",
    description: "Turn text into clean URL/file slugs.",
    riskLevel: "low",
    category: "Write",
    inputSchema: slugifyTextInputSchema,
    execute: slugifyText,
  },
  {
    id: "00000000-0000-4000-8000-000000000015",
    name: "color_converter",
    displayName: "Color converter",
    description: "Convert hex colors to RGB and HSL.",
    riskLevel: "low",
    category: "Design",
    inputSchema: colorConverterInputSchema,
    execute: colorConverter,
  },
  {
    id: "00000000-0000-4000-8000-000000000016",
    name: "markdown_table",
    displayName: "Markdown table",
    description: "Create a clean Markdown table from columns and rows.",
    riskLevel: "low",
    category: "Write",
    inputSchema: markdownTableInputSchema,
    execute: markdownTable,
  },
] satisfies BuiltInToolDefinition[];

export function listBuiltInTools() {
  return builtInTools.map((tool) => ({
    id: tool.id,
    name: tool.name,
    displayName: tool.displayName,
    description: tool.description,
    riskLevel: tool.riskLevel,
    category: tool.category,
    inputSchemaJson: toolToJsonSchema(tool.id),
    requiresApprovalByDefault: requiresApproval(tool.riskLevel),
  }));
}

export function getBuiltInTool(toolId: string) {
  return builtInTools.find((tool) => tool.id === toolId) ?? null;
}

export function getBuiltInToolByName(name: string) {
  return builtInTools.find((tool) => tool.name === name) ?? null;
}

export function requiresApproval(
  riskLevel: ToolRiskLevel | string | null | undefined,
) {
  return riskLevel === "high" || riskLevel === "critical";
}

export function toolToJsonSchema(toolId: string) {
  const tool = getBuiltInTool(toolId);
  return tool ? builtInToolInputSchemaJson(tool.name) : null;
}
