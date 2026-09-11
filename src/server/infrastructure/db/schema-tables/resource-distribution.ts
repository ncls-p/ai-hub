import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./workspace";
import { users } from "./auth";

/** Explicit administrator grants. Resource ownership and credentials stay at source. */
export const resourceOrganizationShares = pgTable(
  "resource_organization_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rootResourceType: varchar("root_resource_type", { length: 32 }).notNull(),
    rootResourceId: uuid("root_resource_id").notNull(),
    resourceType: varchar("resource_type", { length: 32 }).notNull(),
    resourceId: uuid("resource_id").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("resource_org_share_unique").on(
      table.resourceType,
      table.resourceId,
      table.organizationId,
      table.rootResourceType,
      table.rootResourceId,
    ),
  ],
);
