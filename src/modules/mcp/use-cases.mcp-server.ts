import { decryptValue, encryptValue } from "@/lib/crypto";
import type { ResourceAccessScope } from "@/modules/iam/resource-access-scope";
import { inferMcpAuthHint } from "@/modules/mcp/auth-hint";
import { authorization } from "@/server/domain/services/authorization";
import { mcpServers } from "@/server/infrastructure/db/schema";

export type McpServer = typeof mcpServers.$inferSelect;

type McpTransport = McpServer["transport"];

export type DiscoveredMcpTool = {
  name: string;
  description: string | null;
  inputSchemaJson: Record<string, unknown> | null;
  outputSchemaJson: Record<string, unknown> | null;
  requireApproval: boolean;
};

export interface CreateMcpServerInput {
  workspaceId: string;
  userId: string;
  name: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  url?: string;
  requireApproval?: boolean;
  isGlobal?: boolean;
  accessScope?: ResourceAccessScope;
  accessTeamId?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

export interface UpdateMcpServerInput {
  serverId: string;
  workspaceId: string;
  userId: string;
  canManageGlobal?: boolean;
  name?: string;
  transport?: McpTransport;
  url?: string;
  command?: string;
  args?: string[];
  enabled?: boolean;
  requireApproval?: boolean;
  isGlobal?: boolean;
  accessScope?: ResourceAccessScope;
  accessTeamId?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

export type McpToolDiscoveryResult = {
  status: "healthy" | "unhealthy" | "manual";
  discovered: number;
};

export function hasMcpConnectionChanges(input: UpdateMcpServerInput) {
  return (
    input.transport !== undefined ||
    input.url !== undefined ||
    input.command !== undefined ||
    input.args !== undefined ||
    input.headers !== undefined ||
    input.env !== undefined
  );
}

export function toSafeMcpServer(
  server: McpServer,
  includeConnectionDetails = true,
) {
  return {
    id: server.id,
    workspaceId: server.workspaceId,
    name: server.name,
    transport: server.transport,
    command: includeConnectionDetails ? server.command : null,
    argsJson: includeConnectionDetails ? server.argsJson : null,
    url: includeConnectionDetails ? server.url : null,
    enabled: server.enabled,
    requireApproval: server.requireApproval,
    isGlobal: server.isGlobal,
    visibility: server.visibility,
    createdById: server.createdById,
    healthStatus: server.healthStatus,
    lastCheckedAt: server.lastCheckedAt,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
    hasHeaders: Boolean(server.encryptedHeadersJson),
    hasEnv: Boolean(server.encryptedEnvJson),
  };
}

export function toMcpServerForEdit(server: McpServer) {
  return {
    ...toSafeMcpServer(server),
    authHint: inferMcpAuthHint(server),
  };
}

export async function encryptRecord(record?: Record<string, string>) {
  if (!record || Object.keys(record).length === 0) return null;
  const encrypted: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    encrypted[key] = await encryptValue(value);
  }
  return encrypted;
}

async function decryptRecord(
  encrypted?: Record<string, string> | null,
): Promise<Record<string, string>> {
  if (!encrypted) return {};
  const decrypted: Record<string, string> = {};
  for (const [key, value] of Object.entries(encrypted)) {
    decrypted[key] = await decryptValue(value);
  }
  return decrypted;
}

export async function mergeEncryptedRecord(
  existing: Record<string, string> | null | undefined,
  incoming: Record<string, string>,
) {
  const merged = await decryptRecord(existing ?? null);
  for (const [key, value] of Object.entries(incoming)) {
    if (value.trim()) {
      merged[key] = value;
    }
  }
  return encryptRecord(merged);
}

export function validateTransportConfig(
  transport: McpTransport,
  url: string | null,
  command: string | null,
) {
  if (transport === "stdio" && !command?.trim()) {
    throw new Error("Command is required for stdio transport");
  }
  if (
    (transport === "sse" || transport === "streamable-http") &&
    !url?.trim()
  ) {
    throw new Error("URL is required for remote transport");
  }
}

export function canManageMcpServer(
  server: McpServer,
  userId: string,
  canManageGlobal = false,
) {
  return server.createdById === userId || (server.isGlobal && canManageGlobal);
}

export async function assertCanManageMcpServer(
  server: McpServer,
  userId: string,
  canManageGlobal = false,
) {
  if (
    !canManageMcpServer(server, userId, canManageGlobal) &&
    !(await authorization.hasDirectPermission(
      { principalType: "user", principalId: userId },
      "mcpServers.manage",
      "mcp_server",
      server.id,
      server.workspaceId,
    ))
  ) {
    throw new Error("MCP server not found");
  }
}
