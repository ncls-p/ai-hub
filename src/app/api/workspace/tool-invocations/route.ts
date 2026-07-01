import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { decryptValue } from "@/lib/crypto";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
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
  return handleRoute(
    req,
    async ({ session }) => {
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

      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "tools.view",
      );
      if (forbidden) return forbidden;

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
    },
    { logLabel: "Failed to list tool invocations" },
  );
}
