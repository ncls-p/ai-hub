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
    "rustfsadmin",
    "changeme",
  ].some((placeholder) => normalized.includes(placeholder));
};

const runtimeEnvSchema = z.enum(["development", "production", "test"]);

export const baseEnvSchema = z.object({
  NODE_ENV: runtimeEnvSchema.default("development"),
  APP_ENV: runtimeEnvSchema.optional(),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_TRUSTED_ORIGINS: z.string().min(1),
  DATABASE_URL: z.url(),
  APP_ENCRYPTION_KEY: encryptionKeySchema,
  APP_ENCRYPTION_KEY_ID: z.string().min(1).default("default"),
  DRAGONFLY_URL: z.string().min(1).default("redis://localhost:6379"),
  DRAGONFLY_PASSWORD: z.string().default(""),
  OBJECT_STORAGE_ENDPOINT: z.url().default("http://localhost:3900"),
  OBJECT_STORAGE_REGION: z.string().min(1).default("us-east-1"),
  OBJECT_STORAGE_BUCKET: z.string().min(1),
  OBJECT_STORAGE_ACCESS_KEY_ID: z.string().min(1),
  OBJECT_STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
  OBJECT_STORAGE_FORCE_PATH_STYLE: z.string().default("true"),
  SEARXNG_URL: z.url().default("http://localhost:18088"),
  OPENSANDBOX_DOMAIN: z.string().min(1).default("localhost:18090"),
  OPENSANDBOX_PROTOCOL: z.enum(["http", "https"]).default("http"),
  OPENSANDBOX_API_KEY: z.string().optional(),
  OPENSANDBOX_IMAGE: z.string().min(1).default("ai-hub/code-interpreter:local"),
  OPENSANDBOX_USE_SERVER_PROXY: z.string().default("false"),
  ALLOW_PERSONAL_WORKSPACES: z.string().default("true"),
  DATABASE_SSL_REJECT_UNAUTHORIZED: z.string().default("true"),
  WORKSPACE_MONTHLY_TOKEN_LIMIT: z.string().optional(),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_SLUG: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
});

export const productionEnvSchema = baseEnvSchema.extend({
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

const ENV_DEFAULTS: EnvSource = {
  NODE_ENV: "development",
  APP_ENV: undefined,
  BETTER_AUTH_SECRET: "",
  BETTER_AUTH_URL: "",
  BETTER_AUTH_TRUSTED_ORIGINS: "",
  DATABASE_URL: "",
  APP_ENCRYPTION_KEY: "",
  APP_ENCRYPTION_KEY_ID: "default",
  DRAGONFLY_URL: "redis://localhost:6379",
  DRAGONFLY_PASSWORD: "",
  OBJECT_STORAGE_ENDPOINT: "http://localhost:3900",
  OBJECT_STORAGE_REGION: "us-east-1",
  OBJECT_STORAGE_BUCKET: "",
  OBJECT_STORAGE_ACCESS_KEY_ID: "",
  OBJECT_STORAGE_SECRET_ACCESS_KEY: "",
  OBJECT_STORAGE_FORCE_PATH_STYLE: "true",
  SEARXNG_URL: "http://localhost:18088",
  OPENSANDBOX_DOMAIN: "localhost:18090",
  OPENSANDBOX_PROTOCOL: "http",
  OPENSANDBOX_API_KEY: undefined,
  OPENSANDBOX_IMAGE: "ai-hub/code-interpreter:local",
  OPENSANDBOX_USE_SERVER_PROXY: "false",
  ALLOW_PERSONAL_WORKSPACES: "true",
  DATABASE_SSL_REJECT_UNAUTHORIZED: "true",
  WORKSPACE_MONTHLY_TOKEN_LIMIT: undefined,
  GITHUB_APP_ID: undefined,
  GITHUB_APP_SLUG: undefined,
  GITHUB_APP_PRIVATE_KEY: undefined,
};

function readEnv(source: EnvSource): EnvSource {
  return Object.fromEntries(
    Object.entries(ENV_DEFAULTS).map(([key, fallback]) => [
      key,
      source[key] || fallback,
    ]),
  );
}

function shouldUseProductionValidation(env: EnvSource) {
  if (env.APP_ENV === "production") return true;

  const isNextProductionBuild =
    process.env.NEXT_PHASE === "phase-production-build";

  return env.NODE_ENV === "production" && !isNextProductionBuild;
}

export function validateEnvValues(source: EnvSource = process.env): AppEnv {
  const env = readEnv(source);
  const result = shouldUseProductionValidation(env)
    ? productionEnvSchema.safeParse(env)
    : baseEnvSchema.safeParse(env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    const prefix = shouldUseProductionValidation(env)
      ? "Production environment validation failed"
      : "Environment validation failed";
    throw new Error(
      `${prefix}. Missing or invalid required env vars:\n${issues}`,
    );
  }

  return result.data;
}

export const env = validateEnvValues();
