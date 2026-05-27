import { afterEach, describe, expect, it } from "vitest";

import {
	getQuotaStatus,
	getWorkspaceMonthlyTokenLimit,
} from "@/modules/usage/quota-config";

describe("workspace token quota", () => {
	afterEach(() => {
		delete process.env.WORKSPACE_MONTHLY_TOKEN_LIMIT;
	});

	it("returns null when limit env is unset", () => {
		expect(getWorkspaceMonthlyTokenLimit()).toBeNull();
	});

	it("parses a positive integer limit from env", () => {
		process.env.WORKSPACE_MONTHLY_TOKEN_LIMIT = "1000000";
		expect(getWorkspaceMonthlyTokenLimit()).toBe(1_000_000);
	});

	it("flags warning above 80 percent usage", () => {
		expect(getQuotaStatus(850_000, 1_000_000)).toMatchObject({
			warning: true,
			exceeded: false,
			percent: 85,
		});
	});

	it("flags exceeded at limit", () => {
		expect(getQuotaStatus(1_000_000, 1_000_000)).toMatchObject({
			warning: true,
			exceeded: true,
			percent: 100,
		});
	});
});
