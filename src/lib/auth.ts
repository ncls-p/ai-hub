import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { db, schema } from "@/server/infrastructure/db";
import { env } from "@/lib/env";

const betterAuthSchema = {
	user: schema.users,
	session: schema.sessions,
	account: schema.accounts,
	verification: schema.verifications,
};

export const auth = betterAuth({
	appId: "ai-hub",
	baseURL: env.BETTER_AUTH_URL,
	trustedOrigins: env.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map((origin) =>
		origin.trim(),
	),
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: betterAuthSchema,
		camelCase: true,
		transaction: true,
	}),
	advanced: {
		database: {
			generateId: "uuid",
		},
	},
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 8,
		maxPasswordLength: 128,
	},
	plugins: [admin(), nextCookies()],
	session: {
		expiresIn: 60 * 60 * 24 * 7,
		updateAge: 60 * 60 * 24,
	},
});
