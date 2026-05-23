import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

const pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl:
        env.NODE_ENV === "production"
            ? { rejectUnauthorized: false }
            : undefined,
});

export const db = drizzle(pool, { schema });
export { schema };
