import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { decryptValue } from "@/lib/crypto";
import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { toolInvocations } from "@/server/infrastructure/db/schema";

const paramsSchema = z.object({ invocationId: z.uuid() });
const querySchema = z.object({ workspaceId: z.uuid() });

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ invocationId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsedParams = paramsSchema.safeParse(await params);
    const { searchParams } = new URL(req.url);
    const parsedQuery = querySchema.safeParse({
      workspaceId: searchParams.get("workspaceId"),
    });
    if (!parsedParams.success || !parsedQuery.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "tools.view",
      "workspace",
      parsedQuery.data.workspaceId,
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

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

    // Decrypt input/output for the response
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
  } catch (error) {
    logHandledError("Failed to get tool invocation", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
