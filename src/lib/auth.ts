import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { db, schema } from "@/server/infrastructure/db";
import { env } from "@/lib/env";

const betterAuthSchema = {
	user: schema.users,
	session: schema.sessions,
	account: schema.accounts,
	verification: schema.verifications,
};

const developmentOrigins = [
	"http://localhost:3000",
	"http://127.0.0.1:3000",
	"http://192.168.1.152:3000",
	"http://100.90.215.7:3000",
	"http://100.98.140.47:3000",
];

function getTrustedOrigins() {
	const configuredOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);

	const origins = new Set([env.BETTER_AUTH_URL, ...configuredOrigins]);
	if (env.NODE_ENV !== "production") {
		developmentOrigins.forEach((origin) => origins.add(origin));
	}

	return Array.from(origins);
}

export const auth = betterAuth({
	appId: "ai-hub",
	baseURL: env.BETTER_AUTH_URL,
	trustedOrigins: getTrustedOrigins(),
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
