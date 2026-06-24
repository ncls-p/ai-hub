import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { searchKnowledgeBase } from "@/modules/knowledge/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const searchSchema = z.object({
  workspaceId: z.uuid(),
  query: z.string().min(1).max(512),
  limit: z.number().int().min(1).max(20).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ knowledgeBaseId: string }> },
) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = searchSchema.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
        { status: 400 },
      );
    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "knowledgeBases.viewAllowed",
      "workspace",
      parsed.data.workspaceId,
    );
    if (!permission.granted)
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    const { knowledgeBaseId } = await params;
    return NextResponse.json(
      await searchKnowledgeBase({ knowledgeBaseId, ...parsed.data }),
    );
  } catch (error) {
    logHandledError("Failed to search knowledge base", {}, error as Error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      {
        status:
          error instanceof Error && error.message.includes("not found")
            ? 404
            : 500,
      },
    );
  }
}
