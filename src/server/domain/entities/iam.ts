type Permission = string;

export interface Role {
  id: string;
  scopeType: "system" | "organization" | "workspace";
  ownerResourceType?: "organization" | "workspace";
  ownerResourceId?: string;
  name: string;
  displayName: string;
  description?: string;
  permissions: Permission[];
  isSystem: boolean;
  createdById?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TENANT_USER_PERMISSIONS: Permission[] = [
  "workspaces.get",
  "providers.viewMetadata",
  "models.view",
  "models.invoke",
  "agents.list",
  "agents.get",
  "agents.chat",
  "agents.create",
  "agents.update",
  "agents.delete",
  "agents.test",
  "agents.delegate",
  "agentVersions.create",
  "tools.view",
  "tools.configure",
  "tools.executeRestricted",
  "mcpServers.get",
  "mcpServers.manage",
  "knowledgeBases.viewAllowed",
  "knowledgeBases.manage",
  "conversations.create",
  "conversations.viewOwn",
  "marketplaceItems.view",
  "marketplaceItems.install",
  "marketplaceItems.publish",
  "apiKeys.manageOwn",
  "workflows.view",
  "workflows.create",
  "workflows.update",
  "workflows.delete",
  "workflows.execute",
];

const TENANT_ADMIN_PERMISSIONS: Permission[] = [
  "workspaces.curate",
  "workspaces.delete",
  "workspaces.transfer",
  "workspaces.get",
  "workspaces.update",
  "roles.manage",
  "providers.manage",
  "providers.viewMetadata",
  "providers.create",
  "providers.update",
  "providers.delete",
  "providers.test",
  "models.manage",
  "models.view",
  "models.invoke",
  "models.create",
  "models.update",
  "models.delete",
  "models.sync",
  "agents.manage",
  "agents.list",
  "agents.get",
  "agents.chat",
  "agents.create",
  "agents.update",
  "agents.delete",
  "agents.test",
  "agents.delegate",
  "agentVersions.manage",
  "agentVersions.create",
  "tools.manage",
  "tools.view",
  "tools.configure",
  "tools.executeRestricted",
  "mcpServers.manage",
  "mcpServers.get",
  "knowledgeBases.manage",
  "knowledgeBases.viewAllowed",
  "conversations.manage",
  "conversations.create",
  "conversations.viewOwn",
  "usage.view",
  "audit.view",
  "audit.export",
  "marketplaceItems.view",
  "marketplaceItems.install",
  "marketplaceItems.publish",
  "apiKeys.manage",
  "workflows.view",
  "workflows.create",
  "workflows.update",
  "workflows.delete",
  "workflows.execute",
];

// ─── Built-in tenant role definitions ─────────────────────────────────

export const SYSTEM_ROLES: Omit<Role, "createdAt" | "updatedAt">[] = [
  {
    id: "",
    scopeType: "organization",
    name: "organization.owner",
    displayName: "Organization Owner",
    description:
      "Full control over the organization and every project it contains.",
    permissions: [
      "organization.delete",
      "organization.transfer",
      ...new Set([
        "organization.get",
        "organization.update",
        "workspaces.get",
        "workspaces.create",
        "workspaces.update",
        "members.manage",
        "teams.manage",
        "roles.manage",
        ...TENANT_ADMIN_PERMISSIONS,
      ]),
    ],
    isSystem: true,
  },
  {
    id: "", // assigned by DB
    scopeType: "organization",
    name: "organization.admin",
    displayName: "Organization Admin",
    description: "Can administer organization-level settings.",
    permissions: [
      ...TENANT_ADMIN_PERMISSIONS,
      "organization.get",
      "organization.update",
      "workspaces.get",
      "workspaces.create",
      "workspaces.update",
      "members.manage",
      "teams.manage",
      "roles.manage",
      "audit.view",
    ],
    isSystem: true,
  },
  {
    id: "",
    scopeType: "organization",
    name: "organization.user",
    displayName: "Organization Member",
    description:
      "Can belong to organization teams and receive project-specific access.",
    permissions: ["organization.get"],
    isSystem: true,
  },
  {
    id: "",
    scopeType: "workspace",
    name: "workspace.admin",
    displayName: "Project Administrator",
    description:
      "Full control over one project, including its access assignments.",
    permissions: TENANT_ADMIN_PERMISSIONS,
    isSystem: true,
  },
  {
    id: "",
    scopeType: "workspace",
    name: "workspace.member",
    displayName: "Project Editor",
    description:
      "Can build and use project resources without managing project access.",
    permissions: TENANT_USER_PERMISSIONS,
    isSystem: true,
  },
  {
    id: "",
    scopeType: "workspace",
    name: "workspace.viewer",
    displayName: "Project Viewer",
    description: "Read-only access to project resources and activity.",
    permissions: [
      "workspaces.get",
      "providers.viewMetadata",
      "models.view",
      "agents.list",
      "agents.get",
      "tools.view",
      "mcpServers.get",
      "knowledgeBases.viewAllowed",
      "marketplaceItems.view",
      "usage.view",
      "audit.view",
      "workflows.view",
    ],
    isSystem: true,
  },
  {
    id: "",
    scopeType: "workspace",
    name: "workspace.knowledge_editor",
    displayName: "Knowledge Editor",
    description:
      "Can view and update one explicitly shared knowledge collection.",
    permissions: ["knowledgeBases.viewAllowed", "knowledgeBases.manage"],
    isSystem: true,
  },
  {
    id: "",
    scopeType: "workspace",
    name: "workspace.agent_user",
    displayName: "Assistant User",
    description:
      "Can discover, chat with, and test one explicitly shared assistant.",
    permissions: ["agents.get", "agents.chat", "agents.test"],
    isSystem: true,
  },
];
