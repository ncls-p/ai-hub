import { describe, expect, it } from "vitest";
import {
  sanitizeMarketplaceManifest,
  containsMarketplaceSecretMaterial,
} from "@/modules/marketplace/manifest-sanitizer";
import { describeResourcePackage } from "@/modules/resource-package/summary";
import { parseResourcePackage } from "@/modules/resource-package/schema";
import { publicFilePart } from "@/modules/chat/public-conversation-sharing";

describe("portable schema and public file projections", () => {
  it("redacts credentials in positional and named endpoint arguments and flags the connection for setup", () => {
    const manifest = sanitizeMarketplaceManifest({
      type: "mcp_preset",
      name: "Endpoint arguments",
      preset: {
        transport: "stdio",
        args: [
          "https://name:secret@example.test/mcp?token=secret&region=eu",
          "--url=https://example.test/mcp?api_key=secret",
          "--timeout=30",
        ],
      },
    });
    expect(manifest).toMatchObject({
      preset: {
        args: [
          "https://example.test/mcp?region=eu",
          "--url=https://example.test/mcp",
          "--timeout=30",
        ],
        requiresCredentials: true,
      },
    });
    expect(
      sanitizeMarketplaceManifest({
        type: "custom_tool",
        name: "Workflow",
        tool: { n8nWorkflowUrl: "https://example.test/hook?token=secret" },
      }),
    ).toMatchObject({
      tool: {
        n8nWorkflowUrl: "https://example.test/hook",
        requiresCredentials: true,
      },
    });
  });
  it("preserves schema property definitions while removing actual credential defaults and stored secrets", () => {
    const inputSchema = {
      type: "object",
      properties: {
        password: {
          type: "string",
          description: "Account password",
          default: "secret-default",
          examples: ["secret-example"],
        },
        headers: {
          type: "object",
          properties: {
            authorization: { type: "string", const: "secret-const" },
          },
        },
        query: { type: "string", default: "unchanged" },
      },
      required: ["password"],
      additionalProperties: false,
    };
    const manifest = {
      type: "custom_tool",
      name: "Portable schema",
      tool: {
        inputSchema,
        metadata: { apiKey: "secret-metadata", ordinary: "keep" },
        requiresCredentials: true,
      },
    };
    expect(containsMarketplaceSecretMaterial(manifest)).toBe(true);
    const sanitized = sanitizeMarketplaceManifest(manifest);
    expect(sanitized).toMatchObject({
      tool: {
        inputSchema: {
          properties: {
            password: { type: "string", description: "Account password" },
            headers: {
              type: "object",
              properties: { authorization: { type: "string" } },
            },
            query: { type: "string", default: "unchanged" },
          },
          required: ["password"],
          additionalProperties: false,
        },
        metadata: { ordinary: "keep" },
      },
    });
    expect(JSON.stringify(sanitized)).not.toContain("secret-");
    expect(containsMarketplaceSecretMaterial(sanitized)).toBe(false);
  });

  it("rejects unknown built-in tool IDs during preview", () => {
    const value = parseResourcePackage({
      format: "maiah.resource",
      schemaVersion: 1,
      manifest: {
        type: "agent",
        name: "Invalid built-in",
        agent: {},
        toolBindings: [
          { source: "builtin", ref: "not-a-tool", requireApproval: false },
        ],
      },
    });
    expect(() => describeResourcePackage(value)).toThrow(
      "Unknown built-in tool",
    );
  });

  it("projects only supported public downloads and never propagates stored URLs or metadata", () => {
    const id = "00000000-0000-4000-8000-000000000001",
      shareId = "00000000-0000-4000-8000-000000000002";
    expect(
      publicFilePart(
        JSON.stringify({
          kind: "chat_file",
          id,
          fileName: "résumé.ts",
          url: "https://foreign.test/",
          createdByUserId: "secret",
        }),
        shareId,
      ),
    ).toEqual({
      type: "file",
      content: "résumé.ts",
      downloadUrl: `/api/public/conversations/${shareId}/files/${id}?kind=attachment`,
    });
    expect(
      publicFilePart(
        JSON.stringify({
          kind: "code_workspace_artifact",
          projectId: id,
          title: "Source",
        }),
        shareId,
      ),
    ).toMatchObject({
      content: "Source",
      downloadUrl: expect.stringContaining("kind=code_workspace"),
    });
    for (const content of [
      "{",
      "null",
      "{}",
      '{"kind":"chat_file","id":"bad"}',
      '{"kind":"tool-result"}',
    ])
      expect(publicFilePart(content, shareId)).toBeNull();
  });
});
