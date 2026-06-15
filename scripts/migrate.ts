import * as nextEnv from "@next/env";
import { migrate } from "drizzle-orm/node-postgres/migrator";

nextEnv.loadEnvConfig(process.cwd());

async function run() {
	const [{ db }, { logger }] = await Promise.all([
		import("../src/server/infrastructure/db"),
		import("../src/lib/logger"),
	]);

	try {
		logger.info("Running migrations...");
		await migrate(db, {
			migrationsFolder: "./src/server/infrastructure/db/migrations",
		});
		logger.info("Migrations completed successfully.");
		process.exit(0);
	} catch (error) {
		logger.error("Migration failed", { error: (error as Error).message });
		throw error;
	}
}

void run().catch(() => process.exit(1));
