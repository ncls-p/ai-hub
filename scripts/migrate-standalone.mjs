import * as nextEnv from "@next/env";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());

const { Pool } = pg;

function databaseSslOptions() {
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "disable"
  ) {
    return undefined;
  }

  return {
    rejectUnauthorized:
      process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
  };
}

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to run migrations.");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: databaseSslOptions(),
  });
  const db = drizzle(pool);

  try {
    console.info("Running migrations...");
    await migrate(db, {
      migrationsFolder: "./src/server/infrastructure/db/migrations",
    });
    console.info("Migrations completed successfully.");
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error("Migration failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
