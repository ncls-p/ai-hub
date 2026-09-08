import { ROLE_BINDING_RESOURCE_TYPES } from "@/server/domain/entities/access-resource";
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

const CREATED_AT_COLUMN = "created_at";
const UPDATED_AT_COLUMN = "updated_at";
const CASCADE_ACTION = "cascade";
const CREATED_BY_USER_ID_COLUMN = "created_by_user_id";

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
    createdById: uuid(CREATED_BY_USER_ID_COLUMN).references(() => users.id),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("roles_system_name_unique")
      .on(t.scopeType, t.name)
      .where(sql`${t.isSystem} = true`),
    uniqueIndex("roles_owner_name_unique")
      .on(t.ownerResourceType, t.ownerResourceId, t.name)
      .where(sql`${t.isSystem} = false`),
  ],
);

export const principalTypeEnum = pgEnum("principal_type", [
  "user",
  "group",
  "service_account",
  "api_key",
]);
export const roleBindingResourceTypeEnum = pgEnum(
  "role_binding_resource_type",
  ROLE_BINDING_RESOURCE_TYPES,
);

export const roleBindings = pgTable(
  "role_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    principalType: principalTypeEnum("principal_type").notNull(),
    principalId: uuid("principal_id").notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: CASCADE_ACTION }),
    resourceType: roleBindingResourceTypeEnum("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    conditionJson: jsonb("condition_json"),
    grantSource: text("grant_source").notNull().default("direct"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdById: uuid(CREATED_BY_USER_ID_COLUMN).references(() => users.id),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("role_bindings_principal_role_resource").on(
      t.principalType,
      t.principalId,
      t.resourceType,
      t.resourceId,
    ),
    uniqueIndex("role_bindings_unique_assignment").on(
      t.principalType,
      t.principalId,
      t.roleId,
      t.resourceType,
      t.resourceId,
      t.grantSource,
    ),
  ],
);
