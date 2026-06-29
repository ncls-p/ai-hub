import {
	createMCPClient,
	mcpAppClientCapabilities,
	type MCPClient,
} from "@ai-sdk/mcp";

import { decryptValue } from "@/lib/crypto";
import type { mcpServers } from "@/server/infrastructure/db/schema";

type McpServerRow = typeof mcpServers.$inferSelect;

type AiSdkMcpTransport = "sse" | "http";

async function decryptHeaders(
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

function toAiSdkMcpTransport(server: McpServerRow): AiSdkMcpTransport {
	if (server.transport === "sse") return "sse";
	if (server.transport === "streamable-http") return "http";
	throw new Error("AI SDK MCP client only supports remote SSE/HTTP servers");
}

/**
 * AI SDK 7 MCP client bridge for remote MCP servers. The existing MCP module is
 * still used for DB persistence/discovery; this helper exposes the same server
 * rows through `@ai-sdk/mcp` so agents can consume MCP tools as native AI SDK
 * ToolSets where useful.
 */
export async function createAiSdkMcpClientForServer(
	server: McpServerRow,
): Promise<MCPClient> {
	if (!server.url) throw new Error("MCP server URL is not configured");
	return createMCPClient({
		transport: {
			type: toAiSdkMcpTransport(server),
			url: server.url,
			headers: await decryptHeaders(server),
			redirect: "error",
		},
		clientName: "ai-hub",
		version: "0.1.0",
		capabilities: mcpAppClientCapabilities,
	});
}

export async function withAiSdkMcpClient<T>(
	server: McpServerRow,
	fn: (client: MCPClient) => Promise<T>,
) {
	const client = await createAiSdkMcpClientForServer(server);
	try {
		return await fn(client);
	} finally {
		await client.close().catch(() => undefined);
	}
}
