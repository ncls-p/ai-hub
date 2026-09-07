export type PermissionCatalogGroup = {
  id: string;
  label: string;
  description: string;
  permissions: Array<{
    id: string;
    label: string;
    description: string;
  }>;
};

export const PERMISSION_CATALOG = [
  {
    id: "organization",
    label: "Organization & projects",
    description: "Structure, settings, projects, and access administration.",
    permissions: [
      {
        id: "workspaces.curate",
        label: "Manage shared project resources",
        description:
          "Curate shared assistants, knowledge and connections without administering access policies.",
      },
      {
        id: "organization.delete",
        label: "Delete organization",
        description: "Delete the organization and all of its projects.",
      },
      {
        id: "organization.transfer",
        label: "Migrate organization",
        description:
          "Move or clone an organization into another authorized organization.",
      },
      {
        id: "workspaces.delete",
        label: "Delete projects",
        description: "Delete a project and its resources.",
      },
      {
        id: "workspaces.transfer",
        label: "Transfer project resources",
        description:
          "Move or clone project resources and their access policies.",
      },
      {
        id: "roles.get",
        label: "View access policy",
        description: "Read roles, assignments, members and teams.",
      },
      {
        id: "roles.create",
        label: "Create custom roles",
        description: "Create a role limited to permissions you hold.",
      },
      {
        id: "roles.update",
        label: "Edit custom roles",
        description: "Edit a subordinate role and its permissions.",
      },
      {
        id: "roles.delete",
        label: "Delete custom roles",
        description: "Delete an unused subordinate custom role.",
      },
      {
        id: "roles.assign",
        label: "Assign roles",
        description: "Grant subordinate access to members or teams.",
      },
      {
        id: "roles.revoke",
        label: "Revoke roles",
        description: "Remove subordinate access assignments.",
      },
      {
        id: "members.create",
        label: "Add members",
        description: "Add an account to the organization.",
      },
      {
        id: "members.delete",
        label: "Remove members",
        description: "Remove a subordinate organization member.",
      },
      {
        id: "teams.create",
        label: "Create teams",
        description: "Create an organization team.",
      },
      {
        id: "teams.update",
        label: "Edit team membership",
        description:
          "Add or remove subordinate members within delegable team access.",
      },
      {
        id: "teams.delete",
        label: "Delete teams",
        description: "Delete a team whose access you can administer.",
      },
      {
        id: "organization.get",
        label: "View organization",
        description: "See organization settings and structure.",
      },
      {
        id: "organization.update",
        label: "Manage organization",
        description: "Change organization settings.",
      },
      {
        id: "workspaces.get",
        label: "View projects",
        description: "Open projects in the organization.",
      },
      {
        id: "workspaces.create",
        label: "Create projects",
        description: "Create new projects inside the organization.",
      },
      {
        id: "workspaces.update",
        label: "Manage projects",
        description: "Change project settings and lifecycle.",
      },
      {
        id: "members.manage",
        label: "Manage members",
        description: "Add members and update their access.",
      },
      {
        id: "teams.manage",
        label: "Manage teams",
        description: "Create teams and manage team membership.",
      },
      {
        id: "roles.manage",
        label: "Manage access",
        description: "Create roles and assign them to members or teams.",
      },
    ],
  },
  {
    id: "assistants",
    label: "Assistants & conversations",
    description: "Build, run, and delegate AI assistants.",
    permissions: [
      {
        id: "agents.test",
        label: "Test assistants",
        description: "Run assistant tests.",
      },
      {
        id: "agents.manage",
        label: "Manage assistants",
        description: "All currently catalogued assistant actions.",
      },
      {
        id: "agents.list",
        label: "List assistants",
        description: "See assistants available in the project.",
      },
      {
        id: "agents.get",
        label: "View assistant details",
        description: "Open an assistant and inspect its configuration.",
      },
      {
        id: "agents.chat",
        label: "Use assistants",
        description: "Start conversations and run assistants.",
      },
      {
        id: "agents.create",
        label: "Create assistants",
        description: "Create and configure assistants.",
      },
      {
        id: "agents.update",
        label: "Edit assistants",
        description: "Update existing assistants.",
      },
      {
        id: "agents.delete",
        label: "Delete assistants",
        description: "Permanently remove assistants.",
      },
      {
        id: "agents.delegate",
        label: "Delegate to specialists",
        description: "Allow orchestrators to run specialist assistants.",
      },
      {
        id: "agentVersions.create",
        label: "Create assistant versions",
        description: "Save new versions of assistants.",
      },
      {
        id: "agentVersions.manage",
        label: "Manage assistant versions",
        description: "Administer all assistant versions.",
      },
      {
        id: "conversations.create",
        label: "Create conversations",
        description: "Start new project conversations.",
      },
      {
        id: "conversations.viewOwn",
        label: "View own conversations",
        description: "Read conversations created by the member.",
      },
      {
        id: "conversations.manage",
        label: "Manage all conversations",
        description: "Administer conversations across the project.",
      },
    ],
  },
  {
    id: "platform",
    label: "Models, tools & knowledge",
    description: "AI providers, tools, integrations, and knowledge bases.",
    permissions: [
      {
        id: "providers.create",
        label: "Create AI connections",
        description: "Create a provider connection.",
      },
      {
        id: "providers.update",
        label: "Edit AI connections",
        description: "Edit provider settings.",
      },
      {
        id: "providers.delete",
        label: "Delete AI connections",
        description: "Remove a provider connection.",
      },
      {
        id: "providers.test",
        label: "Test AI connections",
        description: "Test provider connectivity.",
      },
      {
        id: "models.create",
        label: "Create models",
        description: "Add a model.",
      },
      {
        id: "models.update",
        label: "Edit models",
        description: "Update model configuration.",
      },
      {
        id: "models.delete",
        label: "Delete models",
        description: "Remove a model.",
      },
      {
        id: "models.sync",
        label: "Sync models",
        description: "Discover models from a provider.",
      },
      {
        id: "tools.manage",
        label: "Manage tools",
        description: "All currently catalogued tool actions.",
      },
      {
        id: "providers.viewMetadata",
        label: "View AI connections",
        description: "See configured providers without secrets.",
      },
      {
        id: "providers.manage",
        label: "Manage AI connections",
        description: "Create, test, update, and delete providers.",
      },
      {
        id: "models.view",
        label: "View models",
        description: "See models available in the project.",
      },
      {
        id: "models.invoke",
        label: "Use models",
        description: "Invoke configured models.",
      },
      {
        id: "models.manage",
        label: "Manage models",
        description: "Sync and configure model availability.",
      },
      {
        id: "tools.view",
        label: "View tools",
        description: "See tools and integrations.",
      },
      {
        id: "tools.configure",
        label: "Configure tools",
        description: "Change tool and approval settings.",
      },
      {
        id: "tools.executeRestricted",
        label: "Run restricted tools",
        description: "Execute tools that require elevated access.",
      },
      {
        id: "mcpServers.get",
        label: "View integrations",
        description: "See configured MCP servers and connections.",
      },
      {
        id: "mcpServers.manage",
        label: "Manage integrations",
        description: "Configure MCP servers and connections.",
      },
      {
        id: "knowledgeBases.viewAllowed",
        label: "View allowed knowledge",
        description: "Read knowledge bases shared with the member.",
      },
      {
        id: "knowledgeBases.manage",
        label: "Manage knowledge",
        description: "Create and update knowledge bases.",
      },
    ],
  },
  {
    id: "automation",
    label: "Workflows",
    description: "Design, publish, and execute automated workflows.",
    permissions: [
      {
        id: "workflows.view",
        label: "View workflows",
        description: "List workflows and inspect their runs.",
      },
      {
        id: "workflows.create",
        label: "Create workflows",
        description: "Create new workflow drafts.",
      },
      {
        id: "workflows.update",
        label: "Edit workflows",
        description: "Edit and publish workflows.",
      },
      {
        id: "workflows.execute",
        label: "Run workflows",
        description: "Start workflow executions.",
      },
      {
        id: "workflows.delete",
        label: "Delete workflows",
        description: "Permanently remove workflows.",
      },
    ],
  },
  {
    id: "governance",
    label: "Governance & credentials",
    description: "Usage, audit, marketplace publishing, and API credentials.",
    permissions: [
      {
        id: "usage.view",
        label: "View usage",
        description: "See consumption and quota.",
      },
      {
        id: "audit.view",
        label: "View audit log",
        description: "Review security-sensitive events.",
      },
      {
        id: "audit.export",
        label: "Export audit log",
        description: "Download audit events.",
      },
      {
        id: "marketplaceItems.view",
        label: "View marketplace items",
        description: "Browse resources available in the marketplace.",
      },
      {
        id: "marketplaceItems.install",
        label: "Install marketplace items",
        description: "Add shared resources to the project.",
      },
      {
        id: "marketplaceItems.publish",
        label: "Publish marketplace items",
        description: "Share project resources through the marketplace.",
      },
      {
        id: "apiKeys.manageOwn",
        label: "Manage own API keys",
        description: "Create credentials limited to the member's access.",
      },
      {
        id: "apiKeys.manage",
        label: "Manage all API keys",
        description: "Administer credentials for the project.",
      },
    ],
  },
] as const satisfies readonly PermissionCatalogGroup[];
