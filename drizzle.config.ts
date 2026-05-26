import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	throw new Error("DATABASE_URL is required for Drizzle commands");
}

export default defineConfig({
	schema: "./src/server/infrastructure/db/schema.ts",
	out: "./src/server/infrastructure/db/migrations",
	dialect: "postgresql",
	dbCredentials: {
		url: databaseUrl,
	},
});
