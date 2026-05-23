import { beforeAll, describe, expect, it } from "vitest";

let validateEnvValues: (
	source?: Record<string, string | undefined>,
) => unknown;

const validEnv = {
	NODE_ENV: "development",
	BETTER_AUTH_SECRET: "test-secret",
	BETTER_AUTH_URL: "http://localhost:3000",
	BETTER_AUTH_TRUSTED_ORIGINS: "http://localhost:3000",
	DATABASE_URL: "postgres://localhost/test",
	APP_ENCRYPTION_KEY:
		"0000000000000000000000000000000000000000000000000000000000000000",
	OBJECT_STORAGE_BUCKET: "test",
	OBJECT_STORAGE_ACCESS_KEY_ID: "test",
	OBJECT_STORAGE_SECRET_ACCESS_KEY: "test",
};

beforeAll(async () => {
	Object.assign(process.env, validEnv);
	({ validateEnvValues } = await import("@/lib/env"));
});

describe("env validation", () => {
	it("parses valid development env", () => {
		const result = validateEnvValues(validEnv) as { NODE_ENV: string };

		expect(result.NODE_ENV).toBe("development");
	});

	it("rejects malformed encryption keys in all environments", () => {
		expect(() =>
			validateEnvValues({
				...validEnv,
				APP_ENCRYPTION_KEY: "not-a-valid-key",
			}),
		).toThrow(/APP_ENCRYPTION_KEY/);
	});

	it("rejects production env with short auth secret", () => {
		expect(() =>
			validateEnvValues({
				...validEnv,
				NODE_ENV: "production",
				BETTER_AUTH_SECRET: "short",
				APP_ENCRYPTION_KEY:
					"1111111111111111111111111111111111111111111111111111111111111111",
				DRAGONFLY_PASSWORD: "safe-cache-password",
				OBJECT_STORAGE_ACCESS_KEY_ID: "prod-access-key",
				OBJECT_STORAGE_SECRET_ACCESS_KEY: "safe-storage-secret",
			}),
		).toThrow(/BETTER_AUTH_SECRET/);
	});

	it("rejects production env with all-zero encryption key", () => {
		expect(() =>
			validateEnvValues({
				...validEnv,
				NODE_ENV: "production",
				BETTER_AUTH_SECRET:
					"real-production-secret-minimum-32-characters",
				DRAGONFLY_PASSWORD: "safe-cache-password",
				OBJECT_STORAGE_ACCESS_KEY_ID: "prod-access-key",
				OBJECT_STORAGE_SECRET_ACCESS_KEY: "safe-storage-secret",
			}),
		).toThrow(/APP_ENCRYPTION_KEY/);
	});

	it("rejects production env with placeholder infrastructure secrets", () => {
		expect(() =>
			validateEnvValues({
				...validEnv,
				NODE_ENV: "production",
				BETTER_AUTH_SECRET:
					"real-production-secret-minimum-32-characters",
				APP_ENCRYPTION_KEY:
					"1111111111111111111111111111111111111111111111111111111111111111",
				DRAGONFLY_PASSWORD: "minioadmin-password",
				OBJECT_STORAGE_ACCESS_KEY_ID: "minioadmin",
				OBJECT_STORAGE_SECRET_ACCESS_KEY: "minioadmin-password",
			}),
		).toThrow(/placeholder/);
	});

	it("rejects missing required fields", () => {
		expect(() => validateEnvValues({})).toThrow(
			/Missing or invalid required env vars/,
		);
	});
});
