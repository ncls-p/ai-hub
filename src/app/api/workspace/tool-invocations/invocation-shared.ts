import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { toolInvocations } from "@/server/infrastructure/db/schema";

export const invocationParamsSchema = z.object({ invocationId: z.uuid() });

/**
 * Validate session, parse invocation params, load the invocation,
 * and check that it's awaiting approval.
 *
 * Returns the invocation on success, or a NextResponse on failure.
 */
export async function loadPendingInvocation(
  params: Promise<{ invocationId: string }>,
): Promise<
  | { ok: true; invocation: typeof toolInvocations.$inferSelect }
  | { ok: false; response: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const parsed = invocationParamsSchema.safeParse(await params);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid request" },
        { status: 400 },
      ),
    };
  }

  const [invocation] = await db
    .select()
    .from(toolInvocations)
    .where(eq(toolInvocations.id, parsed.data.invocationId))
    .limit(1);

  if (!invocation) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invocation not found" },
        { status: 404 },
      ),
    };
  }

  const permission = await authorization.requirePermission(
    { principalType: "user", principalId: session.user.id },
    "tools.executeRestricted",
    "workspace",
    invocation.workspaceId,
  );
  if (!permission.granted) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      ),
    };
  }

  if (invocation.status !== "awaiting_approval") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invocation is not awaiting approval" },
        { status: 409 },
      ),
    };
  }

  return { ok: true, invocation };
}
