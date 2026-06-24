import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { decryptValue } from "@/lib/crypto";
import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { toolInvocations } from "@/server/infrastructure/db/schema";

const querySchema = z.object({
  workspaceId: z.uuid(),
  status: z
    .enum([
      "awaiting_approval",
      "denied",
      "failed",
      "pending_approval",
      "rejected",
      "running",
      "success",
    ])
    .optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  conversationId: z.uuid().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      workspaceId: searchParams.get("workspaceId"),
      status: searchParams.get("status") ?? undefined,
      limit: searchParams.get("limit") ?? 50,
      conversationId: searchParams.get("conversationId") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "tools.view",
      "workspace",
      parsed.data.workspaceId,
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    const statusFilter = parsed.data.status
      ? eq(toolInvocations.status, parsed.data.status)
      : undefined;
    const conversationFilter = parsed.data.conversationId
      ? eq(toolInvocations.conversationId, parsed.data.conversationId)
      : undefined;
    const invocations = await db
      .select({
        id: toolInvocations.id,
        workspaceId: toolInvocations.workspaceId,
        conversationId: toolInvocations.conversationId,
        messageId: toolInvocations.messageId,
        toolSource: toolInvocations.toolSource,
        toolId: toolInvocations.toolId,
        toolName: toolInvocations.toolName,
        riskLevel: toolInvocations.riskLevel,
        inputJsonEncrypted: toolInvocations.inputJsonEncrypted,
        status: toolInvocations.status,
        latencyMs: toolInvocations.latencyMs,
        errorMessage: toolInvocations.errorMessage,
        approvedByUserId: toolInvocations.approvedByUserId,
        createdAt: toolInvocations.createdAt,
        completedAt: toolInvocations.completedAt,
      })
      .from(toolInvocations)
      .where(
        and(
          eq(toolInvocations.workspaceId, parsed.data.workspaceId),
          statusFilter,
          conversationFilter,
        ),
      )
      .orderBy(desc(toolInvocations.createdAt))
      .limit(parsed.data.limit);

    const response = await Promise.all(
      invocations.map(async ({ inputJsonEncrypted, ...invocation }) => {
        let input: unknown = null;
        if (inputJsonEncrypted) {
          try {
            input = JSON.parse(await decryptValue(inputJsonEncrypted));
          } catch {
            input = null;
          }
        }
        return { ...invocation, input };
      }),
    );

    return NextResponse.json(response);
  } catch (error) {
    logHandledError("Failed to list tool invocations", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
