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

describe("workspace IAM", () => {
	it("does not grant workspace member-management permissions", async () => {
		const { SYSTEM_ROLES } = await import("@/server/domain/entities/iam");
		for (const role of SYSTEM_ROLES.filter(
			(item) => item.scopeType === "workspace",
		)) {
			expect(
				role.permissions.some((permission) =>
					matchesPermission(permission, "members.invite"),
				),
			).toBe(false);
			expect(
				role.permissions.some((permission) =>
					matchesPermission(permission, "members.remove"),
				),
			).toBe(false);
		}
	});

	it("keeps app-management permissions for hidden primary workspace access", async () => {
		const { SYSTEM_ROLES } = await import("@/server/domain/entities/iam");
		const ownerRole = SYSTEM_ROLES.find(
			(role) => role.name === "workspace.owner",
		);
		const adminRole = SYSTEM_ROLES.find(
			(role) => role.name === "workspace.admin",
		);
		const requiredPermissions = [
			"providers.viewMetadata",
			"apiKeys.manage",
			"agents.chat",
			"tools.executeRestricted",
		];

		for (const requiredPermission of requiredPermissions) {
			expect(
				ownerRole?.permissions.some((permission) =>
					matchesPermission(permission, requiredPermission),
				),
			).toBe(true);
			expect(
				adminRole?.permissions.some((permission) =>
					matchesPermission(permission, requiredPermission),
				),
			).toBe(true);
		}
	});
});
