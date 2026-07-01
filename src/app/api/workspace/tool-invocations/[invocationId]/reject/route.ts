import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import { toolInvocations } from "@/server/infrastructure/db/schema";
import { invocationParamsSchema } from "../../invocation-shared";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ invocationId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = invocationParamsSchema.safeParse(await params);
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
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        invocation.workspaceId,
        "tools.executeRestricted",
      );
      if (forbidden) return forbidden;
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
    },
    { logLabel: "Failed to reject tool invocation" },
  );
}
