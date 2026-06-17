import {
	pgTable,
	text,
	integer,
	timestamp,
	boolean,
	varchar,
	uuid,
	jsonb,
	vector,
	index,
	uniqueIndex,
	pgEnum,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ─── Better Auth tables ────────────────────────────────────────────────

export const users = pgTable("user", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: varchar("name", { length: 255 }).notNull(),
	email: varchar("email", { length: 255 }).notNull().unique(),
	emailVerified: boolean("email_verified").notNull().default(false),
	image: text("image"),
	role: varchar("role", { length: 64 }),
	banned: boolean("banned").notNull().default(false),
	banReason: text("ban_reason"),
	banExpires: timestamp("ban_expires", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const sessions = pgTable("session", {
	id: uuid("id").primaryKey().defaultRandom(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	ipAddress: varchar("ip_address", { length: 45 }),
	userAgent: text("user_agent"),
	impersonatedBy: uuid("impersonated_by").references(() => users.id, {
		onDelete: "set null",
	}),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = pgTable("account", {
	id: uuid("id").primaryKey().defaultRandom(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at", {
		withTimezone: true,
	}),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
		withTimezone: true,
	}),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const verifications = pgTable("verification", {
	id: uuid("id").primaryKey().defaultRandom(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }),
	updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const appSettings = pgTable("app_settings", {
	key: varchar("key", { length: 128 }).primaryKey(),
	valueJson: jsonb("value_json").notNull(),
	updatedById: uuid("updated_by_user_id").references(() => users.id, {
		onDelete: "set null",
	}),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

// ─── Organization & Workspace ──────────────────────────────────────────

export const organizations = pgTable("organizations", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: varchar("name", { length: 255 }).notNull(),
	slug: varchar("slug", { length: 128 }).notNull().unique(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const workspaces = pgTable(
	"workspaces",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		name: varchar("name", { length: 255 }).notNull(),
		slug: varchar("slug", { length: 128 }).notNull(),
		createdById: uuid("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
	},
	(t) => ({
		orgSlug: uniqueIndex("workspaces_org_slug_unique").on(
			t.organizationId,
			t.slug,
		),
	}),
);

export const workspaceMemberStatusEnum = pgEnum("workspace_member_status", [
	"active",
	"suspended",
	"removed",
]);

export const workspaceMembers = pgTable(
	"workspace_members",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		status: workspaceMemberStatusEnum("status").notNull().default("active"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => ({
		wsUser: uniqueIndex("workspace_members_ws_user_unique").on(
			t.workspaceId,
			t.userId,
		),
	}),
);

export const workspaceInvitations = pgTable("workspace_invitations", {
	id: uuid("id").primaryKey().defaultRandom(),
	workspaceId: uuid("workspace_id")
		.notNull()
		.references(() => workspaces.id, { onDelete: "cascade" }),
	email: varchar("email", { length: 255 }).notNull(),
	invitedById: uuid("invited_by_user_id")
		.notNull()
		.references(() => users.id),
	roleIdsJson: jsonb("role_ids_json"),
	tokenHash: text("token_hash").notNull().unique(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	acceptedAt: timestamp("accepted_at", { withTimezone: true }),
	revokedAt: timestamp("revoked_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

// ─── IAM: Roles & Permissions ──────────────────────────────────────────

export const roleScopeTypeEnum = pgEnum("role_scope_type", [
	"system",
	"organization",
	"workspace",
]);
export const roleOwnerResourceTypeEnum = pgEnum("role_owner_resource_type", [
	"organization",
	"workspace",
]);

export const roles = pgTable(
	"roles",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		scopeType: roleScopeTypeEnum("scope_type").notNull(),
		ownerResourceType: roleOwnerResourceTypeEnum("owner_resource_type"),
		ownerResourceId: uuid("owner_resource_id"),
		name: varchar("name", { length: 128 }).notNull(),
		displayName: varchar("display_name", { length: 255 }).notNull(),
		description: text("description"),
		permissionsJson: jsonb("permissions_json").notNull(),
		isSystem: boolean("is_system").notNull().default(false),
		createdById: uuid("created_by_user_id").references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => ({
		systemName: uniqueIndex("roles_system_name_unique")
			.on(t.scopeType, t.name)
			.where(sql`${t.isSystem} = true`),
	}),
);

export const principalTypeEnum = pgEnum("principal_type", [
	"user",
	"group",
	"service_account",
	"api_key",
]);
export const roleBindingResourceTypeEnum = pgEnum(
	"role_binding_resource_type",
	[
		"organization",
		"workspace",
		"agent",
		"provider",
		"mcp_server",
		"knowledge_base",
		"marketplace_item",
	],
);

export const roleBindings = pgTable(
	"role_bindings",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		principalType: principalTypeEnum("principal_type").notNull(),
		principalId: uuid("principal_id").notNull(),
		roleId: uuid("role_id")
			.notNull()
			.references(() => roles.id, { onDelete: "cascade" }),
		resourceType: roleBindingResourceTypeEnum("resource_type").notNull(),
		resourceId: uuid("resource_id").notNull(),
		conditionJson: jsonb("condition_json"),
		expiresAt: timestamp("expires_at", { withTimezone: true }),
		createdById: uuid("created_by_user_id").references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => ({
		principalRoleResource: index("role_bindings_principal_role_resource").on(
			t.principalType,
			t.principalId,
			t.resourceType,
			t.resourceId,
		),
	}),
);

// ─── Audit Events ──────────────────────────────────────────────────────

export const auditEvents = pgTable(
	"audit_events",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id"),
		workspaceId: uuid("workspace_id"),
		actorPrincipalType: varchar("actor_principal_type", { length: 32 }),
		actorPrincipalId: uuid("actor_principal_id"),
		action: varchar("action", { length: 128 }).notNull(),
		resourceType: varchar("resource_type", { length: 64 }),
		resourceId: uuid("resource_id"),
		outcome: varchar("outcome", { length: 16 }).notNull(),
		ipAddress: varchar("ip_address", { length: 45 }),
		userAgent: text("user_agent"),
		metadataJson: jsonb("metadata_json"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => ({
		actor: index("audit_events_actor").on(
			t.actorPrincipalType,
			t.actorPrincipalId,
		),
		resource: index("audit_events_resource").on(t.resourceType, t.resourceId),
		workspace: index("audit_events_workspace").on(t.workspaceId),
	}),
);

// ─── Usage Events ──────────────────────────────────────────────────────

export const usageEvents = pgTable(
	"usage_events",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id"),
		userId: uuid("user_id"),
		providerId: uuid("provider_id"),
		modelId: uuid("model_id"),
		agentId: uuid("agent_id"),
		conversationId: uuid("conversation_id"),
		operation: varchar("operation", { length: 32 }).notNull(),
		inputTokens: integer("input_tokens"),
		outputTokens: integer("output_tokens"),
		costUsd: text("cost_usd"),
		latencyMs: integer("latency_ms"),
		status: varchar("status", { length: 16 }),
		metadataJson: jsonb("metadata_json"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => ({
		workspace: index("usage_events_workspace").on(t.workspaceId),
		user: index("usage_events_user").on(t.userId),
	}),
);

// ─── AI Providers ──────────────────────────────────────────────────────

export const providerKindEnum = pgEnum("provider_kind", [
	"openai-compatible",
	"dragonfly",
	"vercel-ai-gateway",
	"native",
]);
export const providerAuthTypeEnum = pgEnum("provider_auth_type", [
	"bearer",
	"x-api-key",
	"custom-header",
	"gateway",
]);

export const aiProviders = pgTable(
	"ai_providers",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		kind: providerKindEnum("kind").notNull(),
		name: varchar("name", { length: 255 }).notNull(),
		baseUrl: text("base_url"),
		authType: providerAuthTypeEnum("auth_type").notNull(),
		encryptedApiKey: text("encrypted_api_key"),
		encryptedHeadersJson: jsonb("encrypted_headers_json"),
		queryParamsJson: jsonb("query_params_json"),
		enabled: boolean("enabled").notNull().default(true),
		healthStatus: varchar("health_status", { length: 16 }),
		lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
		createdById: uuid("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
	},
	(t) => ({
		workspace: index("ai_providers_workspace").on(t.workspaceId),
	}),
);

export const aiModels = pgTable(
	"ai_models",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		providerId: uuid("provider_id")
			.notNull()
			.references(() => aiProviders.id, { onDelete: "cascade" }),
		modelId: varchar("model_id", { length: 255 }).notNull(),
		displayName: varchar("display_name", { length: 255 }),
		capabilitiesJson: jsonb("capabilities_json"),
		contextWindow: integer("context_window"),
		maxOutputTokens: integer("max_output_tokens"),
		inputTokenCost: text("input_token_cost"),
		outputTokenCost: text("output_token_cost"),
		enabled: boolean("enabled").notNull().default(true),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => ({
		providerModel: uniqueIndex("ai_models_provider_model_unique").on(
			t.providerId,
			t.modelId,
		),
	}),
);

// ─── Agents ────────────────────────────────────────────────────────────

export const agentVisibilityEnum = pgEnum("agent_visibility", [
	"private",
	"workspace",
	"organization",
	"public",
]);
export const agentSourceTypeEnum = pgEnum("agent_source_type", [
	"custom",
	"marketplace_install",
	"fork",
]);

export const agents = pgTable(
	"agents",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		name: varchar("name", { length: 255 }).notNull(),
		slug: varchar("slug", { length: 128 }).notNull(),
		description: text("description"),
		visibility: agentVisibilityEnum("visibility").notNull().default("private"),
		sourceType: agentSourceTypeEnum("source_type").notNull().default("custom"),
		sharingMode: varchar("sharing_mode", { length: 32 })
			.notNull()
			.default("personal"),
		shareTargetUserId: uuid("share_target_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		isGlobal: boolean("is_global").notNull().default(false),
		isRecommended: boolean("is_recommended").notNull().default(false),
		curationLabel: varchar("curation_label", { length: 64 }),
		marketplaceItemId: uuid("marketplace_item_id"),
		marketplaceVersionId: uuid("marketplace_version_id"),
		forkedFromAgentId: uuid("forked_from_agent_id"),
		createdById: uuid("created_by_user_id")
			.notNull()
			.references(() => users.id),
		activeVersionId: uuid("active_version_id"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
	},
	(t) => ({
		workspaceSlug: uniqueIndex("agents_workspace_slug_unique").on(
			t.workspaceId,
			t.slug,
		),
	}),
);

export const agentVersions = pgTable(
	"agent_versions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		agentId: uuid("agent_id").notNull(),
		versionNumber: integer("version_number").notNull(),
		name: varchar("name", { length: 255 }),
		systemPrompt: text("system_prompt"),
		providerId: uuid("provider_id").references(() => aiProviders.id),
		modelId: uuid("model_id"),
		temperature: text("temperature"),
		topP: text("top_p"),
		maxOutputTokens: integer("max_output_tokens"),
		maxToolCalls: integer("max_tool_calls").notNull().default(6),
		toolChoice: varchar("tool_choice", { length: 32 }),
		generationSettingsJson: jsonb("generation_settings_json"),
		responseFormatJson: jsonb("response_format_json"),
		memoryPolicyJson: jsonb("memory_policy_json"),
		guardrailsJson: jsonb("guardrails_json"),
		approvalPolicyJson: jsonb("approval_policy_json"),
		createdById: uuid("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => ({
		agentVersion: uniqueIndex("agent_versions_agent_version_unique").on(
			t.agentId,
			t.versionNumber,
		),
	}),
);

// ─── Conversations & Messages ──────────────────────────────────────────

export const conversationStatusEnum = pgEnum("conversation_status", [
	"active",
	"archived",
	"deleted",
]);

export const conversationFolders = pgTable(
	"conversation_folders",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		name: varchar("name", { length: 160 }).notNull(),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
	},
	(t) => ({
		userWorkspaceOrder: index("conversation_folders_user_workspace_order").on(
			t.userId,
			t.workspaceId,
			t.archivedAt,
			t.sortOrder,
			t.createdAt,
			t.id,
		),
	}),
);

export const conversations = pgTable(
	"conversations",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		agentId: uuid("agent_id")
			.notNull()
			.references(() => agents.id, { onDelete: "cascade" }),
		agentVersionId: uuid("agent_version_id").references(() => agentVersions.id),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id),
		title: varchar("title", { length: 512 }).notNull().default("New Chat"),
		status: conversationStatusEnum("status").notNull().default("active"),
		folderId: uuid("folder_id").references(() => conversationFolders.id, {
			onDelete: "set null",
		}),
		pinnedAt: timestamp("pinned_at", { withTimezone: true }),
		sidebarOrder: integer("sidebar_order"),
		parentConversationId: uuid("parent_conversation_id"),
		branchFromMessageId: uuid("branch_from_message_id"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
	},
	(t) => ({
		workspaceAgent: index("conversations_workspace_agent").on(
			t.workspaceId,
			t.agentId,
		),
		user: index("conversations_user").on(t.userId),
		userWorkspaceUpdated: index("conversations_user_workspace_updated").on(
			t.userId,
			t.workspaceId,
			t.status,
			t.archivedAt,
			t.updatedAt,
			t.id,
		),
		sidebarOrder: index("conversations_sidebar_order").on(
			t.userId,
			t.workspaceId,
			t.folderId,
			t.pinnedAt,
			t.sidebarOrder,
			t.updatedAt,
			t.id,
		),
	}),
);

export const messageRoleEnum = pgEnum("message_role", [
	"user",
	"assistant",
	"system",
	"tool",
]);
export const messageStatusEnum = pgEnum("message_status", [
	"pending",
	"streaming",
	"completed",
	"failed",
	"cancelled",
]);

export const scheduledTaskFrequencyEnum = pgEnum("scheduled_task_frequency", [
	"daily",
	"interval",
]);

export const scheduledTaskStatusEnum = pgEnum("scheduled_task_status", [
	"idle",
	"running",
	"success",
	"failed",
]);

export const messages = pgTable(
	"messages",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		conversationId: uuid("conversation_id").notNull(),
		role: messageRoleEnum("role").notNull(),
		status: messageStatusEnum("status").notNull().default("pending"),
		tokenInput: integer("token_input"),
		tokenOutput: integer("token_output"),
		costUsd: text("cost_usd"),
		modelId: varchar("model_id", { length: 255 }),
		providerId: uuid("provider_id"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
	},
	(t) => ({
		conversation: index("messages_conversation").on(t.conversationId),
		conversationCreated: index("messages_conversation_created").on(
			t.conversationId,
			t.createdAt,
		),
	}),
);

export const messagePartTypeEnum = pgEnum("message_part_type", [
	"text",
	"file",
	"tool-call",
	"tool-result",
	"reasoning",
	"error",
	"citation",
	"citations",
	"suggestions",
]);

export const scheduledTasks = pgTable(
	"scheduled_tasks",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		agentId: uuid("agent_id")
			.notNull()
			.references(() => agents.id, { onDelete: "cascade" }),
		conversationId: uuid("conversation_id").references(() => conversations.id, {
			onDelete: "set null",
		}),
		title: varchar("title", { length: 255 }).notNull(),
		prompt: text("prompt").notNull(),
		frequency: scheduledTaskFrequencyEnum("frequency").notNull(),
		timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
		timeOfDay: varchar("time_of_day", { length: 5 }),
		intervalMinutes: integer("interval_minutes"),
		enabled: boolean("enabled").notNull().default(true),
		nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
		lastRunAt: timestamp("last_run_at", { withTimezone: true }),
		lastStatus: scheduledTaskStatusEnum("last_status")
			.notNull()
			.default("idle"),
		lastError: text("last_error"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => ({
		due: index("scheduled_tasks_due").on(t.enabled, t.nextRunAt),
		workspaceUser: index("scheduled_tasks_workspace_user").on(
			t.workspaceId,
			t.userId,
		),
	}),
);

export const messageParts = pgTable(
	"message_parts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		messageId: uuid("message_id")
			.notNull()
			.references(() => messages.id, { onDelete: "cascade" }),
		type: messagePartTypeEnum("type").notNull(),
		contentEncrypted: text("content_encrypted"),
		metadataJson: jsonb("metadata_json"),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => ({
		message: index("message_parts_message").on(t.messageId, t.sortOrder),
	}),
);

// ─── MCP Servers ───────────────────────────────────────────────────────

export const mcpTransportEnum = pgEnum("mcp_transport", [
	"stdio",
	"sse",
	"streamable-http",
]);

export const mcpServers = pgTable(
	"mcp_servers",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		name: varchar("name", { length: 255 }).notNull(),
		transport: mcpTransportEnum("transport").notNull(),
		command: text("command"),
		argsJson: jsonb("args_json"),
		url: text("url"),
		encryptedHeadersJson: jsonb("encrypted_headers_json"),
		encryptedEnvJson: jsonb("encrypted_env_json"),
		enabled: boolean("enabled").notNull().default(true),
		requireApproval: boolean("require_approval").notNull().default(false),
		healthStatus: varchar("health_status", { length: 16 }),
		lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
		createdById: uuid("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
	},
	(t) => ({
		workspace: index("mcp_servers_workspace").on(t.workspaceId),
	}),
);

export const mcpTools = pgTable(
	"mcp_tools",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		mcpServerId: uuid("mcp_server_id")
			.notNull()
			.references(() => mcpServers.id, { onDelete: "cascade" }),
		name: varchar("name", { length: 255 }).notNull(),
		description: text("description"),
		inputSchemaJson: jsonb("input_schema_json"),
		outputSchemaJson: jsonb("output_schema_json"),
		discoveredAt: timestamp("discovered_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		enabled: boolean("enabled").notNull().default(true),
		requireApproval: boolean("require_approval").notNull().default(false),
	},
	(t) => ({
		server: index("mcp_tools_server").on(t.mcpServerId),
	}),
);

export const workspaceApiKeys = pgTable(
	"workspace_api_keys",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		name: varchar("name", { length: 255 }).notNull(),
		keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
		keyHash: text("key_hash").notNull(),
		createdById: uuid("created_by_user_id")
			.notNull()
			.references(() => users.id),
		lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
		expiresAt: timestamp("expires_at", { withTimezone: true }),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => ({
		workspace: index("workspace_api_keys_workspace").on(t.workspaceId),
		keyHashUnique: uniqueIndex("workspace_api_keys_hash_unique").on(t.keyHash),
	}),
);

export const agentToolBindings = pgTable(
	"agent_tool_bindings",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		agentVersionId: uuid("agent_version_id")
			.notNull()
			.references(() => agentVersions.id, { onDelete: "cascade" }),
		toolSource: varchar("tool_source", { length: 16 }).notNull(),
		toolId: uuid("tool_id").notNull(),
		requireApproval: boolean("require_approval").notNull().default(false),
		riskLevel: varchar("risk_level", { length: 16 }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => ({
		agentVersionTool: uniqueIndex("agent_tool_bindings_version_tool_unique").on(
			t.agentVersionId,
			t.toolSource,
			t.toolId,
		),
	}),
);

export const toolInvocations = pgTable(
	"tool_invocations",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		conversationId: uuid("conversation_id").references(() => conversations.id),
		messageId: uuid("message_id").references(() => messages.id),
		toolSource: varchar("tool_source", { length: 16 }).notNull(),
		toolId: uuid("tool_id").notNull(),
		toolName: varchar("tool_name", { length: 255 }).notNull(),
		riskLevel: varchar("risk_level", { length: 16 }),
		inputJsonEncrypted: text("input_json_encrypted"),
		outputJsonEncrypted: text("output_json_encrypted"),
		status: varchar("status", { length: 24 }).notNull(),
		latencyMs: integer("latency_ms"),
		errorMessage: text("error_message"),
		approvedByUserId: uuid("approved_by_user_id"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
	},
	(t) => ({
		workspace: index("tool_invocations_workspace").on(t.workspaceId),
		conversation: index("tool_invocations_conversation").on(t.conversationId),
	}),
);

// ─── Knowledge / RAG ──────────────────────────────────────────────────

export const knowledgeBases = pgTable(
	"knowledge_bases",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		name: varchar("name", { length: 255 }).notNull(),
		description: text("description"),
		createdById: uuid("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
	},
	(t) => ({
		workspace: index("knowledge_bases_workspace").on(t.workspaceId),
	}),
);

export const documentSourceEnum = pgEnum("document_source_type", [
	"upload",
	"url",
	"text",
	"integration",
]);
export const documentStatusEnum = pgEnum("document_status", [
	"pending",
	"processing",
	"ready",
	"failed",
]);

export const documents = pgTable(
	"documents",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		knowledgeBaseId: uuid("knowledge_base_id")
			.notNull()
			.references(() => knowledgeBases.id, { onDelete: "cascade" }),
		title: varchar("title", { length: 512 }).notNull(),
		sourceType: documentSourceEnum("source_type").notNull(),
		objectStorageKey: text("object_storage_key"),
		mimeType: varchar("mime_type", { length: 128 }),
		status: documentStatusEnum("status").notNull().default("pending"),
		errorMessage: text("error_message"),
		createdById: uuid("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => ({
		knowledgeBase: index("documents_knowledge_base").on(t.knowledgeBaseId),
	}),
);

export const documentChunks = pgTable(
	"document_chunks",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		documentId: uuid("document_id")
			.notNull()
			.references(() => documents.id, { onDelete: "cascade" }),
		chunkIndex: integer("chunk_index").notNull(),
		contentEncrypted: text("content_encrypted"),
		tokenCount: integer("token_count"),
		metadataJson: jsonb("metadata_json"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => ({
		document: index("document_chunks_document").on(t.documentId, t.chunkIndex),
	}),
);

export const documentEmbeddings = pgTable(
	"document_embeddings",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		chunkId: uuid("chunk_id")
			.notNull()
			.references(() => documentChunks.id, { onDelete: "cascade" }),
		embedding: vector("embedding", { dimensions: 1536 }),
		embeddingModelId: varchar("embedding_model_id", { length: 255 }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => ({
		chunk: uniqueIndex("document_embeddings_chunk_unique").on(t.chunkId),
	}),
);

export const agentKnowledgeBindings = pgTable(
	"agent_knowledge_bindings",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		agentVersionId: uuid("agent_version_id")
			.notNull()
			.references(() => agentVersions.id, { onDelete: "cascade" }),
		knowledgeBaseId: uuid("knowledge_base_id")
			.notNull()
			.references(() => knowledgeBases.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => ({
		agentKnowledge: uniqueIndex("agent_knowledge_bindings_unique").on(
			t.agentVersionId,
			t.knowledgeBaseId,
		),
	}),
);

export const agentSkills = pgTable(
	"agent_skills",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		createdById: uuid("created_by_user_id")
			.notNull()
			.references(() => users.id),
		name: varchar("name", { length: 255 }).notNull(),
		description: text("description"),
		sourcePackage: text("source_package"),
		sourceSkillName: varchar("source_skill_name", { length: 255 }),
		installCommand: text("install_command"),
		markdownFilesJson: jsonb("markdown_files_json").notNull(),
		metadataJson: jsonb("metadata_json"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
	},
	(t) => ({
		workspace: index("agent_skills_workspace").on(t.workspaceId),
	}),
);

export const agentSkillBindings = pgTable(
	"agent_skill_bindings",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		agentVersionId: uuid("agent_version_id")
			.notNull()
			.references(() => agentVersions.id, { onDelete: "cascade" }),
		skillId: uuid("skill_id")
			.notNull()
			.references(() => agentSkills.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => ({
		agentVersionSkill: uniqueIndex("agent_skill_bindings_unique").on(
			t.agentVersionId,
			t.skillId,
		),
	}),
);

// ─── Marketplace ───────────────────────────────────────────────────────

export const marketplaceItemTypeEnum = pgEnum("marketplace_item_type", [
	"agent",
	"prompt_template",
	"tool_pack",
	"mcp_preset",
	"workflow_template",
	"knowledge_template",
	"provider_preset",
	"skill",
	"custom_tool",
]);

export const marketplaceItemStatusEnum = pgEnum("marketplace_item_status", [
	"draft",
	"pending_review",
	"published",
	"rejected",
	"suspended",
	"archived",
]);

export const marketplaceItemVisibilityEnum = pgEnum(
	"marketplace_item_visibility",
	["public", "private"],
);

export const marketplacePricingModelEnum = pgEnum("marketplace_pricing_model", [
	"free",
	"one_time",
	"subscription",
	"usage_based",
]);

export const marketplaceItems = pgTable(
	"marketplace_items",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		publisherUserId: uuid("publisher_user_id")
			.notNull()
			.references(() => users.id),
		publisherWorkspaceId: uuid("publisher_workspace_id").references(
			() => workspaces.id,
		),
		type: marketplaceItemTypeEnum("type").notNull(),
		slug: varchar("slug", { length: 128 }).notNull().unique(),
		name: varchar("name", { length: 255 }).notNull(),
		description: text("description"),
		visibility: marketplaceItemVisibilityEnum("visibility")
			.notNull()
			.default("private"),
		status: marketplaceItemStatusEnum("status").notNull().default("draft"),
		latestVersionId: uuid("latest_version_id"),
		installCount: integer("install_count").notNull().default(0),
		ratingAverage: text("rating_average"),
		pricingModel: marketplacePricingModelEnum("pricing_model")
			.notNull()
			.default("free"),
		verifiedPublisher: boolean("verified_publisher").notNull().default(false),
		isFeatured: boolean("is_featured").notNull().default(false),
		featuredOrder: integer("featured_order"),
		featuredAt: timestamp("featured_at", { withTimezone: true }),
		publishedAt: timestamp("published_at", { withTimezone: true }),
		totalDownloads: integer("total_downloads").notNull().default(0),
		tagsJson: jsonb("tags_json"),
		sourceResourceType: varchar("source_resource_type", { length: 32 }),
		sourceResourceId: uuid("source_resource_id"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => ({
		featuredIdx: index("marketplace_items_featured").on(
			t.isFeatured,
			t.featuredOrder,
		),
		typeIdx: index("marketplace_items_type").on(t.type),
		publishedIdx: index("marketplace_items_published").on(
			t.status,
			t.visibility,
			t.publishedAt,
		),
		sourceResourceIdx: index("marketplace_items_source_resource").on(
			t.sourceResourceType,
			t.sourceResourceId,
		),
	}),
);

export const marketplaceItemVersions = pgTable(
	"marketplace_item_versions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		itemId: uuid("item_id")
			.notNull()
			.references(() => marketplaceItems.id, { onDelete: "cascade" }),
		version: varchar("version", { length: 32 }).notNull(),
		manifestJson: jsonb("manifest_json").notNull(),
		changelog: text("changelog"),
		compatibilityJson: jsonb("compatibility_json"),
		requestedPermissionsJson: jsonb("requested_permissions_json"),
		securityReviewStatus: varchar("security_review_status", { length: 16 }),
		createdById: uuid("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => ({
		itemVersion: uniqueIndex(
			"marketplace_item_versions_item_version_unique",
		).on(t.itemId, t.version),
	}),
);

export const marketplaceInstalls = pgTable(
	"marketplace_installs",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		itemId: uuid("item_id")
			.notNull()
			.references(() => marketplaceItems.id),
		versionId: uuid("version_id")
			.notNull()
			.references(() => marketplaceItemVersions.id),
		installedByUserId: uuid("installed_by_user_id")
			.notNull()
			.references(() => users.id),
		installedResourceType: varchar("installed_resource_type", {
			length: 32,
		}),
		installedResourceId: uuid("installed_resource_id"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => ({
		workspaceItem: index("marketplace_installs_workspace_item").on(
			t.workspaceId,
			t.itemId,
		),
	}),
);

export const marketplaceReviews = pgTable("marketplace_reviews", {
	id: uuid("id").primaryKey().defaultRandom(),
	itemId: uuid("item_id")
		.notNull()
		.references(() => marketplaceItems.id, { onDelete: "cascade" }),
	versionId: uuid("version_id").references(() => marketplaceItemVersions.id),
	reviewerUserId: uuid("reviewer_user_id")
		.notNull()
		.references(() => users.id),
	status: varchar("status", { length: 24 }).notNull(),
	notes: text("notes"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const marketplaceRatings = pgTable(
	"marketplace_ratings",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		itemId: uuid("item_id")
			.notNull()
			.references(() => marketplaceItems.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id),
		rating: integer("rating").notNull(),
		review: text("review"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => ({
		itemUser: uniqueIndex("marketplace_ratings_item_user_unique").on(
			t.itemId,
			t.userId,
		),
	}),
);

export const marketplaceReports = pgTable("marketplace_reports", {
	id: uuid("id").primaryKey().defaultRandom(),
	itemId: uuid("item_id")
		.notNull()
		.references(() => marketplaceItems.id, { onDelete: "cascade" }),
	reporterUserId: uuid("reporter_user_id")
		.notNull()
		.references(() => users.id),
	reason: text("reason").notNull(),
	status: varchar("status", { length: 16 }).notNull().default("pending"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

// ─── Marketplace Shares ────────────────────────────────────────────────

export const marketplaceItemShares = pgTable(
	"marketplace_item_shares",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		itemId: uuid("item_id")
			.notNull()
			.references(() => marketplaceItems.id, { onDelete: "cascade" }),
		sharedWithUserId: uuid("shared_with_user_id")
			.notNull()
			.references(() => users.id),
		sharedAt: timestamp("shared_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => ({
		itemShare: uniqueIndex("marketplace_item_shares_item_user_unique").on(
			t.itemId,
			t.sharedWithUserId,
		),
	}),
);

// ─── Custom Tool Builder ───────────────────────────────────────────────

export const customToolStatusEnum = pgEnum("custom_tool_status", [
	"draft",
	"awaiting_secrets",
	"workflow_created",
	"active",
	"failed",
	"disabled",
]);

export const customTools = pgTable(
	"custom_tools",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		createdById: uuid("created_by_user_id")
			.notNull()
			.references(() => users.id),
		name: varchar("name", { length: 255 }).notNull(),
		description: text("description"),
		n8nWorkflowId: varchar("n8n_workflow_id", { length: 255 }),
		n8nWorkflowUrl: text("n8n_workflow_url"),
		status: customToolStatusEnum("status").notNull().default("draft"),
		inputSchemaJson: jsonb("input_schema_json"),
		outputSchemaJson: jsonb("output_schema_json"),
		metadataJson: jsonb("metadata_json"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
	},
	(t) => ({
		workspace: index("custom_tools_workspace").on(t.workspaceId),
	}),
);

export const customToolSecretRequests = pgTable(
	"custom_tool_secret_requests",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id),
		customToolId: uuid("custom_tool_id").references(() => customTools.id, {
			onDelete: "set null",
		}),
		title: varchar("title", { length: 255 }).notNull(),
		description: text("description"),
		fieldsJson: jsonb("fields_json").notNull(),
		status: varchar("status", { length: 24 }).notNull().default("pending"),
		credentialRefId: uuid("credential_ref_id"),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		submittedAt: timestamp("submitted_at", { withTimezone: true }),
	},
	(t) => ({
		workspace: index("custom_tool_secret_requests_workspace").on(t.workspaceId),
		user: index("custom_tool_secret_requests_user").on(t.userId),
	}),
);

export const customToolCredentialRefs = pgTable(
	"custom_tool_credential_refs",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id),
		provider: varchar("provider", { length: 128 }).notNull(),
		label: varchar("label", { length: 255 }).notNull(),
		n8nCredentialId: varchar("n8n_credential_id", { length: 255 }),
		encryptedPayload: text("encrypted_payload").notNull(),
		metadataJson: jsonb("metadata_json"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => ({
		workspace: index("custom_tool_credential_refs_workspace").on(t.workspaceId),
		user: index("custom_tool_credential_refs_user").on(t.userId),
	}),
);

// ─── Relations ─────────────────────────────────────────────────────────

export const userRelations = relations(users, ({ many }) => ({
	sessions: many(sessions),
	accounts: many(accounts),
	workspaceMembers: many(workspaceMembers),
}));

export const sessionRelations = relations(sessions, ({ one }) => ({
	user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const workspaceRelations = relations(workspaces, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [workspaces.organizationId],
		references: [organizations.id],
	}),
	creator: one(users, {
		fields: [workspaces.createdById],
		references: [users.id],
	}),
	members: many(workspaceMembers),
	agents: many(agents),
	conversationFolders: many(conversationFolders),
	providers: many(aiProviders),
	mcpServers: many(mcpServers),
	knowledgeBases: many(knowledgeBases),
	skills: many(agentSkills),
}));

export const agentRelations = relations(agents, ({ one, many }) => ({
	workspace: one(workspaces, {
		fields: [agents.workspaceId],
		references: [workspaces.id],
	}),
	creator: one(users, {
		fields: [agents.createdById],
		references: [users.id],
	}),
	activeVersion: one(agentVersions, {
		fields: [agents.activeVersionId],
		references: [agentVersions.id],
	}),
	versions: many(agentVersions),
}));

export const agentVersionRelations = relations(
	agentVersions,
	({ one, many }) => ({
		agent: one(agents, {
			fields: [agentVersions.agentId],
			references: [agents.id],
		}),
		creator: one(users, {
			fields: [agentVersions.createdById],
			references: [users.id],
		}),
		toolBindings: many(agentToolBindings),
		knowledgeBindings: many(agentKnowledgeBindings),
		skillBindings: many(agentSkillBindings),
	}),
);

export const conversationFolderRelations = relations(
	conversationFolders,
	({ one, many }) => ({
		workspace: one(workspaces, {
			fields: [conversationFolders.workspaceId],
			references: [workspaces.id],
		}),
		user: one(users, {
			fields: [conversationFolders.userId],
			references: [users.id],
		}),
		conversations: many(conversations),
	}),
);

export const conversationRelations = relations(
	conversations,
	({ one, many }) => ({
		workspace: one(workspaces, {
			fields: [conversations.workspaceId],
			references: [workspaces.id],
		}),
		agent: one(agents, {
			fields: [conversations.agentId],
			references: [agents.id],
		}),
		agentVersion: one(agentVersions, {
			fields: [conversations.agentVersionId],
			references: [agentVersions.id],
		}),
		user: one(users, {
			fields: [conversations.userId],
			references: [users.id],
		}),
		folder: one(conversationFolders, {
			fields: [conversations.folderId],
			references: [conversationFolders.id],
		}),
		messages: many(messages),
	}),
);

export const messageRelations = relations(messages, ({ one, many }) => ({
	conversation: one(conversations, {
		fields: [messages.conversationId],
		references: [conversations.id],
	}),
	parts: many(messageParts),
}));

export const agentSkillRelations = relations(agentSkills, ({ one, many }) => ({
	workspace: one(workspaces, {
		fields: [agentSkills.workspaceId],
		references: [workspaces.id],
	}),
	creator: one(users, {
		fields: [agentSkills.createdById],
		references: [users.id],
	}),
	bindings: many(agentSkillBindings),
}));

export const agentSkillBindingRelations = relations(
	agentSkillBindings,
	({ one }) => ({
		agentVersion: one(agentVersions, {
			fields: [agentSkillBindings.agentVersionId],
			references: [agentVersions.id],
		}),
		skill: one(agentSkills, {
			fields: [agentSkillBindings.skillId],
			references: [agentSkills.id],
		}),
	}),
);
