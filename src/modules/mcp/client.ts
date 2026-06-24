import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  CallToolResultSchema,
  ListToolsResultSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { decryptValue } from "@/lib/crypto";
import type { McpTransport } from "@/modules/mcp/use-cases";
import type { mcpServers } from "@/server/infrastructure/db/schema";

type McpServerRow = typeof mcpServers.$inferSelect;

const CONNECT_TIMEOUT_MS = 15_000;

async function buildAuthHeaders(
  server: McpServerRow,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (!server.encryptedHeadersJson) return headers;

  const encrypted = server.encryptedHeadersJson as Record<string, string>;
  for (const [key, value] of Object.entries(encrypted)) {
    headers[key] = await decryptValue(value);
  }
  return headers;
}

function createTransport(
  url: URL,
  transport: McpTransport,
  headers: Record<string, string>,
): Transport {
  const requestInit: RequestInit = { headers };

  if (transport === "sse") {
    return new SSEClientTransport(url, { requestInit });
  }

  return new StreamableHTTPClientTransport(url, { requestInit });
}

async function connectClient(
  server: McpServerRow,
): Promise<{ client: Client; transport: Transport }> {
  if (!server.url) throw new Error("MCP server URL is not configured");

  const url = new URL(server.url);
  const headers = await buildAuthHeaders(server);
  const client = new Client({ name: "ai-hub", version: "0.1.0" });

  const primaryTransport = createTransport(url, server.transport, headers);
  const fallbackTransport =
    server.transport === "streamable-http"
      ? createTransport(url, "sse", headers)
      : null;

  let lastError: unknown;
  for (const transport of [primaryTransport, fallbackTransport].filter(
    Boolean,
  ) as Transport[]) {
    try {
      await Promise.race([
        client.connect(transport),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("MCP connection timed out")),
            CONNECT_TIMEOUT_MS,
          ),
        ),
      ]);
      return { client, transport };
    } catch (error) {
      lastError = error;
      try {
        await transport.close();
      } catch {
        // ignore cleanup errors while probing transports
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to connect to MCP server");
}

async function withMcpClient<T>(
  server: McpServerRow,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const { client, transport } = await connectClient(server);
  try {
    return await fn(client);
  } finally {
    await transport.close().catch(() => undefined);
  }
}

export async function listRemoteMcpTools(
  server: McpServerRow,
): Promise<Tool[]> {
  return withMcpClient(server, async (client) => {
    const result = await client.request(
      { method: "tools/list", params: {} },
      ListToolsResultSchema,
    );
    return result.tools;
  });
}

export async function callRemoteMcpTool(
  server: McpServerRow,
  toolName: string,
  toolInput: unknown,
): Promise<CallToolResult> {
  return withMcpClient(server, async (client) =>
    client.request(
      {
        method: "tools/call",
        params: {
          name: toolName,
          arguments:
            toolInput && typeof toolInput === "object"
              ? (toolInput as Record<string, unknown>)
              : {},
        },
      },
      CallToolResultSchema,
    ),
  );
}
