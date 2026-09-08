import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createStarterDefinition } from "@/modules/workflows/contracts";
import { parseResourcePackage } from "@/modules/resource-package/schema";
import { describeResourcePackage } from "@/modules/resource-package/summary";
import { sanitizeResourcePackageManifest } from "@/modules/resource-package/sanitize";
import { sanitizeWorkflowDefinition } from "@/modules/resource-package/workflow-sanitizer";
import type { WorkflowResourceManifest } from "@/modules/resource-package/types";

function workflowPackage() {
  const definition = createStarterDefinition();
  const ref = randomUUID();
  definition.nodes.push({
    ...definition.nodes[0],
    id: "agent",
    label: "Review",
    type: "agent.run",
    parameters: { agentId: ref, prompt: "Review the input" },
  });
  definition.edges = [{ id: "start", source: "trigger", target: "agent" }];
  const manifest: WorkflowResourceManifest = {
    type: "workflow",
    name: "Review documents",
    definition,
    agentBindings: [
      { ref, manifest: { type: "agent", name: "Reviewer", agent: {} } },
    ],
    requiresCredentials: false,
  };
  return {
    format: "maiah.resource" as const,
    schemaVersion: 1 as const,
    manifest,
  };
}

describe("workflow JSON packages", () => {
  it("preserves the graph and non-secret configuration while removing URL credentials, authorization and encrypted-history references", () => {
    const definition = createStarterDefinition();
    const reference = `__WORKFLOW_SECRET:${randomUUID()}:api_key__`;
    definition.defaultInput = {
      labels: ["customer", "proposal"],
      nested: { apiKey: "do-not-transfer", project: "demo" },
    };
    definition.nodes.push({
      ...definition.nodes[0],
      id: "request",
      label: "Send",
      type: "http.request",
      parameters: {
        url: "https://user:password@example.test/upload?api_key=private&format=json",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer private",
          "X-API-Key": "private",
        },
        body: { message: "Hello", secureInput: reference },
      },
    });
    const result = sanitizeWorkflowDefinition(definition);
    expect(result.requiresCredentials).toBe(true);
    expect(result.definition.nodes[1].parameters).toEqual({
      url: "https://example.test/upload?format=json",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { message: "Hello", secureInput: "[CONFIGURE_CREDENTIAL]" },
    });
    expect(result.definition.defaultInput).toEqual({
      labels: ["customer", "proposal"],
      nested: { project: "demo" },
    });
    expect(JSON.stringify(result.definition)).not.toContain("private");
    expect(JSON.stringify(result.definition)).not.toContain(reference);
    expect(definition.nodes[1].parameters.headers).toHaveProperty(
      "Authorization",
    );
  });

  it("keeps code and non-secret node settings byte-for-byte and flags sanitized dependency credentials", () => {
    const value = workflowPackage();
    const code = "return { text: input.text.trim(), value: 42 };";
    value.manifest.definition.nodes.push({
      ...value.manifest.definition.nodes[0],
      id: "code",
      type: "code.execute",
      parameters: { language: "node", code },
    });
    value.manifest.agentBindings[0].manifest.bundledResources = {
      skills: [],
      customTools: [],
      mcpPresets: [
        {
          type: "mcp_preset",
          name: "Service",
          preset: {
            scope: "server",
            serverName: "Service",
            transport: "sse",
            enabled: true,
            requireApproval: true,
            requiresCredentials: false,
            url: "https://example.test/mcp?token=private",
            tools: [],
          },
        },
      ],
    };
    const sanitized = sanitizeResourcePackageManifest(
      parseResourcePackage(value).manifest,
    );
    expect(sanitized.type).toBe("workflow");
    if (sanitized.type !== "workflow") return;
    expect(sanitized.definition.nodes[2].parameters.code).toBe(code);
    expect(sanitized.definition.nodes[2].settings).toEqual(
      value.manifest.definition.nodes[2].settings,
    );
    expect(
      describeResourcePackage({ ...value, manifest: sanitized })
        .requiresCredentials,
    ).toBe(true);
    expect(JSON.stringify(sanitized)).not.toContain("private");
  });

  it("rejects missing, unused and duplicate assistant dependencies and workflow cycles", () => {
    for (const change of [
      (value: ReturnType<typeof workflowPackage>) => {
        value.manifest.agentBindings = [];
      },
      (value: ReturnType<typeof workflowPackage>) => {
        value.manifest.agentBindings[0].ref = randomUUID();
      },
      (value: ReturnType<typeof workflowPackage>) => {
        value.manifest.agentBindings.push(
          structuredClone(value.manifest.agentBindings[0]),
        );
      },
      (value: ReturnType<typeof workflowPackage>) => {
        value.manifest.definition.edges.push({
          id: "cycle",
          source: "agent",
          target: "trigger",
        });
      },
    ]) {
      const value = workflowPackage();
      change(value);
      expect(() =>
        describeResourcePackage(parseResourcePackage(value)),
      ).toThrow();
    }
  });

  it("validates the definition and rejects unknown executable node types and prototype keys before import", () => {
    const value = workflowPackage();
    expect(() =>
      parseResourcePackage({
        ...value,
        manifest: {
          ...value.manifest,
          definition: {
            ...value.manifest.definition,
            nodes: [
              { ...value.manifest.definition.nodes[0], type: "shell.unsafe" },
            ],
          },
        },
      }),
    ).toThrow(/Invalid resource package/);
    const unsafe = JSON.parse(
      JSON.stringify(value).replace(
        '"parameters":{}',
        '"parameters":{"__proto__":{"polluted":true}}',
      ),
    );
    expect(() => parseResourcePackage(unsafe)).toThrow(
      /Invalid package property/,
    );
    expect(Object.prototype).not.toHaveProperty("polluted");
  });
});
