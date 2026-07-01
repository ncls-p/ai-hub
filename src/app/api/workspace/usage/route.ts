import { and, desc, eq, gte, lte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  getWorkspaceMonthlyTokenLimit,
  getWorkspaceMonthlyTokenUsage,
} from "@/modules/usage/quota";
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
  return handleRoute(
    req,
    async ({ session }) => {
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

      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "usage.view",
      );
      if (forbidden) return forbidden;

      const filters = [eq(usageEvents.workspaceId, parsed.data.workspaceId)];
      if (parsed.data.operation)
        filters.push(eq(usageEvents.operation, parsed.data.operation));
      if (parsed.data.from)
        filters.push(gte(usageEvents.createdAt, new Date(parsed.data.from)));
      if (parsed.data.to)
        filters.push(lte(usageEvents.createdAt, new Date(parsed.data.to)));

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
      const monthlyUsed = await getWorkspaceMonthlyTokenUsage(
        parsed.data.workspaceId,
      );

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
    },
    { logLabel: "Failed to list usage events" },
  );
}
