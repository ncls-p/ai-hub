import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

const databaseSsl =
  env.NODE_ENV === "production" &&
  env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "disable"
    ? { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
    : undefined;

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: databaseSsl,
});

export const db = drizzle(pool, { schema });
export { schema };
