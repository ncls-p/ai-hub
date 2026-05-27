import { and, eq, gte, sql } from "drizzle-orm";

import {
	getWorkspaceMonthlyTokenLimit,
} from "@/modules/usage/quota-config";
import { db } from "@/server/infrastructure/db";
import { usageEvents } from "@/server/infrastructure/db/schema";

export { getQuotaStatus, getWorkspaceMonthlyTokenLimit } from "@/modules/usage/quota-config";

function startOfCurrentMonth() {
	const date = new Date();
	date.setUTCDate(1);
	date.setUTCHours(0, 0, 0, 0);
	return date;
}

export async function getWorkspaceMonthlyTokenUsage(workspaceId: string) {
	const [result] = await db
		.select({
			total: sql<number>`coalesce(sum(coalesce(${usageEvents.inputTokens}, 0) + coalesce(${usageEvents.outputTokens}, 0)), 0)`,
		})
		.from(usageEvents)
		.where(
			and(
				eq(usageEvents.workspaceId, workspaceId),
				gte(usageEvents.createdAt, startOfCurrentMonth()),
			),
		);

	return Number(result?.total ?? 0);
}

export async function assertWorkspaceWithinTokenQuota(workspaceId: string) {
	const limit = getWorkspaceMonthlyTokenLimit();
	if (!limit) return { allowed: true as const };

	const used = await getWorkspaceMonthlyTokenUsage(workspaceId);
	if (used >= limit) {
		return {
			allowed: false as const,
			used,
			limit,
			message: `Monthly token limit reached (${used.toLocaleString()} / ${limit.toLocaleString()}). Contact your administrator or visit Usage for details.`,
		};
	}

	return { allowed: true as const, used, limit };
}
