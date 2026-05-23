import { z } from "zod";

const encryptionKeySchema = z
	.string()
	.length(64)
	.regex(/^[0-9a-fA-F]{64}$/, "must be a 32-byte hex string");

const placeholderSecret = (value: string) => {
	const normalized = value.toLowerCase();
	return [
		"dev-secret",
		"change-in-production",
		"test-secret",
		"minioadmin",
		"changeme",
	].some((placeholder) => normalized.includes(placeholder));
};

export const baseEnvSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	BETTER_AUTH_SECRET: z.string().min(1),
	BETTER_AUTH_URL: z.url(),
	BETTER_AUTH_TRUSTED_ORIGINS: z.string().min(1),
	DATABASE_URL: z.url(),
	APP_ENCRYPTION_KEY: encryptionKeySchema,
	APP_ENCRYPTION_KEY_ID: z.string().min(1).default("default"),
	DRAGONFLY_URL: z.string().min(1).default("redis://localhost:6379"),
	DRAGONFLY_PASSWORD: z.string().default(""),
	OBJECT_STORAGE_ENDPOINT: z.url().default("http://localhost:3900"),
	OBJECT_STORAGE_REGION: z.string().min(1).default("garage"),
	OBJECT_STORAGE_BUCKET: z.string().min(1),
	OBJECT_STORAGE_ACCESS_KEY_ID: z.string().min(1),
	OBJECT_STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
	OBJECT_STORAGE_FORCE_PATH_STYLE: z.string().default("true"),
});

export const productionEnvSchema = baseEnvSchema.extend({
	NODE_ENV: z.literal("production"),
	BETTER_AUTH_SECRET: z
		.string()
		.min(32)
		.refine(
			(value) => !placeholderSecret(value),
			"must not use development or placeholder secrets",
		),
	APP_ENCRYPTION_KEY: encryptionKeySchema.refine(
		(value) => !/^0+$/.test(value),
		"must not use the all-zero development encryption key",
	),
	DRAGONFLY_PASSWORD: z
		.string()
		.min(16)
		.refine(
			(value) => !placeholderSecret(value),
			"must not use development or placeholder secrets",
		),
	OBJECT_STORAGE_ACCESS_KEY_ID: z
		.string()
		.min(1)
		.refine(
			(value) => !placeholderSecret(value),
			"must not use development or placeholder access keys",
		),
	OBJECT_STORAGE_SECRET_ACCESS_KEY: z
		.string()
		.min(16)
		.refine(
			(value) => !placeholderSecret(value),
			"must not use development or placeholder secrets",
		),
});

export type AppEnv = z.infer<typeof baseEnvSchema>;

type EnvSource = Record<string, string | undefined>;

function readEnv(source: EnvSource): Record<string, string> {
	return {
		NODE_ENV: source.NODE_ENV || "development",
		BETTER_AUTH_SECRET: source.BETTER_AUTH_SECRET || "",
		BETTER_AUTH_URL: source.BETTER_AUTH_URL || "",
		BETTER_AUTH_TRUSTED_ORIGINS: source.BETTER_AUTH_TRUSTED_ORIGINS || "",
		DATABASE_URL: source.DATABASE_URL || "",
		APP_ENCRYPTION_KEY: source.APP_ENCRYPTION_KEY || "",
		APP_ENCRYPTION_KEY_ID: source.APP_ENCRYPTION_KEY_ID || "default",
		DRAGONFLY_URL: source.DRAGONFLY_URL || "redis://localhost:6379",
		DRAGONFLY_PASSWORD: source.DRAGONFLY_PASSWORD || "",
		OBJECT_STORAGE_ENDPOINT:
			source.OBJECT_STORAGE_ENDPOINT || "http://localhost:3900",
		OBJECT_STORAGE_REGION: source.OBJECT_STORAGE_REGION || "garage",
		OBJECT_STORAGE_BUCKET: source.OBJECT_STORAGE_BUCKET || "",
		OBJECT_STORAGE_ACCESS_KEY_ID: source.OBJECT_STORAGE_ACCESS_KEY_ID || "",
		OBJECT_STORAGE_SECRET_ACCESS_KEY:
			source.OBJECT_STORAGE_SECRET_ACCESS_KEY || "",
		OBJECT_STORAGE_FORCE_PATH_STYLE:
			source.OBJECT_STORAGE_FORCE_PATH_STYLE || "true",
	};
}

export function validateEnvValues(source: EnvSource = process.env): AppEnv {
	const env = readEnv(source);
	const result =
		env.NODE_ENV === "production"
			? productionEnvSchema.safeParse(env)
			: baseEnvSchema.safeParse(env);

	if (!result.success) {
		const issues = result.error.issues
			.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
			.join("\n");
		const prefix =
			env.NODE_ENV === "production"
				? "Production environment validation failed"
				: "Environment validation failed";
		throw new Error(
			`${prefix}. Missing or invalid required env vars:\n${issues}`,
		);
	}

	return result.data;
}

export const env = validateEnvValues();
