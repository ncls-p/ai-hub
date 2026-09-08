import { describe, expect, it } from "vitest";
import {
  parseResourcePackage,
  MAX_PACKAGE_BYTES,
  type ResourcePackage,
} from "@/modules/resource-package/schema";
import { describeResourcePackage } from "@/modules/resource-package/summary";
import { sanitizePortableConnection } from "@/modules/marketplace/portable-connection";

const skill = {
  type: "skill" as const,
  name: "Review",
  skill: {
    markdownFiles: [
      { path: "SKILL.md", content: "# Review\nCheck invariants." },
    ],
  },
};
const wrap = (manifest: unknown) => ({
  format: "maiah.resource",
  schemaVersion: 1,
  manifest,
});

describe("portable resource package validation", () => {
  it("preserves Unicode files and complete agent settings", () => {
    const manifest = {
      type: "agent",
      name: "Relecteur français",
      agent: {
        systemPrompt: "Évalue le code.",
        maxToolCalls: 0,
        maxOutputTokens: 1024,
        generationSettings: { reasoning: { effort: "high" } },
        responseFormat: { type: "json_object" },
      },
      skillBindings: [{ ref: skill.name, bundled: skill.skill }],
    };
    expect(parseResourcePackage(wrap(manifest)).manifest).toEqual(manifest);
  });

  it.each([
    {},
    { ...wrap(skill), schemaVersion: 2 },
    { ...wrap(skill), format: "foreign" },
    wrap({ ...skill, workspaceId: "foreign" }),
    wrap({ ...skill, permissions: ["*"] }),
    wrap({ type: "agent", name: "Empty" }),
    wrap({ ...skill, skill: { markdownFiles: [] } }),
    wrap({
      type: "mcp_preset",
      name: "Invalid",
      preset: { transport: "http" },
    }),
    wrap({ type: "agent", name: "Invalid", agent: { maxToolCalls: -1 } }),
  ])("rejects unsupported or structurally invalid input %#", (value) => {
    expect(() => parseResourcePackage(value)).toThrow(
      /Invalid resource package/,
    );
  });

  it.each([
    "../outside.md",
    "/absolute.md",
    "a/../../b",
    "C:\\secret",
    "a\\b",
    "a//b",
    "a/./b",
    "bad\0.md",
  ])("rejects unsafe skill paths: %s", (path) => {
    expect(() =>
      parseResourcePackage(
        wrap({
          ...skill,
          skill: { markdownFiles: [{ path, content: "text" }] },
        }),
      ),
    ).toThrow();
  });

  it("rejects duplicate paths, excessive bytes, deeply nested metadata and prototype keys", () => {
    expect(() =>
      parseResourcePackage(
        wrap({
          ...skill,
          skill: {
            markdownFiles: [
              skill.skill.markdownFiles[0],
              skill.skill.markdownFiles[0],
            ],
          },
        }),
      ),
    ).toThrow(/Duplicate/);
    expect(() =>
      parseResourcePackage(
        wrap({ ...skill, description: "é".repeat(MAX_PACKAGE_BYTES / 2) }),
      ),
    ).toThrow(/10 MB/);
    let nested: unknown = {};
    for (let index = 0; index < 70; index++) nested = { nested };
    expect(() => parseResourcePackage(nested)).toThrow(/complex/);
    expect(() =>
      parseResourcePackage(JSON.parse('{"__proto__":{"polluted":true}}')),
    ).toThrow(/property/);
    expect(Object.prototype).not.toHaveProperty("polluted");
  });
});

describe("package dependency preview", () => {
  it("lists nested specialists, bundled skills and external requirements", () => {
    const resourcePackage = parseResourcePackage(
      wrap({
        type: "agent",
        name: "Coordinator",
        kind: "orchestrator",
        agent: {},
        specialists: [
          {
            manifest: {
              type: "agent",
              name: "Reviewer",
              agent: { providerName: "Local", modelName: "Model" },
              skillBindings: [{ ref: skill.name, bundled: skill.skill }],
              knowledgeBindings: [{ name: "Handbook" }],
            },
          },
        ],
      }),
    );
    expect(describeResourcePackage(resourcePackage)).toEqual({
      name: "Coordinator",
      requiresCredentials: false,
      resources: [
        { type: "agent", name: "Coordinator" },
        { type: "agent", name: "Reviewer" },
        { type: "skill", name: "Review" },
      ],
      knowledge: ["Handbook"],
      models: ["Local / Model"],
    });
  });

  it("rejects missing and ambiguous dependencies instead of silently dropping bindings", () => {
    for (const bindings of [
      { skillBindings: [{ ref: "Missing" }] },
      {
        toolBindings: [
          { source: "mcp", ref: "Missing/tool", requireApproval: true },
        ],
      },
      {
        toolBindings: [
          { source: "custom", ref: "Missing", requireApproval: true },
        ],
      },
      { skillBindings: [{ ref: "Review" }, { ref: "Review" }] },
      {
        bundledResources: {
          skills: [
            { name: "Review", skill: skill.skill },
            { name: "Review", skill: skill.skill },
          ],
          mcpPresets: [],
          customTools: [],
        },
      },
    ]) {
      expect(() =>
        describeResourcePackage(
          parseResourcePackage(
            wrap({ type: "agent", name: "Agent", agent: {}, ...bindings }),
          ),
        ),
      ).toThrow(/Missing|duplicate/);
    }
  });

  it("rejects assistant delegation and oversized resource graphs", () => {
    const child = { type: "agent" as const, name: "Child", agent: {} };
    expect(() =>
      describeResourcePackage(
        parseResourcePackage(
          wrap({ ...child, specialists: [{ manifest: child }] }),
        ),
      ),
    ).toThrow(/orchestrators/);
    const root: ResourcePackage = {
      format: "maiah.resource",
      schemaVersion: 1,
      manifest: {
        ...child,
        kind: "orchestrator",
        specialists: Array.from({ length: 256 }, () => ({ manifest: child })),
      },
    };
    expect(() => describeResourcePackage(root)).toThrow(/256/);
  });
});

describe("portable connection redaction", () => {
  it("removes URL userinfo and sensitive query values while retaining routing parameters", () => {
    const result = sanitizePortableConnection({
      url: "https://alice:password@example.test/mcp?api_key=secret&tenant=demo&accessToken=other",
    });
    expect(result).toEqual({
      url: "https://example.test/mcp?tenant=demo",
      args: undefined,
      redacted: true,
    });
  });
  it("redacts split flags, inline flags, environment assignments and authorization headers", () => {
    const result = sanitizePortableConnection({
      args: [
        "-y",
        "mcp-server",
        "--token",
        "secret1",
        "--api-key=secret2",
        "ACCESS_TOKEN=secret3",
        "-H",
        "Authorization: Bearer secret4",
        "--port",
        "8080",
      ],
    });
    expect(result.args).toEqual([
      "-y",
      "mcp-server",
      "--token",
      "[REDACTED]",
      "--api-key=[REDACTED]",
      "ACCESS_TOKEN=[REDACTED]",
      "-H",
      "Authorization: [REDACTED]",
      "--port",
      "8080",
    ]);
    expect(result.redacted).toBe(true);
  });
  it("preserves credential-free endpoints and arguments", () => {
    expect(
      sanitizePortableConnection({
        url: "https://example.test/mcp",
        args: ["-y", "server"],
      }),
    ).toEqual({
      url: "https://example.test/mcp",
      args: ["-y", "server"],
      redacted: false,
    });
  });
});
