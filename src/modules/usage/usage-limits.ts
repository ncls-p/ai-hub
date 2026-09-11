import { and, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  teamMembers,
  teams,
  usageLimits,
  usageLimitCharges,
  workspaces,
} from "@/server/infrastructure/db/schema";
export type UsageLimitContext = {
  userId: string;
  workspaceId: string;
  providerId: string;
  modelId: string | null;
};
export class UsageLimitExceededError extends Error {
  readonly statusCode = 429;
  readonly code = "USAGE_LIMIT_EXCEEDED";
  readonly isRetryable = false;
  constructor(
    readonly limitId: string,
    metric: string,
  ) {
    super(`Usage limit reached (${metric}). Contact your administrator.`);
    this.name = "UsageLimitExceededError";
  }
}
export function usagePeriodStart(period: string, now = new Date()) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  if (period === "month") start.setUTCDate(1);
  return start;
}
export function exceedsUsageLimit(
  input: { tokens: number; requests: number; costUsd: number },
  limit: {
    tokenLimit: number | null;
    requestLimit: number | null;
    costLimitUsd: string | null;
  },
) {
  if (limit.tokenLimit !== null && input.tokens > limit.tokenLimit)
    return "tokens";
  if (limit.requestLimit !== null && input.requests > limit.requestLimit)
    return "requests";
  if (
    limit.costLimitUsd !== null &&
    input.costUsd > Number(limit.costLimitUsd) + 1e-9
  )
    return "cost";
  return null;
}
export async function reserveUsageLimits(
  context: UsageLimitContext,
  estimate: { tokens: number | null; costUsd: number | null },
) {
  const [workspace] = await db
    .select({ organizationId: workspaces.organizationId })
    .from(workspaces)
    .where(eq(workspaces.id, context.workspaceId))
    .limit(1);
  const memberships = workspace
    ? await db
        .select({ id: teamMembers.teamId })
        .from(teamMembers)
        .innerJoin(teams, eq(teams.id, teamMembers.teamId))
        .where(
          and(
            eq(teamMembers.userId, context.userId),
            eq(teams.organizationId, workspace.organizationId),
          ),
        )
    : [];
  const invocationId = crypto.randomUUID();
  return db.transaction(async (tx) => {
    // Deterministic row locking serializes admission across all app/worker instances.
    const limits = await tx
      .select()
      .from(usageLimits)
      .where(
        and(
          or(
            and(
              eq(usageLimits.subjectType, "user"),
              eq(usageLimits.subjectId, context.userId),
            ),
            workspace
              ? and(
                  eq(usageLimits.subjectType, "organization"),
                  eq(usageLimits.subjectId, workspace.organizationId),
                )
              : undefined,
            memberships.length
              ? and(
                  eq(usageLimits.subjectType, "team"),
                  inArray(
                    usageLimits.subjectId,
                    memberships.map((row) => row.id),
                  ),
                )
              : undefined,
          ),
          or(
            isNull(usageLimits.providerId),
            eq(usageLimits.providerId, context.providerId),
          ),
          or(
            isNull(usageLimits.modelId),
            context.modelId
              ? eq(usageLimits.modelId, context.modelId)
              : undefined,
          ),
        ),
      )
      .orderBy(usageLimits.id)
      .for("update");
    for (const limit of limits) {
      if (limit.tokenLimit !== null && estimate.tokens === null)
        throw new UsageLimitExceededError(
          limit.id,
          "model context window is required for a multimodal token limit",
        );
      if (limit.costLimitUsd !== null && estimate.costUsd === null)
        throw new UsageLimitExceededError(
          limit.id,
          "model pricing is required for a cost limit",
        );
      const [used] = await tx
        .select({
          tokens: sql<number>`coalesce(sum(${usageLimitCharges.tokens}),0)`,
          requests: sql<number>`count(*)`,
          cost: sql<string>`coalesce(sum(${usageLimitCharges.costUsd}),0)`,
        })
        .from(usageLimitCharges)
        .where(
          and(
            eq(usageLimitCharges.limitId, limit.id),
            gte(usageLimitCharges.createdAt, usagePeriodStart(limit.period)),
          ),
        );
      const metric = exceedsUsageLimit(
        {
          tokens: Number(used.tokens) + (estimate.tokens ?? 0),
          requests: Number(used.requests) + 1,
          costUsd: Number(used.cost) + (estimate.costUsd ?? 0),
        },
        limit,
      );
      if (metric) throw new UsageLimitExceededError(limit.id, metric);
      await tx.insert(usageLimitCharges).values({
        limitId: limit.id,
        invocationId,
        userId: context.userId,
        tokens: estimate.tokens ?? 0,
        costUsd: String(estimate.costUsd ?? 0),
      });
    }
    return limits.length ? invocationId : null;
  });
}
export async function settleUsageLimits(
  invocationId: string | null,
  usage?: { tokens: number; costUsd: number | null },
) {
  if (!invocationId) return;
  await db
    .update(usageLimitCharges)
    .set({
      status: "settled",
      ...(usage
        ? {
            tokens: usage.tokens,
            ...(usage.costUsd === null
              ? {}
              : { costUsd: String(usage.costUsd) }),
          }
        : {}),
    })
    .where(
      and(
        eq(usageLimitCharges.invocationId, invocationId),
        eq(usageLimitCharges.status, "reserved"),
      ),
    );
}
