import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { toolInvocations } from "@/server/infrastructure/db/schema";

const paramsSchema = z.object({ invocationId: z.uuid() });

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ invocationId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = paramsSchema.safeParse(await params);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const [invocation] = await db
      .select()
      .from(toolInvocations)
      .where(eq(toolInvocations.id, parsed.data.invocationId))
      .limit(1);

    if (!invocation) {
      return NextResponse.json(
        { error: "Invocation not found" },
        { status: 404 },
      );
    }

    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "tools.executeRestricted",
      "workspace",
      invocation.workspaceId,
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    if (invocation.status !== "awaiting_approval") {
      return NextResponse.json(
        { error: "Invocation is not awaiting approval" },
        { status: 409 },
      );
    }

    await db
      .update(toolInvocations)
      .set({
        status: "rejected",
        errorMessage: "Rejected by user",
        approvedByUserId: session.user.id,
        completedAt: new Date(),
      })
      .where(eq(toolInvocations.id, invocation.id));

    await audit.emit({
      workspaceId: invocation.workspaceId,
      actorPrincipalType: "user",
      actorPrincipalId: session.user.id,
      action: "toolInvocation.rejected",
      resourceType: "tool_invocation",
      resourceId: invocation.id,
      outcome: "success",
      metadata: {
        toolName: invocation.toolName,
        toolSource: invocation.toolSource,
      },
    });

    return NextResponse.json({ ok: true, status: "rejected" });
  } catch (error) {
    logHandledError("Failed to reject tool invocation", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
