import { describe, expect, it, beforeEach } from "vitest";
import {
	normalizeGitHubPrivateKey,
	parseGitHubState,
	createGitHubState,
	describeGitHubRepositoryAccess,
	describeGitHubRepositoryRelationship,
	canAttemptGitHubRepositoryPublish,
} from "@/modules/github/publishing";

// Set required env vars for github publishing
beforeEach(() => {
	process.env.GITHUB_APP_ID = "12345";
	process.env.GITHUB_APP_SLUG = "test-app";
	process.env.GITHUB_APP_PRIVATE_KEY =
		"-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy0AHB7MaU8xKwwKU9M\nY1MnBhMaT2xhK4k5L6s0Tq7H3f0x0Y3VS5JJcds3xfn/ygWyF8PbnGy0AHB7\n-----END RSA PRIVATE KEY-----";
	process.env.APP_ENCRYPTION_KEY =
		"0000000000000000000000000000000000000000000000000000000000000000";
});

describe("normalizeGitHubPrivateKey", () => {
	it("returns clean PEM when already clean", () => {
		const pem =
			"-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----";
		const result = normalizeGitHubPrivateKey(pem);
		expect(result).toContain("-----BEGIN RSA PRIVATE KEY-----");
		expect(result).toContain("-----END RSA PRIVATE KEY-----");
	});

	it("strips export prefix", () => {
		const raw =
			"export GITHUB_APP_PRIVATE_KEY='-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----'";
		const result = normalizeGitHubPrivateKey(raw);
		expect(result).toContain("-----BEGIN RSA PRIVATE KEY-----");
		expect(result).not.toContain("export");
		expect(result).not.toContain("GITHUB_APP_PRIVATE_KEY");
	});

	it("strips variable prefix", () => {
		const raw =
			"GITHUB_APP_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----";
		const result = normalizeGitHubPrivateKey(raw);
		expect(result).toContain("-----BEGIN RSA PRIVATE KEY-----");
		expect(result).not.toContain("GITHUB_APP_PRIVATE_KEY");
	});

	it("handles escaped newlines", () => {
		const raw =
			"-----BEGIN RSA PRIVATE KEY-----\\nMIIEpAIBAAKCAQEA\\n-----END RSA PRIVATE KEY-----";
		const result = normalizeGitHubPrivateKey(raw);
		expect(result).toContain("-----BEGIN RSA PRIVATE KEY-----");
	});

	it("strips trailing percent sign", () => {
		const raw =
			"-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----%";
		const result = normalizeGitHubPrivateKey(raw);
		expect(result).not.toContain("%");
	});

	it("unwraps single quotes", () => {
		const raw =
			"'-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----'";
		const result = normalizeGitHubPrivateKey(raw);
		expect(result).not.toContain("'");
	});

	it("unwraps double quotes", () => {
		const raw =
			'"-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----"';
		const result = normalizeGitHubPrivateKey(raw);
		expect(result).not.toContain('"');
	});

	it("re-wraps body to 64-char lines", () => {
		const raw =
			"-----BEGIN RSA PRIVATE KEY-----\nABCD\n-----END RSA PRIVATE KEY-----";
		const result = normalizeGitHubPrivateKey(raw);
		expect(result).toContain("-----BEGIN RSA PRIVATE KEY-----");
		expect(result).toContain("\nABCD\n");
	});
});

describe("parseGitHubState", () => {
	it("parses valid state", () => {
		const state = createGitHubState({
			userId: "user-123",
			workspaceId: "ws-456",
		});
		const result = parseGitHubState(state);
		expect(result.userId).toBe("user-123");
		expect(result.workspaceId).toBe("ws-456");
	});

	it("throws on invalid state format", () => {
		expect(() => parseGitHubState("noperiod")).toThrow("Invalid GitHub state");
	});

	it("throws on tampered signature", () => {
		const state = createGitHubState({
			userId: "user-123",
			workspaceId: "ws-456",
		});
		const tampered = state.split(".")[0] + ".badsignature";
		expect(() => parseGitHubState(tampered)).toThrow(
			"Invalid GitHub state signature",
		);
	});
});

describe("describeGitHubRepositoryAccess", () => {
	it("returns admin when admin permission", () => {
		expect(describeGitHubRepositoryAccess({ admin: true })).toBe("admin");
	});

	it("returns maintain when maintain permission", () => {
		expect(describeGitHubRepositoryAccess({ maintain: true })).toBe("maintain");
	});

	it("returns write when push permission", () => {
		expect(describeGitHubRepositoryAccess({ push: true })).toBe("write");
	});

	it("returns triage when triage permission", () => {
		expect(describeGitHubRepositoryAccess({ triage: true })).toBe("triage");
	});

	it("returns read when pull permission", () => {
		expect(describeGitHubRepositoryAccess({ pull: true })).toBe("read");
	});

	it("returns unknown for null permissions", () => {
		expect(describeGitHubRepositoryAccess(null)).toBe("unknown");
	});

	it("returns unknown when no recognized permission", () => {
		expect(describeGitHubRepositoryAccess({ other: true })).toBe("unknown");
	});
});

describe("describeGitHubRepositoryRelationship", () => {
	it("returns account when matching owner", () => {
		expect(
			describeGitHubRepositoryRelationship({
				accountLogin: "deodis",
				owner: "deodis",
			}),
		).toBe("account");
	});

	it("returns account when case-insensitive match", () => {
		expect(
			describeGitHubRepositoryRelationship({
				accountLogin: "Deodis",
				owner: "DEODIS",
			}),
		).toBe("account");
	});

	it("returns collaborator when different owner", () => {
		expect(
			describeGitHubRepositoryRelationship({
				accountLogin: "deodis",
				owner: "other",
			}),
		).toBe("collaborator");
	});

	it("returns collaborator when null account login", () => {
		expect(
			describeGitHubRepositoryRelationship({
				accountLogin: null,
				owner: "deodis",
			}),
		).toBe("collaborator");
	});
});

describe("canAttemptGitHubRepositoryPublish", () => {
	it("returns true for admin", () => {
		expect(canAttemptGitHubRepositoryPublish({ admin: true })).toBe(true);
	});

	it("returns true for write", () => {
		expect(canAttemptGitHubRepositoryPublish({ push: true })).toBe(true);
	});

	it("returns true for maintain", () => {
		expect(canAttemptGitHubRepositoryPublish({ maintain: true })).toBe(true);
	});

	it("returns true for unknown (null permissions)", () => {
		expect(canAttemptGitHubRepositoryPublish(null)).toBe(true);
	});

	it("returns false for read-only", () => {
		expect(canAttemptGitHubRepositoryPublish({ pull: true })).toBe(false);
	});

	it("returns false for triage", () => {
		expect(canAttemptGitHubRepositoryPublish({ triage: true })).toBe(false);
	});
});
