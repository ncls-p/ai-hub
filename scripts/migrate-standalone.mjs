import nextEnv from "@next/env";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

nextEnv.loadEnvConfig(process.cwd());

const MIGRATION_LOCK_ID = 20260615;

function databaseSsl() {
	if (process.env.NODE_ENV !== "production") return undefined;
	const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
	if (rejectUnauthorized === "disable") return undefined;
	return { rejectUnauthorized: rejectUnauthorized !== "false" };
}

async function run() {
	if (!process.env.DATABASE_URL) {
		throw new Error("DATABASE_URL is required to run migrations");
	}

	const pool = new Pool({
		connectionString: process.env.DATABASE_URL,
		ssl: databaseSsl(),
	});
	const db = drizzle(pool);

	try {
		console.log("Running database migrations...");
		await pool.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
		try {
			await migrate(db, {
				migrationsFolder: "./src/server/infrastructure/db/migrations",
			});
		} finally {
			await pool.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
		}
		console.log("Database migrations completed successfully.");
	} finally {
		await pool.end();
	}
}

run().catch((error) => {
	console.error("Database migration failed", error);
	process.exit(1);
});
