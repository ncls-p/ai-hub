import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { agents } from "./agents";
import { users } from "./auth";
import { workspaces } from "./workspace";

const CREATED_AT_COLUMN = "created_at";
const UPDATED_AT_COLUMN = "updated_at";
const CASCADE_ACTION = "cascade";
const SET_NULL_ACTION = "set null";
const WORKSPACE_ID_COLUMN = "workspace_id";
const USER_ID_COLUMN = "user_id";
const STATUS_COLUMN = "status";

// ─── Conversations & Messages ──────────────────────────────────────────

export const conversationStatusEnum = pgEnum("conversation_status", [
  "active",
  "archived",
  "deleted",
]);

export const conversationShareContinuationModeEnum = pgEnum(
  "conversation_share_continuation_mode",
  ["shared", "fork"],
);

export const conversationFolders = pgTable(
  "conversation_folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Historical execution context; personal history survives project deletion.
    workspaceId: uuid(WORKSPACE_ID_COLUMN).notNull(),
    userId: uuid(USER_ID_COLUMN)
      .notNull()
      .references(() => users.id, { onDelete: CASCADE_ACTION }),
    name: varchar("name", { length: 160 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("conversation_folders_user_workspace_order").on(
      t.userId,
      t.workspaceId,
      t.archivedAt,
      t.sortOrder,
      t.createdAt,
      t.id,
    ),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Historical execution context; personal history survives project deletion.
    workspaceId: uuid(WORKSPACE_ID_COLUMN).notNull(),
    billingWorkspaceId: uuid("billing_workspace_id"),
    agentId: uuid("agent_id").notNull(),
    agentVersionId: uuid("agent_version_id"),
    userId: uuid(USER_ID_COLUMN)
      .notNull()
      .references(() => users.id),
    title: varchar("title", { length: 512 }).notNull().default("New Chat"),
    status: conversationStatusEnum(STATUS_COLUMN).notNull().default("active"),
    folderId: uuid("folder_id").references(() => conversationFolders.id, {
      onDelete: SET_NULL_ACTION,
    }),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    sidebarOrder: integer("sidebar_order"),
    parentConversationId: uuid("parent_conversation_id"),
    branchFromMessageId: uuid("branch_from_message_id"),
    branchKind: varchar("branch_kind", { length: 32 }),
    summaryEncrypted: text("summary_encrypted"),
    summaryThroughMessageId: uuid("summary_through_message_id"),
    summaryTokenCount: integer("summary_token_count"),
    summaryUpdatedAt: timestamp("summary_updated_at", { withTimezone: true }),
    isEphemeral: boolean("is_ephemeral").notNull().default(false),
    ephemeralTtlMinutes: integer("ephemeral_ttl_minutes")
      .notNull()
      .default(24 * 60),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    publicShareId: uuid("public_share_id"),
    publicShareIncludesFiles: boolean("public_share_includes_files")
      .notNull()
      .default(false),
    publicSharedAt: timestamp("public_shared_at", { withTimezone: true }),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("conversations_workspace_agent").on(t.workspaceId, t.agentId),
    index("conversations_user").on(t.userId),
    index("conversations_user_workspace_updated").on(
      t.userId,
      t.workspaceId,
      t.status,
      t.archivedAt,
      t.updatedAt,
      t.id,
    ),
    index("conversations_sidebar_order").on(
      t.userId,
      t.workspaceId,
      t.folderId,
      t.pinnedAt,
      t.sidebarOrder,
      t.updatedAt,
      t.id,
    ),
    uniqueIndex("conversations_public_share_id_unique").on(t.publicShareId),
    uniqueIndex("conversations_one_shared_fork_per_recipient")
      .on(t.parentConversationId, t.userId)
      .where(
        sql`${t.branchKind} = 'shared_continuation' AND ${t.status} = 'active' AND ${t.archivedAt} IS NULL`,
      ),
    index("conversations_ephemeral_expiry").on(t.isEphemeral, t.expiresAt),
  ],
);

export const conversationShares = pgTable(
  "conversation_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: CASCADE_ACTION }),
    sharedByUserId: uuid("shared_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: CASCADE_ACTION }),
    sharedWithUserId: uuid("shared_with_user_id")
      .notNull()
      .references(() => users.id, { onDelete: CASCADE_ACTION }),
    canContinue: boolean("can_continue").notNull().default(false),
    continuationMode: conversationShareContinuationModeEnum("continuation_mode")
      .notNull()
      .default("fork"),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("conversation_shares_conversation_user_unique").on(
      t.conversationId,
      t.sharedWithUserId,
    ),
    index("conversation_shares_recipient").on(
      t.sharedWithUserId,
      t.conversationId,
    ),
  ],
);

export const conversationReadStates = pgTable(
  "conversation_read_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: CASCADE_ACTION }),
    userId: uuid(USER_ID_COLUMN)
      .notNull()
      .references(() => users.id, { onDelete: CASCADE_ACTION }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("conversation_read_states_conversation_user_unique").on(
      t.conversationId,
      t.userId,
    ),
    index("conversation_read_states_user_conversation").on(
      t.userId,
      t.conversationId,
    ),
  ],
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
    status: messageStatusEnum(STATUS_COLUMN).notNull().default("pending"),
    tokenInput: integer("token_input"),
    tokenOutput: integer("token_output"),
    costUsd: text("cost_usd"),
    modelId: varchar("model_id", { length: 255 }),
    providerId: uuid("provider_id"),
    streamGenerationId: uuid("stream_generation_id"),
    streamStartedAt: timestamp("stream_started_at", { withTimezone: true }),
    streamHeartbeatAt: timestamp("stream_heartbeat_at", {
      withTimezone: true,
    }),
    streamLeaseExpiresAt: timestamp("stream_lease_expires_at", {
      withTimezone: true,
    }),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("messages_conversation").on(t.conversationId),
    index("messages_conversation_created").on(t.conversationId, t.createdAt),
    index("messages_active_stream_lease").on(t.status, t.streamLeaseExpiresAt),
    uniqueIndex("messages_one_active_assistant_per_conversation")
      .on(t.conversationId)
      .where(
        sql`${t.role} = 'assistant' AND ${t.status} IN ('pending', 'streaming')`,
      ),
  ],
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
  "impact",
  "summary",
]);

export const scheduledTasks = pgTable(
  "scheduled_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid(WORKSPACE_ID_COLUMN)
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
    userId: uuid(USER_ID_COLUMN)
      .notNull()
      .references(() => users.id, { onDelete: CASCADE_ACTION }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: CASCADE_ACTION }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: SET_NULL_ACTION,
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
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("scheduled_tasks_due").on(t.enabled, t.nextRunAt),
    index("scheduled_tasks_workspace_user").on(t.workspaceId, t.userId),
  ],
);

export const messageParts = pgTable(
  "message_parts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: CASCADE_ACTION }),
    type: messagePartTypeEnum("type").notNull(),
    contentEncrypted: text("content_encrypted"),
    metadataJson: jsonb("metadata_json"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("message_parts_message").on(t.messageId, t.sortOrder),
    index("message_parts_attachment_reference")
      .on(sql`(${t.metadataJson}->>'id')`)
      .where(sql`${t.type} = 'file'`),
    index("message_parts_code_reference")
      .on(sql`(${t.metadataJson}->>'projectId')`)
      .where(sql`${t.type} = 'file'`),
  ],
);
