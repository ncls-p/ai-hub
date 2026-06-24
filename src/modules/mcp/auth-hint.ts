type McpAuthHintMode = "none" | "bearer" | "api-key" | "env" | "custom";

export interface McpAuthHint {
  mode: McpAuthHintMode;
  apiKeyHeader?: string;
  envKeyName?: string;
  headerKeys?: string[];
  envKeys?: string[];
}

function getRecordKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>);
}

export function inferMcpAuthHint(server: {
  transport: string;
  encryptedHeadersJson?: unknown;
  encryptedEnvJson?: unknown;
}): McpAuthHint {
  const headerKeys = getRecordKeys(server.encryptedHeadersJson);
  const envKeys = getRecordKeys(server.encryptedEnvJson);

  if (server.transport === "stdio") {
    if (envKeys.length === 1) {
      return { mode: "env", envKeyName: envKeys[0], envKeys };
    }
    if (envKeys.length > 1) {
      return { mode: "custom", envKeys };
    }
    if (headerKeys.length > 0) {
      return { mode: "custom", headerKeys };
    }
    return { mode: "none" };
  }

  if (headerKeys.length === 1) {
    const key = headerKeys[0]!;
    if (key.toLowerCase() === "authorization") {
      return { mode: "bearer", headerKeys };
    }
    return { mode: "api-key", apiKeyHeader: key, headerKeys };
  }

  if (headerKeys.length > 1) {
    return { mode: "custom", headerKeys };
  }

  if (envKeys.length > 0) {
    return { mode: "custom", envKeys };
  }

  return { mode: "none" };
}
