export type ApiKeyScopeRisk = "read" | "write" | "admin";

export type ApiKeyScopeDefinition = {
  permission: string;
  group: string;
  risk: ApiKeyScopeRisk;
};

export const API_KEY_SCOPE_CATALOG = [
  { permission: "workspaces.get", group: "workspaces", risk: "read" },
  { permission: "workspaces.update", group: "workspaces", risk: "admin" },
  { permission: "workspaces.curate", group: "workspaces", risk: "admin" },
  { permission: "roles.manage", group: "workspaces", risk: "admin" },
  { permission: "providers.viewMetadata", group: "providers", risk: "read" },
  { permission: "providers.create", group: "providers", risk: "write" },
  { permission: "providers.update", group: "providers", risk: "write" },
  { permission: "providers.delete", group: "providers", risk: "admin" },
  { permission: "providers.test", group: "providers", risk: "write" },
  { permission: "providers.manage", group: "providers", risk: "admin" },
  { permission: "models.view", group: "models", risk: "read" },
  { permission: "models.invoke", group: "models", risk: "write" },
  { permission: "models.create", group: "models", risk: "write" },
  { permission: "models.update", group: "models", risk: "write" },
  { permission: "models.delete", group: "models", risk: "admin" },
  { permission: "models.sync", group: "models", risk: "write" },
  { permission: "models.manage", group: "models", risk: "admin" },
  { permission: "agents.list", group: "agents", risk: "read" },
  { permission: "agents.get", group: "agents", risk: "read" },
  { permission: "agents.chat", group: "agents", risk: "write" },
  { permission: "agents.create", group: "agents", risk: "write" },
  { permission: "agents.update", group: "agents", risk: "write" },
  { permission: "agents.delete", group: "agents", risk: "admin" },
  { permission: "agents.test", group: "agents", risk: "write" },
  { permission: "agents.delegate", group: "agents", risk: "write" },
  { permission: "agents.manage", group: "agents", risk: "admin" },
  { permission: "agentVersions.create", group: "agents", risk: "write" },
  { permission: "agentVersions.manage", group: "agents", risk: "admin" },
  { permission: "workflows.view", group: "workflows", risk: "read" },
  { permission: "workflows.create", group: "workflows", risk: "write" },
  { permission: "workflows.update", group: "workflows", risk: "write" },
  { permission: "workflows.delete", group: "workflows", risk: "admin" },
  { permission: "workflows.execute", group: "workflows", risk: "write" },
  { permission: "tools.view", group: "tools", risk: "read" },
  { permission: "tools.configure", group: "tools", risk: "write" },
  {
    permission: "tools.executeRestricted",
    group: "tools",
    risk: "write",
  },
  { permission: "tools.manage", group: "tools", risk: "admin" },
  { permission: "mcpServers.get", group: "tools", risk: "read" },
  { permission: "mcpServers.manage", group: "tools", risk: "admin" },
  {
    permission: "knowledgeBases.viewAllowed",
    group: "knowledge",
    risk: "read",
  },
  {
    permission: "knowledgeBases.manage",
    group: "knowledge",
    risk: "admin",
  },
  {
    permission: "conversations.viewOwn",
    group: "conversations",
    risk: "read",
  },
  {
    permission: "conversations.create",
    group: "conversations",
    risk: "write",
  },
  {
    permission: "conversations.manage",
    group: "conversations",
    risk: "admin",
  },
  { permission: "usage.view", group: "governance", risk: "read" },
  { permission: "audit.view", group: "governance", risk: "read" },
  { permission: "audit.export", group: "governance", risk: "write" },
  {
    permission: "marketplaceItems.view",
    group: "marketplace",
    risk: "read",
  },
  {
    permission: "marketplaceItems.install",
    group: "marketplace",
    risk: "write",
  },
  {
    permission: "marketplaceItems.publish",
    group: "marketplace",
    risk: "write",
  },
  { permission: "apiKeys.manageOwn", group: "apiKeys", risk: "admin" },
  { permission: "apiKeys.manage", group: "apiKeys", risk: "admin" },
] as const satisfies readonly ApiKeyScopeDefinition[];

export const API_KEY_SCOPE_PERMISSIONS = API_KEY_SCOPE_CATALOG.map(
  ({ permission }) => permission,
);

const knownPermissions = new Set<string>(API_KEY_SCOPE_PERMISSIONS);

export function isKnownApiKeyScope(scope: string) {
  return knownPermissions.has(scope);
}

export function uniqueApiKeyScopes(scopes: readonly string[]) {
  return [...new Set(scopes)];
}

export const API_KEY_SCOPE_PRESETS = {
  readOnly: API_KEY_SCOPE_CATALOG.filter(({ risk }) => risk === "read").map(
    ({ permission }) => permission,
  ),
  agentRuntime: [
    "workspaces.get",
    "agents.list",
    "agents.get",
    "agents.chat",
    "models.view",
    "models.invoke",
    "tools.view",
    "tools.executeRestricted",
    "knowledgeBases.viewAllowed",
    "conversations.create",
    "conversations.viewOwn",
  ],
} as const;
