import type { McpAuthHint, SimpleAuthMode } from "./types";

export const emptyForm = {
  name: "",
  transport: "streamable-http",
  url: "",
  command: "",
  args: "",
  authMode: "none" as SimpleAuthMode,
  bearerToken: "",
  apiKeyHeader: "X-API-Key",
  apiKeyValue: "",
  envKeyName: "API_KEY",
  envKeyValue: "",
  requireApproval: false,
  headers: "",
  env: "",
};

export type McpServerForm = typeof emptyForm;

function parsePairs(input: string) {
  const rows = input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (rows.length === 0) return undefined;
  const result: Record<string, string> = {};
  for (const row of rows) {
    const idx = row.indexOf("=");
    if (idx === -1) continue;
    const key = row.slice(0, idx).trim();
    const value = row.slice(idx + 1).trim();
    if (key) result[key] = value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function mergeRecords(
  ...records: Array<Record<string, string> | undefined>
): Record<string, string> | undefined {
  const merged: Record<string, string> = {};
  for (const record of records) {
    if (!record) continue;
    Object.assign(merged, record);
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function buildSimpleAuthHeaders(form: McpServerForm) {
  if (form.transport === "stdio") return undefined;
  if (form.authMode === "bearer" && form.bearerToken.trim()) {
    return { Authorization: `Bearer ${form.bearerToken.trim()}` };
  }
  if (
    form.authMode === "api-key" &&
    form.apiKeyHeader.trim() &&
    form.apiKeyValue.trim()
  ) {
    return { [form.apiKeyHeader.trim()]: form.apiKeyValue.trim() };
  }
  return undefined;
}

function buildSimpleAuthEnv(form: McpServerForm) {
  if (
    form.transport === "stdio" &&
    form.authMode === "env" &&
    form.envKeyName.trim() &&
    form.envKeyValue.trim()
  ) {
    return { [form.envKeyName.trim()]: form.envKeyValue.trim() };
  }
  return undefined;
}

export function buildHeaders(form: McpServerForm) {
  return mergeRecords(buildSimpleAuthHeaders(form), parsePairs(form.headers));
}

export function buildEnv(form: McpServerForm) {
  return mergeRecords(buildSimpleAuthEnv(form), parsePairs(form.env));
}

function authModeFromHint(authHint?: McpAuthHint): SimpleAuthMode {
  if (!authHint || authHint.mode === "none") return "none";
  return authHint.mode;
}

export function serverFormFromServer(
  server: {
    name: string;
    transport: string;
    url: string | null;
    command: string | null;
    argsJson?: string[] | null;
    requireApproval: boolean;
  },
  authHint?: McpAuthHint,
): McpServerForm {
  return {
    name: server.name,
    transport: server.transport,
    url: server.url ?? "",
    command: server.command ?? "",
    args: server.argsJson?.join("\n") ?? "",
    authMode: authModeFromHint(authHint),
    bearerToken: "",
    apiKeyHeader: authHint?.apiKeyHeader ?? "X-API-Key",
    apiKeyValue: "",
    envKeyName: authHint?.envKeyName ?? "API_KEY",
    envKeyValue: "",
    requireApproval: server.requireApproval,
    headers: "",
    env: "",
  };
}
