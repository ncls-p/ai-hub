import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { decryptValue } from "@/lib/crypto";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { db } from "@/server/infrastructure/db";
import { toolInvocations } from "@/server/infrastructure/db/schema";

import { invocationParamsSchema } from "../invocation-shared";

const querySchema = z.object({ workspaceId: z.uuid() });

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ invocationId: string }> },
) {
  return handleRoute(
    req,
    async ({ session, request }) => {
      const parsedParams = invocationParamsSchema.safeParse(await params);
      const { searchParams } = new URL(request.url);
      const parsedQuery = querySchema.safeParse({
        workspaceId: searchParams.get("workspaceId"),
      });
      if (!parsedParams.success || !parsedQuery.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }

      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsedQuery.data.workspaceId,
        "tools.view",
      );
      if (forbidden) return forbidden;

      const [invocation] = await db
        .select()
        .from(toolInvocations)
        .where(
          and(
            eq(toolInvocations.id, parsedParams.data.invocationId),
            eq(toolInvocations.workspaceId, parsedQuery.data.workspaceId),
          ),
        )
        .limit(1);

      if (!invocation) {
        return NextResponse.json(
          { error: "Invocation not found" },
          { status: 404 },
        );
      }

      let inputDecrypted: unknown = null;
      let outputDecrypted: unknown = null;

      if (invocation.inputJsonEncrypted) {
        try {
          inputDecrypted = JSON.parse(
            await decryptValue(invocation.inputJsonEncrypted),
          );
        } catch {
          inputDecrypted = "[decryption failed]";
        }
      }

      if (invocation.outputJsonEncrypted) {
        try {
          outputDecrypted = JSON.parse(
            await decryptValue(invocation.outputJsonEncrypted),
          );
        } catch {
          outputDecrypted = "[decryption failed]";
        }
      }

      return NextResponse.json({
        id: invocation.id,
        workspaceId: invocation.workspaceId,
        conversationId: invocation.conversationId,
        messageId: invocation.messageId,
        toolSource: invocation.toolSource,
        toolId: invocation.toolId,
        toolName: invocation.toolName,
        riskLevel: invocation.riskLevel,
        input: inputDecrypted,
        output: outputDecrypted,
        status: invocation.status,
        latencyMs: invocation.latencyMs,
        errorMessage: invocation.errorMessage,
        approvedByUserId: invocation.approvedByUserId,
        createdAt: invocation.createdAt,
        completedAt: invocation.completedAt,
      });
    },
    { logLabel: "Failed to get tool invocation" },
  );
}
