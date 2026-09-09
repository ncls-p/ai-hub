import { beforeEach, expect } from "vitest";

// A test that never reaches an assertion must not silently pass.
beforeEach(() => expect.hasAssertions());

const testEnv = {
  NODE_ENV: "test",
  BETTER_AUTH_SECRET: "test-secret-for-unit-tests",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_TRUSTED_ORIGINS: "http://localhost:3000",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/ai_hub_test",
  APP_ENCRYPTION_KEY:
    "0000000000000000000000000000000000000000000000000000000000000000",
  APP_ENCRYPTION_KEY_ID: "test",
  OBJECT_STORAGE_BUCKET: "test-bucket",
  OBJECT_STORAGE_ACCESS_KEY_ID: "test-access-key",
  OBJECT_STORAGE_SECRET_ACCESS_KEY: "test-secret-key",
  SEARXNG_URL: "http://localhost:18088",
  MCP_GATEWAY_SHARED_SECRET: "test-mcp-gateway-shared-secret",
} satisfies Record<string, string>;

for (const [key, value] of Object.entries(testEnv)) {
  process.env[key] ??= value;
}
