import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
  archiveKnowledgeBase,
  getKnowledgeBase,
  updateKnowledgeBase,
} from "@/modules/knowledge/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const querySchema = z.object({ workspaceId: z.uuid() });
const updateSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2048).optional(),
});
async function ensure(
  userId: string,
  workspaceId: string,
  permissionName: string,
) {
  return authorization.requirePermission(
    { principalType: "user", principalId: userId },
    permissionName,
    "workspace",
    workspaceId,
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ knowledgeBaseId: string }> },
) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = querySchema.safeParse({
      workspaceId: new URL(req.url).searchParams.get("workspaceId"),
    });
    if (!parsed.success)
      return NextResponse.json(
        { error: "workspaceId must be a valid UUID" },
        { status: 400 },
      );
    const permission = await ensure(
      session.user.id,
      parsed.data.workspaceId,
      "knowledgeBases.viewAllowed",
    );
    if (!permission.granted)
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    const { knowledgeBaseId } = await params;
    const knowledgeBase = await getKnowledgeBase(
      knowledgeBaseId,
      parsed.data.workspaceId,
    );
    if (!knowledgeBase)
      return NextResponse.json(
        { error: "Knowledge base not found" },
        { status: 404 },
      );
    return NextResponse.json(knowledgeBase);
  } catch (error) {
    logHandledError("Failed to get knowledge base", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ knowledgeBaseId: string }> },
) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
        { status: 400 },
      );
    const permission = await ensure(
      session.user.id,
      parsed.data.workspaceId,
      "knowledgeBases.manage",
    );
    if (!permission.granted)
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    const { knowledgeBaseId } = await params;
    return NextResponse.json(
      await updateKnowledgeBase({
        knowledgeBaseId,
        userId: session.user.id,
        ...parsed.data,
      }),
    );
  } catch (error) {
    logHandledError("Failed to update knowledge base", {}, error as Error);
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ knowledgeBaseId: string }> },
) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = querySchema.safeParse({
      workspaceId: new URL(req.url).searchParams.get("workspaceId"),
    });
    if (!parsed.success)
      return NextResponse.json(
        { error: "workspaceId must be a valid UUID" },
        { status: 400 },
      );
    const permission = await ensure(
      session.user.id,
      parsed.data.workspaceId,
      "knowledgeBases.manage",
    );
    if (!permission.granted)
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    const { knowledgeBaseId } = await params;
    await archiveKnowledgeBase(
      knowledgeBaseId,
      parsed.data.workspaceId,
      session.user.id,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    logHandledError("Failed to archive knowledge base", {}, error as Error);
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
