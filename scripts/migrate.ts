import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "../src/server/infrastructure/db";
import { logger } from "../src/lib/logger";

async function run() {
	try {
		logger.info("Running migrations...");
		await migrate(db, {
			migrationsFolder: "./src/server/infrastructure/db/migrations",
		});
		logger.info("Migrations completed successfully.");
		process.exit(0);
	} catch (error) {
		logger.error("Migration failed", { error: (error as Error).message });
		process.exit(1);
	}
}

run();
