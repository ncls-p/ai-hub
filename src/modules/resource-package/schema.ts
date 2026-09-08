import { z } from "zod";
import type { AgentMarketplaceManifest } from "@/modules/marketplace/manifest-types";
import { workflowDefinitionSchema } from "@/modules/workflows/contracts";
import type { ResourcePackageManifest } from "./types";

export const MAX_PACKAGE_BYTES = 10 * 1024 * 1024;
export const MAX_PACKAGE_RESOURCES = 256;
const name = z.string().trim().min(1).max(255);
const text = z.string().max(1_000_000);
const record = z.record(z.string(), z.unknown());
const description = text.optional();
const credential = z.strictObject({
  key: name,
  label: name,
  type: z.string().optional(),
  required: z.boolean().optional(),
  description: text.nullish(),
});
const skillContent = z.strictObject({
  markdownFiles: z
    .array(
      z.strictObject({
        path: z
          .string()
          .min(1)
          .max(260)
          .refine(
            (path) =>
              !path.startsWith("/") &&
              !path.includes("\\") &&
              !path.includes(":") &&
              !path.includes("\0") &&
              path
                .split("/")
                .every(
                  (segment) =>
                    segment !== ".." && segment !== "." && segment !== "",
                ),
            "Skill files must have safe relative paths",
          ),
        content: text,
      }),
    )
    .min(1)
    .max(500)
    .refine(
      (files) => new Set(files.map((file) => file.path)).size === files.length,
      "Duplicate skill file paths",
    ),
  sourcePackage: text.optional(),
  sourceSkillName: text.optional(),
  installCommand: text.optional(),
  metadata: record.optional(),
  fileCount: z.number().int().nonnegative().optional(),
  totalBytes: z.number().int().nonnegative().optional(),
});
const skill = z.strictObject({
  type: z.literal("skill"),
  name,
  description,
  skill: skillContent,
});
const customTool = z.strictObject({
  type: z.literal("custom_tool"),
  name,
  description,
  tool: z.strictObject({
    status: z
      .enum([
        "active",
        "draft",
        "failed",
        "awaiting_secrets",
        "workflow_created",
        "disabled",
      ])
      .optional(),
    inputSchema: record.optional(),
    outputSchema: record.optional(),
    n8nWorkflowId: text.optional(),
    n8nWorkflowUrl: z.url().optional(),
    metadata: record.optional(),
    credentialSchema: z.array(credential).max(100).optional(),
    requiresCredentials: z.boolean().optional(),
  }),
});
const mcp = z.strictObject({
  type: z.literal("mcp_preset"),
  name,
  description,
  preset: z.strictObject({
    scope: z.enum(["server", "tool"]),
    serverName: name,
    transport: z.enum(["stdio", "sse", "streamable-http"]),
    command: text.optional(),
    args: z.array(text).max(256).optional(),
    url: z.url().optional(),
    enabled: z.boolean(),
    requireApproval: z.boolean(),
    healthStatus: text.optional(),
    requiresCredentials: z.boolean(),
    credentialSchema: z.array(credential).max(100).optional(),
    tools: z
      .array(
        z.strictObject({
          name,
          description: text.nullish(),
          inputSchema: record.nullish(),
          outputSchema: record.nullish(),
          requireApproval: z.boolean(),
          enabled: z.boolean(),
        }),
      )
      .max(500),
  }),
});
const agent: z.ZodType<AgentMarketplaceManifest> = z.lazy(() =>
  z.strictObject({
    type: z.literal("agent"),
    name,
    description,
    kind: z.enum(["assistant", "orchestrator"]).optional(),
    agent: z.strictObject({
      systemPrompt: text.nullish(),
      providerId: z.uuid().nullish(),
      modelId: z.uuid().nullish(),
      providerName: text.nullish(),
      modelName: text.nullish(),
      temperature: z.string().max(30).nullish(),
      topP: z.string().max(30).nullish(),
      maxOutputTokens: z.number().int().nonnegative().max(10_000_000).nullish(),
      maxToolCalls: z.number().int().nonnegative().max(10_000).optional(),
      toolChoice: text.nullish(),
      generationSettings: record.nullish(),
      responseFormat: record.nullish(),
      memoryPolicy: record.nullish(),
      guardrails: record.nullish(),
      approvalPolicy: record.nullish(),
      orchestrationPolicy: record.nullish(),
    }),
    specialists: z
      .array(z.strictObject({ instructions: text.nullish(), manifest: agent }))
      .max(64)
      .optional(),
    toolBindings: z
      .array(
        z.strictObject({
          source: z.enum(["builtin", "mcp", "custom"]),
          ref: name,
          label: text.optional(),
          requireApproval: z.boolean(),
          riskLevel: text.nullish(),
        }),
      )
      .max(500)
      .optional(),
    skillBindings: z
      .array(z.strictObject({ ref: name, bundled: skillContent.optional() }))
      .max(256)
      .optional(),
    knowledgeBindings: z
      .array(z.strictObject({ name, description: text.nullish() }))
      .max(256)
      .optional(),
    bundledResources: z
      .strictObject({
        skills: z.array(z.strictObject({ name, skill: skillContent })).max(256),
        mcpPresets: z.array(mcp).max(256),
        customTools: z.array(customTool).max(256),
      })
      .optional(),
  }),
);

export const resourcePackageSchema = z.strictObject({
  format: z.literal("maiah.resource"),
  schemaVersion: z.literal(1),
  manifest: z.union([
    agent,
    skill,
    customTool,
    mcp,
    z.strictObject({
      type: z.literal("workflow"),
      name,
      description,
      definition: workflowDefinitionSchema,
      agentBindings: z
        .array(z.strictObject({ ref: z.uuid(), manifest: agent }))
        .max(100),
      requiresCredentials: z.boolean().default(false),
    }),
  ]),
});
export type ResourcePackage = {
  format: "maiah.resource";
  schemaVersion: 1;
  manifest: ResourcePackageManifest;
};

export class ResourcePackageError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

/** Bound arbitrary metadata before recursive schema parsing or sanitization. */
function assertBoundedJson(value: unknown) {
  const pending = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (++nodes > 100_000 || entry.depth > 64)
      throw new ResourcePackageError("The resource package is too complex");
    if (entry.value && typeof entry.value === "object") {
      for (const [key, child] of Object.entries(entry.value)) {
        if (["__proto__", "constructor", "prototype"].includes(key))
          throw new ResourcePackageError("Invalid package property");
        pending.push({ value: child, depth: entry.depth + 1 });
      }
    }
  }
}

export function parseResourcePackage(value: unknown): ResourcePackage {
  assertBoundedJson(value);
  if (
    Buffer.byteLength(JSON.stringify(value) ?? "", "utf8") > MAX_PACKAGE_BYTES
  )
    throw new ResourcePackageError("The resource package exceeds 10 MB", 413);
  const parsed = resourcePackageSchema.safeParse(value);
  if (!parsed.success)
    throw new ResourcePackageError(
      "Invalid resource package: " +
        parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
    );
  return parsed.data;
}
