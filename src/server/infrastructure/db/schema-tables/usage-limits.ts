import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  bigint,
  numeric,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
export const usageLimits = pgTable(
  "usage_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: varchar("subject_type", { length: 20 }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    providerId: uuid("provider_id"),
    modelId: uuid("model_id"),
    period: varchar("period", { length: 10 }).notNull(),
    tokenLimit: bigint("token_limit", { mode: "number" }),
    requestLimit: bigint("request_limit", { mode: "number" }),
    costLimitUsd: numeric("cost_limit_usd", { precision: 20, scale: 8 }),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("usage_limits_subject").on(table.subjectType, table.subjectId),
  ],
);
export const usageLimitCharges = pgTable(
  "usage_limit_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    limitId: uuid("limit_id")
      .notNull()
      .references(() => usageLimits.id, { onDelete: "cascade" }),
    invocationId: uuid("invocation_id").notNull(),
    userId: uuid("user_id").notNull(),
    tokens: bigint("tokens", { mode: "number" }).notNull(),
    costUsd: numeric("cost_usd", { precision: 20, scale: 8 }).notNull(),
    status: varchar("status", { length: 12 }).notNull().default("reserved"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("usage_limit_invocation").on(table.limitId, table.invocationId),
    index("usage_limit_period_charges").on(table.limitId, table.createdAt),
  ],
);
