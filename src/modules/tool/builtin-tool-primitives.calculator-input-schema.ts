import { z } from "zod";

export const calculatorInputSchema = z.object({
  expression: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[0-9+\-*/(). %]+$/, "Only arithmetic characters are allowed"),
});

export const currentTimeInputSchema = z.object({
  timezone: z.string().min(1).max(64).default("UTC"),
});

export const httpFetchInputSchema = z.object({
  url: z.url(),
  method: z.enum(["GET", "HEAD"]).default("GET"),
});

export const webSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(512),
  limit: z.number().int().min(1).max(10).default(5),
  language: z.string().trim().min(2).max(16).optional(),
});

export const htmlArtifactInputSchema = z.object({
  title: z.string().trim().min(1).max(120).default("Interactive preview"),
  html: z.string().min(1).max(24_000),
  css: z.string().max(24_000).default(""),
  js: z.string().max(24_000).default(""),
  height: z.number().int().min(160).max(900).default(420),
});

export const imageGenerationInputSchema = z.object({
  prompt: z.string().trim().min(1).max(4_000),
  size: z
    .string()
    .regex(/^\d{2,5}x\d{2,5}$/)
    .optional(),
});

function runtimeLimitedString(
  maxChars: number,
  label: string,
  options: { min?: number; trim?: boolean } = {},
) {
  let schema = options.trim ? z.string().trim() : z.string();
  if (options.min !== undefined) schema = schema.min(options.min);
  return schema.superRefine((value, ctx) => {
    if (value.length <= maxChars) return;
    ctx.addIssue({
      code: "custom",
      message: `${label} must be at most ${maxChars.toLocaleString()} characters.`,
    });
  });
}

export const codeSandboxInputSchema = z.object({
  language: z.enum(["python", "node", "bash"]),
  code: runtimeLimitedString(100_000, "Code", { min: 1, trim: true }),
  showToUser: z
    .boolean()
    .default(false)
    .describe(
      "Set true only when showing the sandbox result, logs, or generated files directly in chat helps the user. Leave false for internal checks and intermediate work so the completed execution stays in the collapsed tool trace. Code is shown live while being written.",
    ),
  stdin: runtimeLimitedString(100_000, "Standard input").optional(),
  files: z
    .array(
      z.object({
        path: z.string().trim().min(1).max(260),
        content: runtimeLimitedString(200_000, "Input file content"),
      }),
    )
    .max(25)
    .default([]),
  attachments: z
    .array(
      z.object({
        id: z.uuid(),
        path: z.string().trim().min(1).max(260).optional(),
        includeExtractedText: z.boolean().default(true),
      }),
    )
    .max(8)
    .default([]),
  timeoutMs: z.number().int().min(250).max(120_000).default(15_000),
});

export const codeWorkspaceCreateInputSchema = z.object({
  title: z.string().trim().min(1).max(120).default("Code workspace"),
  rootFile: z.string().trim().min(1).max(260).optional(),
  files: z
    .array(
      z.object({
        path: z.string().trim().min(1).max(260),
        content: runtimeLimitedString(1_000_000, "File content").optional(),
      }),
    )
    .min(1)
    .max(500),
});

export const codeWorkspaceProjectInputSchema = z.object({
  projectId: z.uuid(),
});

export const codeWorkspaceReadFileInputSchema = z.object({
  projectId: z.uuid(),
  path: z.string().trim().min(1).max(260),
});

export const codeWorkspaceWriteFileInputSchema = z
  .object({
    projectId: z.uuid(),
    path: z.string().trim().min(1).max(260),
    content: runtimeLimitedString(1_000_000, "File content").optional(),
    attachmentId: z.uuid().optional(),
  })
  .superRefine((value, context) => {
    if ((value.content === undefined) === (value.attachmentId === undefined)) {
      context.addIssue({
        code: "custom",
        message: "Provide exactly one of content or attachmentId.",
      });
    }
  });

export const codeWorkspaceReplaceTextInputSchema = z.object({
  projectId: z.uuid(),
  path: z.string().trim().min(1).max(260),
  oldText: runtimeLimitedString(200_000, "Text to replace", { min: 1 }),
  newText: runtimeLimitedString(200_000, "Replacement text"),
  replaceAll: z.boolean().default(false),
});

export const githubPublishStatusInputSchema = z.object({});

export const githubPublishCodeWorkspaceInputSchema = z.object({
  projectId: z.uuid(),
  repositoryId: z.uuid(),
  mode: z.enum(["pull_request", "direct_push"]),
  targetBranch: z.string().trim().min(1).max(255),
  sourceBranch: z.string().trim().min(1).max(255).optional(),
  targetDirectory: z.string().trim().max(260).optional(),
  commitMessage: z.string().trim().min(1).max(240),
  pullRequestTitle: z.string().trim().min(1).max(240).optional(),
  pullRequestBody: z.string().trim().max(4000).optional(),
  confirmDirectPush: z.boolean().default(false),
});

export const randomNumberInputSchema = z.object({
  min: z.number().default(0),
  max: z.number().default(100),
  count: z.number().int().min(1).max(100).default(1),
  integer: z.boolean().default(true),
});

export const uuidGeneratorInputSchema = z.object({
  count: z.number().int().min(1).max(50).default(1),
});

export const dateMathInputSchema = z.object({
  operation: z.enum(["add", "subtract", "difference"]),
  date: z.string().trim().min(1).max(64),
  endDate: z.string().trim().min(1).max(64).optional(),
  amount: z.number().int().min(0).max(100_000).default(0),
  unit: z.enum(["days", "weeks", "months", "years"]).default("days"),
});

export const jsonToolInputSchema = z.object({
  action: z.enum(["validate", "format", "minify", "inspect"]).default("format"),
  json: runtimeLimitedString(100_000, "JSON", { min: 1 }),
});

export const textStatsInputSchema = z.object({
  text: runtimeLimitedString(100_000, "Text"),
  wordsPerMinute: z.number().int().min(80).max(500).default(200),
});

export const base64ToolInputSchema = z.object({
  action: z.enum(["encode", "decode"]),
  value: runtimeLimitedString(100_000, "Value"),
});

export const hashTextInputSchema = z.object({
  text: runtimeLimitedString(100_000, "Text"),
  algorithm: z.enum(["sha256", "sha1", "md5"]).default("sha256"),
});
