import { beforeAll, describe, expect, it } from "vitest";

let matchesPermission: (
	grantedPermission: string,
	requiredPermission: string,
) => boolean;

beforeAll(async () => {
	process.env.APP_ENCRYPTION_KEY =
		"0000000000000000000000000000000000000000000000000000000000000000";
	process.env.APP_ENCRYPTION_KEY_ID = "default";
	process.env.BETTER_AUTH_SECRET = "test-secret-min-32-chars-long";
	process.env.BETTER_AUTH_URL = "http://localhost:3000";
	process.env.BETTER_AUTH_TRUSTED_ORIGINS = "http://localhost:3000";
	process.env.DATABASE_URL = "postgres://localhost/test";
	process.env.OBJECT_STORAGE_BUCKET = "test";
	process.env.OBJECT_STORAGE_ACCESS_KEY_ID = "test";
	process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY = "test";

	({ matchesPermission } = await import(
		"@/server/domain/services/authorization"
	));
});

describe("permission matching", () => {
	it("matches exact permission", () => {
		expect(matchesPermission("agents.create", "agents.create")).toBe(true);
	});

	it("matches wildcard grants", () => {
		expect(matchesPermission("agents.*", "agents.create")).toBe(true);
		expect(matchesPermission("agents.*", "agents.delete")).toBe(true);
	});

	it("matches manage grants for domain actions", () => {
		expect(matchesPermission("agents.manage", "agents.create")).toBe(true);
		expect(matchesPermission("agents.manage", "agents.delete")).toBe(true);
	});

	it("does not let a specific grant satisfy a wildcard requirement", () => {
		expect(matchesPermission("agents.create", "agents.*")).toBe(false);
	});

	it("does not match different domains", () => {
		expect(matchesPermission("agents.create", "providers.create")).toBe(false);
	});

	it("does not match specific to specific when different", () => {
		expect(matchesPermission("agents.create", "agents.delete")).toBe(false);
	});

	it("lets marketplace wildcard cover marketplace item actions", () => {
		expect(matchesPermission("marketplace.*", "marketplaceItems.install")).toBe(
			true,
		);
	});

	it("normalizes legacy workspace/audit permission domains", () => {
		expect(matchesPermission("workspace.*", "members.invite")).toBe(true);
		expect(matchesPermission("workspace.*", "apiKeys.manage")).toBe(true);
		expect(matchesPermission("workspaces.get", "workspace.get")).toBe(true);
		expect(matchesPermission("auditLogs.view", "audit.view")).toBe(true);
	});

	it("treats workspace admin and owner markers as workspace-wide grants", () => {
		expect(matchesPermission("workspace.admin", "providers.delete")).toBe(true);
		expect(
			matchesPermission("workspace.admin", "tools.executeRestricted"),
		).toBe(true);
		expect(matchesPermission("workspace.owner", "members.remove")).toBe(true);
	});

	it("lets view grants satisfy read-oriented actions", () => {
		expect(matchesPermission("tools.view", "tools.get")).toBe(true);
		expect(matchesPermission("tools.view", "tools.configure")).toBe(false);
	});

	it("handles granted permissions without an action as domain wildcards", () => {
		expect(matchesPermission("agents", "agents.create")).toBe(true);
		expect(matchesPermission("agents", "agents")).toBe(true);
	});
});
