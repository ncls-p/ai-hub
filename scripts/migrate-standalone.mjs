#!/usr/bin/env node

import path from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	console.error("DATABASE_URL is required to run migrations.");
	process.exit(1);
}

const sslRejectUnauthorized =
	process.env.DATABASE_SSL_REJECT_UNAUTHORIZED ?? "true";
const databaseSsl =
	process.env.NODE_ENV === "production" && sslRejectUnauthorized !== "disable"
		? { rejectUnauthorized: sslRejectUnauthorized !== "false" }
		: undefined;

const pool = new Pool({
	connectionString: databaseUrl,
	ssl: databaseSsl,
});

const db = drizzle(pool);
const migrationsFolder = path.join(
	process.cwd(),
	"src/server/infrastructure/db/migrations",
);

try {
	console.info(`Running migrations from ${migrationsFolder}...`);
	await migrate(db, { migrationsFolder });
	console.info("Migrations completed successfully.");
} catch (error) {
	console.error("Migration failed", error);
	process.exitCode = 1;
} finally {
	await pool.end();
}
