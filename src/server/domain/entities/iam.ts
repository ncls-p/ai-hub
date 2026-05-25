export type Permission = string;

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

export interface RoleBinding {
    id: string;
    principalType: "user" | "group" | "service_account" | "api_key";
    principalId: string;
    roleId: string;
    resourceType:
        | "organization"
        | "workspace"
        | "agent"
        | "provider"
        | "mcp_server"
        | "knowledge_base"
        | "marketplace_item";
    resourceId: string;
    condition?: Record<string, unknown>;
    expiresAt?: Date;
    createdById?: string;
    createdAt: Date;
}

// ─── Built-in role definitions ─────────────────────────────────────────

export const SYSTEM_ROLES: Omit<Role, "createdAt" | "updatedAt">[] = [
    {
        id: "", // assigned by DB
        scopeType: "organization",
        name: "organization.owner",
        displayName: "Organization Owner",
        description: "Full organization control",
        permissions: [
            "organization.*",
            "workspaces.*",
            "members.*",
            "roles.*",
            "billing.*",
            "security.*",
            "audit.*",
            "marketplace.*",
        ],
        isSystem: true,
    },
    {
        id: "",
        scopeType: "organization",
        name: "organization.admin",
        displayName: "Organization Admin",
        description: "Manage workspaces and members",
        permissions: [
            "organization.get",
            "workspaces.create",
            "workspaces.update",
            "workspaces.delete",
            "members.manage",
            "roles.manage",
            "audit.view",
        ],
        isSystem: true,
    },
    {
        id: "",
        scopeType: "organization",
        name: "organization.securityAdmin",
        displayName: "Security Admin",
        description: "Security-focused role",
        permissions: [
            "members.view",
            "roles.manage",
            "apiKeys.manage",
            "secrets.rotate",
            "audit.view",
            "audit.export",
            "providers.viewMetadata",
            "mcpServers.viewMetadata",
        ],
        isSystem: true,
    },
    {
        id: "",
        scopeType: "organization",
        name: "organization.billingAdmin",
        displayName: "Billing Admin",
        description: "Manage billing and usage",
        permissions: [
            "billing.view",
            "billing.manage",
            "usage.view",
            "invoices.view",
            "plans.manage",
        ],
        isSystem: true,
    },
    {
        id: "",
        scopeType: "workspace",
        name: "workspace.owner",
        displayName: "Workspace Owner",
        description: "Full workspace control",
        permissions: [
            "workspace.*",
            "members.*",
            "roles.*",
            "providers.*",
            "models.*",
            "agents.*",
            "tools.*",
            "mcpServers.*",
            "knowledgeBases.*",
            "conversations.*",
            "usage.*",
            "audit.*",
            "marketplace.*",
        ],
        isSystem: true,
    },
    {
        id: "",
        scopeType: "workspace",
        name: "workspace.admin",
        displayName: "Workspace Admin",
        description:
            "Manage workspace except destructive ownership/billing actions",
        permissions: [
            "workspaces.get",
            "workspaces.update",
            "members.invite",
            "members.remove",
            "providers.manage",
            "models.manage",
            "agents.manage",
            "tools.manage",
            "mcpServers.manage",
            "knowledgeBases.manage",
            "usage.view",
            "audit.view",
            "marketplaceItems.install",
        ],
        isSystem: true,
    },
    {
        id: "",
        scopeType: "workspace",
        name: "workspace.aiAdmin",
        displayName: "AI Admin",
        description: "Manages AI runtime configuration",
        permissions: [
            "providers.manage",
            "models.manage",
            "agents.manage",
            "tools.manage",
            "mcpServers.manage",
            "knowledgeBases.manage",
            "usage.view",
        ],
        isSystem: true,
    },
    {
        id: "",
        scopeType: "workspace",
        name: "workspace.developer",
        displayName: "Developer",
        description:
            "Builds agents/tools/knowledge but cannot manage members or billing",
        permissions: [
            "agents.create",
            "agents.update",
            "agentVersions.create",
            "agents.test",
            "tools.configure",
            "mcpServers.get",
            "knowledgeBases.manage",
            "conversations.create",
            "conversations.viewOwn",
            "marketplaceItems.install",
        ],
        isSystem: true,
    },
    {
        id: "",
        scopeType: "workspace",
        name: "workspace.member",
        displayName: "Member",
        description: "Normal user",
        permissions: [
            "agents.list",
            "agents.get",
            "agents.chat",
            "conversations.create",
            "conversations.viewOwn",
            "knowledgeBases.viewAllowed",
            "marketplaceItems.view",
        ],
        isSystem: true,
    },
    {
        id: "",
        scopeType: "workspace",
        name: "workspace.viewer",
        displayName: "Viewer",
        description: "Read-only workspace user",
        permissions: [
            "workspaces.get",
            "agents.list",
            "agents.get",
            "conversations.viewShared",
            "knowledgeBases.viewAllowed",
            "usage.viewLimited",
        ],
        isSystem: true,
    },
    {
        id: "",
        scopeType: "workspace",
        name: "workspace.auditor",
        displayName: "Auditor",
        description: "Compliance/read-only logs",
        permissions: [
            "auditLogs.view",
            "auditLogs.export",
            "usage.view",
            "members.view",
            "providers.viewMetadata",
            "agents.view",
        ],
        isSystem: true,
    },
];
