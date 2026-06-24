import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { auditEvents, users } from "@/server/infrastructure/db/schema";

const querySchema = z.object({
  workspaceId: z.uuid(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  action: z.string().max(128).optional(),
  outcome: z.enum(["success", "failed", "denied"]).optional(),
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
      action: searchParams.get("action") ?? undefined,
      outcome: searchParams.get("outcome") ?? undefined,
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
      "audit.view",
      "workspace",
      parsed.data.workspaceId,
    );
    if (!permission.granted)
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    const filters = [eq(auditEvents.workspaceId, parsed.data.workspaceId)];
    if (parsed.data.action) {
      filters.push(eq(auditEvents.action, parsed.data.action));
    }
    if (parsed.data.outcome) {
      filters.push(eq(auditEvents.outcome, parsed.data.outcome));
    }
    if (parsed.data.from) {
      filters.push(gte(auditEvents.createdAt, new Date(parsed.data.from)));
    }
    if (parsed.data.to) {
      filters.push(lte(auditEvents.createdAt, new Date(parsed.data.to)));
    }
    const events = await db
      .select()
      .from(auditEvents)
      .where(and(...filters))
      .orderBy(desc(auditEvents.createdAt))
      .limit(parsed.data.limit);

    const actorIds = [
      ...new Set(
        events
          .map((event) => event.actorPrincipalId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const actorRows =
      actorIds.length > 0
        ? await db
            .select({
              id: users.id,
              name: users.name,
              email: users.email,
            })
            .from(users)
            .where(inArray(users.id, actorIds))
        : [];

    const actorsById = new Map(actorRows.map((row) => [row.id, row]));

    return NextResponse.json(
      events.map((event) => {
        const actor = event.actorPrincipalId
          ? actorsById.get(event.actorPrincipalId)
          : null;
        return {
          ...event,
          actorName: actor?.name ?? null,
          actorEmail: actor?.email ?? null,
        };
      }),
    );
  } catch (error) {
    logHandledError("Failed to list audit events", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
