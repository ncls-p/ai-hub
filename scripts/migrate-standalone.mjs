import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

async function run() {
	const dbUrl = process.env.DATABASE_URL;
	if (!dbUrl) {
		console.error("DATABASE_URL is not set");
		process.exit(1);
	}

	const client = new Client({ connectionString: dbUrl });
	await client.connect();
	const db = drizzle(client);

	try {
		console.log("Running migrations...");
		await migrate(db, {
			migrationsFolder: "./src/server/infrastructure/db/migrations",
		});
		console.log("Migrations completed successfully.");
		process.exit(0);
	} catch (error) {
		console.error("Migration failed", error);
		process.exit(1);
	} finally {
		await client.end();
	}
}

void run();
