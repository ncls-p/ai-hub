import { and, desc, eq, gte, lte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
	getWorkspaceMonthlyTokenLimit,
	getWorkspaceMonthlyTokenUsage,
} from "@/modules/usage/quota";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { usageEvents } from "@/server/infrastructure/db/schema";

const querySchema = z.object({
	workspaceId: z.uuid(),
	limit: z.coerce.number().int().min(1).max(500).default(100),
	operation: z.string().max(64).optional(),
	from: z.iso.datetime().optional(),
	to: z.iso.datetime().optional(),
});

export async function GET(req: NextRequest) {
	try {
		const session = await getSession();
		if (!session)
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		const { searchParams } = new URL(req.url);
		const parsed = querySchema.safeParse({
			workspaceId: searchParams.get("workspaceId"),
			limit: searchParams.get("limit") ?? undefined,
			operation: searchParams.get("operation") ?? undefined,
			from: searchParams.get("from") ?? undefined,
			to: searchParams.get("to") ?? undefined,
		});
		if (!parsed.success)
			return NextResponse.json(
				{ error: "Invalid input", details: parsed.error.issues },
				{ status: 400 },
			);
		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"usage.view",
			"workspace",
			parsed.data.workspaceId,
		);
		if (!permission.granted)
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		const filters = [eq(usageEvents.workspaceId, parsed.data.workspaceId)];
		if (parsed.data.operation) {
			filters.push(eq(usageEvents.operation, parsed.data.operation));
		}
		if (parsed.data.from) {
			filters.push(gte(usageEvents.createdAt, new Date(parsed.data.from)));
		}
		if (parsed.data.to) {
			filters.push(lte(usageEvents.createdAt, new Date(parsed.data.to)));
		}
		const events = await db
			.select()
			.from(usageEvents)
			.where(and(...filters))
			.orderBy(desc(usageEvents.createdAt))
			.limit(parsed.data.limit);
		const totals = events.reduce(
			(acc, event) => ({
				inputTokens: acc.inputTokens + (event.inputTokens ?? 0),
				outputTokens: acc.outputTokens + (event.outputTokens ?? 0),
				events: acc.events + 1,
			}),
			{ inputTokens: 0, outputTokens: 0, events: 0 },
		);
		const monthlyLimit = getWorkspaceMonthlyTokenLimit();
		const monthlyUsed = await getWorkspaceMonthlyTokenUsage(parsed.data.workspaceId);
		return NextResponse.json({
			totals,
			events,
			quota: monthlyLimit
				? {
						limit: monthlyLimit,
						used: monthlyUsed,
						remaining: Math.max(0, monthlyLimit - monthlyUsed),
					}
				: null,
		});
	} catch (error) {
		logger.error("Failed to list usage events", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
