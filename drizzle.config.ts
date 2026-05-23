import { defineConfig } from "drizzle-kit";
import { env } from "./src/lib/env";

export default defineConfig({
	schema: "./src/server/infrastructure/db/schema.ts",
	out: "./src/server/infrastructure/db/migrations",
	dialect: "postgresql",
	dbCredentials: {
		url: env.DATABASE_URL,
	},
});
