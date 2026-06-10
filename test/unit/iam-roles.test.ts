import { describe, expect, it } from "vitest";
import { SYSTEM_ROLES } from "@/server/domain/entities/iam";

describe("SYSTEM_ROLES", () => {
	it("defines at least one organization and workspace scope role", () => {
		const orgRoles = SYSTEM_ROLES.filter((r) => r.scopeType === "organization");
		const wsRoles = SYSTEM_ROLES.filter((r) => r.scopeType === "workspace");
		expect(orgRoles.length).toBeGreaterThan(0);
		expect(wsRoles.length).toBeGreaterThan(0);
	});

	it("every role has required fields", () => {
		for (const role of SYSTEM_ROLES) {
			expect(role.name).toBeTruthy();
			expect(role.displayName).toBeTruthy();
			expect(Array.isArray(role.permissions)).toBe(true);
			expect(role.isSystem).toBe(true);
			expect(["organization", "workspace"]).toContain(role.scopeType);
		}
	});

	it("every role has at least one permission", () => {
		for (const role of SYSTEM_ROLES) {
			expect(role.permissions.length).toBeGreaterThan(0);
		}
	});

	it("workspace.owner has broad wildcard permissions", () => {
		const owner = SYSTEM_ROLES.find((r) => r.name === "workspace.owner");
		expect(owner).toBeDefined();
		expect(owner!.permissions).toContain("workspace.*");
		expect(owner!.permissions).toContain("members.*");
	});

	it("workspace.member has restricted permissions", () => {
		const member = SYSTEM_ROLES.find((r) => r.name === "workspace.member");
		expect(member).toBeDefined();
		expect(member!.permissions).not.toContain("members.*");
		expect(member!.permissions).not.toContain("providers.*");
	});

	it("organization.owner has org-level wildcard permissions", () => {
		const owner = SYSTEM_ROLES.find((r) => r.name === "organization.owner");
		expect(owner).toBeDefined();
		expect(owner!.scopeType).toBe("organization");
		expect(owner!.permissions.some((p) => p.endsWith(".*"))).toBe(true);
	});

	it("role names are unique", () => {
		const names = SYSTEM_ROLES.map((r) => r.name);
		const unique = new Set(names);
		expect(unique.size).toBe(names.length);
	});

	it("workspace.viewer cannot manage members", () => {
		const viewer = SYSTEM_ROLES.find((r) => r.name === "workspace.viewer");
		expect(viewer).toBeDefined();
		expect(viewer!.permissions).not.toContain("members.*");
		expect(viewer!.permissions).not.toContain("members.invite");
	});
});
